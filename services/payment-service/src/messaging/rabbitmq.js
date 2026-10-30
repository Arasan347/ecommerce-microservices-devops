const amqp = require('amqplib');
const { randomUUID } = require('crypto');

const EXCHANGE_NAME = 'ecommerce.events';
const EXCHANGE_TYPE = 'topic';

class RabbitMQManager {
  constructor(serviceName = 'payment-service') {
    this.serviceName = serviceName;
    this.connection = null;
    this.channel = null;
    this.url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.consumers = [];
    this.isConnecting = false;
    this.shouldReconnect = true;
  }

  async connect() {
    if (this.connection && this.channel) {
      return this.channel;
    }

    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.connection && this.channel) {
        return this.channel;
      }
    }

    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

      this.connection.on('error', (err) => {
        console.error(`[${this.serviceName}] RabbitMQ error:`, err.message);
      });

      this.connection.on('close', () => {
        console.error(`[${this.serviceName}] RabbitMQ connection closed`);
        this.connection = null;
        this.channel = null;
        if (this.shouldReconnect) {
          this.reconnect();
        }
      });

      if (this.channel) {
        this.channel.on('error', (err) => {
          console.error(`[${this.serviceName}] RabbitMQ channel error:`, err.message);
        });
        this.channel.on('close', () => {
          console.error(`[${this.serviceName}] RabbitMQ channel closed`);
          this.channel = null;
          if (this.shouldReconnect && this.connection) {
            this.recreateChannel();
          }
        });
      }

      this.isConnecting = false;
      return this.channel;
    } catch (error) {
      this.isConnecting = false;
      console.error(`[${this.serviceName}] Failed to connect to RabbitMQ:`, error.message);
      throw error;
    }
  }

  async reconnect() {
    if (this.isConnecting) {
      return;
    }
    console.log(`[${this.serviceName}] Attempting to reconnect to RabbitMQ...`);
    try {
      await this.connect();
      await this.resubscribeConsumers();
      console.log(`[${this.serviceName}] Reconnected and resubscribed consumers`);
    } catch (error) {
      console.error(`[${this.serviceName}] Reconnection failed:`, error.message);
      setTimeout(() => {
        if (this.shouldReconnect) {
          this.reconnect();
        }
      }, 5000);
    }
  }

  async recreateChannel() {
    if (this.isConnecting || !this.connection) {
      return;
    }
    try {
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

      this.channel.on('error', (err) => {
        console.error(`[${this.serviceName}] RabbitMQ channel error:`, err.message);
      });
      this.channel.on('close', () => {
        console.error(`[${this.serviceName}] RabbitMQ channel closed`);
        this.channel = null;
        if (this.shouldReconnect) {
          this.reconnect();
        }
      });

      await this.resubscribeConsumers();
      console.log(`[${this.serviceName}] Recreated channel and resubscribed consumers`);
    } catch (error) {
      console.error(`[${this.serviceName}] Failed to recreate channel:`, error.message);
      if (this.shouldReconnect) {
        this.reconnect();
      }
    }
  }

  async resubscribeConsumers() {
    const consumersToResubscribe = [...this.consumers];
    this.consumers = [];
    for (const consumer of consumersToResubscribe) {
      try {
        await this.consume(consumer);
      } catch (error) {
        console.error(`[${this.serviceName}] Failed to resubscribe consumer for ${consumer.queueName}:`, error.message);
        this.consumers.push(consumer);
      }
    }
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
    const existingIndex = this.consumers.findIndex(c => c.queueName === queueName);
    if (existingIndex === -1) {
      this.consumers.push(consumerConfig);
    } else {
      this.consumers[existingIndex] = consumerConfig;
    }

    const ch = await this.connect();

    if (dlqName) {
      await ch.assertQueue(dlqName, { durable: true });
    }

    await ch.assertQueue(queueName, { durable: true });

    for (const key of routingKeys) {
      await ch.bindQueue(queueName, EXCHANGE_NAME, key);
    }

    await ch.prefetch(1);

    return ch.consume(queueName, async (msg) => {
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
  }

  async sendToDLQ(dlqName, originalMsg, reason, retryCount) {
    const ch = await this.connect();
    const dlqPayload = {
      originalRoutingKey: originalMsg.fields.routingKey,
      failureReason: reason,
      retryCount: retryCount,
      timestamp: new Date().toISOString(),
      body: JSON.parse(originalMsg.content.toString())
    };
    await ch.sendToQueue(dlqName, Buffer.from(JSON.stringify(dlqPayload)), { persistent: true });
  }

  async close() {
    this.shouldReconnect = false;
    if (this.channel) {
      await this.channel.close().catch(() => {});
      this.channel = null;
    }
    if (this.connection) {
      await this.connection.close().catch(() => {});
      this.connection = null;
    }
  }
}

module.exports = RabbitMQManager;
