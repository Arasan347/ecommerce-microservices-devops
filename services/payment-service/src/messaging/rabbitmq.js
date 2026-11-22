const amqp = require('amqplib');
const { randomUUID } = require('crypto');

const EXCHANGE_NAME = 'ecommerce.events';
const EXCHANGE_TYPE = 'topic';

class RabbitMQManager {
  constructor(serviceName = 'payment-service', options = {}) {
    this.serviceName = serviceName;
    this.connection = null;
    this.channel = null;
    this.url = options.url || process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.consumers = [];
    this.activeConsumers = new Map();
    this.isConnecting = false;
    this.isReconnecting = false;
    this.isClosing = false;
    this.shouldReconnect = true;

    this.initialRetryDelay = options.initialRetryDelay !== undefined ? options.initialRetryDelay : 1000;
    this.maxRetryDelay = options.maxRetryDelay !== undefined ? options.maxRetryDelay : 30000;
    this.backoffFactor = options.backoffFactor !== undefined ? options.backoffFactor : 2;
    this.maxConnectionRetries = options.maxConnectionRetries !== undefined
      ? options.maxConnectionRetries
      : (process.env.RABBITMQ_MAX_RETRIES ? parseInt(process.env.RABBITMQ_MAX_RETRIES, 10) : Infinity);

    this.reconnectTimer = null;
    this._wakeUpSleep = null;
  }

  calculateBackoffDelay(attempt) {
    const delay = this.initialRetryDelay * Math.pow(this.backoffFactor, attempt - 1);
    return Math.min(delay, this.maxRetryDelay);
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.reconnectTimer === timer) {
          this.reconnectTimer = null;
        }
        resolve();
      }, ms);
      this.reconnectTimer = timer;
      this._wakeUpSleep = () => {
        clearTimeout(timer);
        this.reconnectTimer = null;
        resolve();
      };
    });
  }

  async connect(overrideOptions = {}) {
    if (this.connection && this.channel) {
      return this.channel;
    }

    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (this.connection && this.channel) {
        return this.channel;
      }
    }

    this.isConnecting = true;

    const maxRetries = overrideOptions.maxRetries !== undefined
      ? overrideOptions.maxRetries
      : this.maxConnectionRetries;
    const retry = overrideOptions.retry !== undefined ? overrideOptions.retry : true;
    let attempt = 0;

    try {
      while (!this.isClosing && this.shouldReconnect) {
        attempt++;
        console.log(`[${this.serviceName}] Connecting to RabbitMQ at ${this.url}... (attempt ${attempt})`);

        try {
          this.connection = await amqp.connect(this.url);
          this.channel = await this.connection.createChannel();
          await this.channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

          this.setupConnectionListeners(this.connection);
          this.setupChannelListeners(this.channel);

          console.log(`[${this.serviceName}] Successfully connected to RabbitMQ (attempt ${attempt})`);
          this.isConnecting = false;

          await this.registerAllConsumers();
          return this.channel;
        } catch (error) {
          console.error(`[${this.serviceName}] RabbitMQ connection attempt ${attempt} failed: ${error.message}`);

          if (this.channel) {
            try { await this.channel.close(); } catch (_) {}
            this.channel = null;
          }
          if (this.connection) {
            try { await this.connection.close(); } catch (_) {}
            this.connection = null;
          }

          if (this.isClosing || !this.shouldReconnect || !retry || attempt >= maxRetries) {
            this.isConnecting = false;
            throw error;
          }

          const delay = this.calculateBackoffDelay(attempt);
          console.log(`[${this.serviceName}] Retrying connection in ${delay}ms... (attempt ${attempt + 1}/${maxRetries === Infinity ? '∞' : maxRetries})`);
          await this.sleep(delay);
        }
      }

      this.isConnecting = false;
      if (this.isClosing) {
        throw new Error(`[${this.serviceName}] RabbitMQ connection aborted due to shutdown`);
      }
      return this.channel;
    } catch (finalError) {
      this.isConnecting = false;
      throw finalError;
    }
  }

  setupConnectionListeners(connection) {
    connection.on('error', (err) => {
      console.error(`[${this.serviceName}] RabbitMQ error:`, err.message);
    });

    connection.on('close', () => {
      console.error(`[${this.serviceName}] RabbitMQ connection closed`);
      this.connection = null;
      this.channel = null;
      this.activeConsumers.clear();

      if (this.shouldReconnect && !this.isClosing) {
        this.reconnect();
      }
    });
  }

  setupChannelListeners(channel) {
    channel.on('error', (err) => {
      console.error(`[${this.serviceName}] RabbitMQ channel error:`, err.message);
    });

    channel.on('close', () => {
      console.error(`[${this.serviceName}] RabbitMQ channel closed`);
      this.channel = null;
      this.activeConsumers.clear();

      if (this.shouldReconnect && !this.isClosing && !this.isConnecting && !this.isReconnecting) {
        if (this.connection) {
          this.recreateChannel();
        } else {
          this.reconnect();
        }
      }
    });
  }

  async recreateChannel() {
    if (this.isConnecting || this.isReconnecting || this.isClosing || !this.connection) {
      return;
    }
    this.isReconnecting = true;
    console.log(`[${this.serviceName}] Attempting to recreate RabbitMQ channel on existing connection...`);
    try {
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });
      this.setupChannelListeners(this.channel);

      this.activeConsumers.clear();
      await this.registerAllConsumers();
      console.log(`[${this.serviceName}] Recreated channel and resubscribed consumers`);
      this.isReconnecting = false;
    } catch (error) {
      console.error(`[${this.serviceName}] Failed to recreate channel:`, error.message);
      this.channel = null;
      this.isReconnecting = false;
      if (this.shouldReconnect && !this.isClosing) {
        this.reconnect();
      }
    }
  }

  async reconnect() {
    if (this.isConnecting || this.isReconnecting || this.isClosing) {
      return;
    }
    this.isReconnecting = true;
    console.log(`[${this.serviceName}] Attempting to reconnect to RabbitMQ...`);

    let attempt = 0;
    while (this.shouldReconnect && !this.isClosing) {
      attempt++;
      try {
        console.log(`[${this.serviceName}] Reconnection attempt ${attempt} to ${this.url}...`);
        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

        this.setupConnectionListeners(this.connection);
        this.setupChannelListeners(this.channel);

        this.activeConsumers.clear();
        await this.registerAllConsumers();
        console.log(`[${this.serviceName}] Reconnected and resubscribed consumers`);
        this.isReconnecting = false;
        return;
      } catch (error) {
        console.error(`[${this.serviceName}] Reconnection failed (attempt ${attempt}):`, error.message);
        if (this.channel) {
          try { await this.channel.close(); } catch (_) {}
          this.channel = null;
        }
        if (this.connection) {
          try { await this.connection.close(); } catch (_) {}
          this.connection = null;
        }

        if (this.isClosing || !this.shouldReconnect) {
          this.isReconnecting = false;
          return;
        }

        const delay = this.calculateBackoffDelay(attempt);
        console.log(`[${this.serviceName}] Retrying reconnection in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
    this.isReconnecting = false;
  }

  async registerConsumer(config, channel = this.channel) {
    const ch = channel || this.channel;
    if (!ch) {
      console.warn(`[${this.serviceName}] Cannot register consumer for ${config.queueName}: channel is not open`);
      return null;
    }
    if (!this.channel) {
      this.channel = ch;
    }

    const { queueName, routingKeys, dlqName = 'payment.dlq', maxRetries = 3, handler } = config;

    if (this.activeConsumers.has(queueName)) {
      console.log(`[${this.serviceName}] Consumer for ${queueName} already registered on active channel. Skipping duplicate registration.`);
      return { consumerTag: this.activeConsumers.get(queueName) };
    }

    console.log(`[${this.serviceName}] Registering consumer for queue: ${queueName} with routing keys: [${routingKeys.join(', ')}]`);

    if (dlqName) {
      await ch.assertQueue(dlqName, { durable: true });
    }

    await ch.assertQueue(queueName, { durable: true });

    for (const key of routingKeys) {
      await ch.bindQueue(queueName, EXCHANGE_NAME, key);
    }

    await ch.prefetch(1);

    const consumeResult = await ch.consume(queueName, async (msg) => {
      if (!msg) return;

      const headers = msg.properties.headers || {};
      const retryCount = headers['x-retry-count'] || 0;

      let payload;
      try {
        payload = JSON.parse(msg.content.toString());
      } catch (err) {
        console.error(`[${this.serviceName}] Invalid JSON on queue ${queueName}:`, err.message);
        if (dlqName) {
          try {
            await this.sendToDLQ(dlqName, msg, 'INVALID_JSON_PAYLOAD', retryCount);
          } catch (e) {
            console.error(`[${this.serviceName}] Failed to send to DLQ:`, e.message);
          }
        }
        try {
          ch.ack(msg);
        } catch (e) {
          // ignore
        }
        return;
      }

      try {
        await handler(payload, msg);
        try {
          ch.ack(msg);
        } catch (e) {
          // ignore
        }
      } catch (error) {
        console.error(`[${this.serviceName}] Consumer error on ${queueName} (attempt ${retryCount + 1}/${maxRetries}):`, error.message);

        if (retryCount + 1 >= maxRetries) {
          if (dlqName) {
            try {
              await this.sendToDLQ(dlqName, msg, error.message, retryCount + 1);
            } catch (e) {
              console.error(`[${this.serviceName}] Failed to send to DLQ:`, e.message);
            }
          }
          try {
            ch.ack(msg);
          } catch (e) {
            // ignore
          }
        } else {
          const nextRetry = retryCount + 1;
          try {
            ch.ack(msg);
          } catch (e) {
            // ignore
          }
          try {
            ch.sendToQueue(queueName, msg.content, {
              persistent: true,
              headers: {
                ...headers,
                'x-retry-count': nextRetry,
                'x-first-failed-at': headers['x-first-failed-at'] || new Date().toISOString()
              }
            });
          } catch (e) {
            console.error(`[${this.serviceName}] Failed to requeue message:`, e.message);
          }
        }
      }
    });

    const consumerTag = (consumeResult && consumeResult.consumerTag) || `ctag-${queueName}`;
    this.activeConsumers.set(queueName, consumerTag);
    console.log(`[${this.serviceName}] Consumer registered successfully for queue: ${queueName} (consumerTag: ${consumerTag})`);
    return consumeResult;
  }

  async registerAllConsumers() {
    for (const config of this.consumers) {
      try {
        await this.registerConsumer(config, this.channel);
      } catch (err) {
        console.error(`[${this.serviceName}] Failed to register consumer for ${config.queueName}:`, err.message);
      }
    }
  }

  async resubscribeConsumers() {
    await this.registerAllConsumers();
  }

  async checkHealth() {
    try {
      if (this.connection && this.channel) {
        return true;
      }
      const conn = await amqp.connect(this.url);
      const ch = await conn.createChannel();
      await ch.close();
      await conn.close();
      return true;
    } catch (err) {
      return false;
    }
  }

  createEvent(eventType, data) {
    return {
      eventId: randomUUID(),
      eventType,
      timestamp: new Date().toISOString(),
      source: this.serviceName,
      data
    };
  }

  async publish(routingKey, eventBody) {
    try {
      const ch = await this.connect();
      const content = Buffer.from(JSON.stringify(eventBody));
      return ch.publish(EXCHANGE_NAME, routingKey, content, { persistent: true });
    } catch (err) {
      console.error(`[${this.serviceName}] Failed to publish event (${routingKey}):`, err.message);
      throw err;
    }
  }

  async consume({ queueName, routingKeys, dlqName = 'payment.dlq', maxRetries = 3, handler }) {
    const consumerConfig = { queueName, routingKeys, dlqName, maxRetries, handler };
    const existingIndex = this.consumers.findIndex((c) => c.queueName === queueName);
    if (existingIndex === -1) {
      this.consumers.push(consumerConfig);
    } else {
      this.consumers[existingIndex] = consumerConfig;
    }

    const ch = await this.connect();
    if (this.activeConsumers.has(queueName)) {
      return { consumerTag: this.activeConsumers.get(queueName) };
    }
    return await this.registerConsumer(consumerConfig, ch);
  }

  async sendToDLQ(dlqName, originalMsg, reason, retryCount) {
    const ch = await this.connect();
    let body;
    try {
      body = JSON.parse(originalMsg.content.toString());
    } catch (_) {
      body = originalMsg.content.toString();
    }
    const dlqPayload = {
      originalRoutingKey: (originalMsg.fields && originalMsg.fields.routingKey) || '',
      failureReason: reason,
      retryCount: retryCount,
      timestamp: new Date().toISOString(),
      body
    };
    await ch.sendToQueue(dlqName, Buffer.from(JSON.stringify(dlqPayload)), { persistent: true });
  }

  async close() {
    this.isClosing = true;
    this.shouldReconnect = false;

    if (this._wakeUpSleep) {
      this._wakeUpSleep();
      this._wakeUpSleep = null;
    }

    this.activeConsumers.clear();

    if (this.channel) {
      try {
        await this.channel.close();
      } catch (err) {
        // ignore already closed
      }
      this.channel = null;
    }

    if (this.connection) {
      try {
        await this.connection.close();
      } catch (err) {
        // ignore already closed
      }
      this.connection = null;
    }

    this.isConnecting = false;
    this.isReconnecting = false;
  }
}

module.exports = RabbitMQManager;
