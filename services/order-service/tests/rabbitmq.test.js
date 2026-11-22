const amqp = require('amqplib');
const RabbitMQManager = require('../src/messaging/rabbitmq');

jest.mock('amqplib');

describe('Order Service - RabbitMQManager Reliability', () => {
  let rmq;
  let mockConnection;
  let mockChannel;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
      prefetch: jest.fn().mockResolvedValue({}),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'ctag-order.queue' }),
      publish: jest.fn().mockReturnValue(true),
      sendToQueue: jest.fn().mockReturnValue(true),
      ack: jest.fn(),
      close: jest.fn().mockResolvedValue({}),
      on: jest.fn()
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn().mockResolvedValue({}),
      on: jest.fn()
    };

    amqp.connect.mockResolvedValue(mockConnection);
  });

  afterEach(async () => {
    if (rmq) {
      await rmq.close();
      rmq = null;
    }
  });

  describe('Requirement 2 & 9: Initial connection retries with exponential backoff', () => {
    it('should retry connection when RabbitMQ is unavailable during initial startup and succeed', async () => {
      amqp.connect
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5672'))
        .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5672'))
        .mockResolvedValueOnce(mockConnection);

      rmq = new RabbitMQManager('order-service', {
        initialRetryDelay: 10,
        maxRetryDelay: 50,
        backoffFactor: 2,
        maxConnectionRetries: 5
      });

      const channel = await rmq.connect();

      expect(amqp.connect).toHaveBeenCalledTimes(3);
      expect(channel).toBe(mockChannel);
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('ecommerce.events', 'topic', { durable: true });
    });

    it('should fail and throw when RabbitMQ remains unavailable after exceeding max retries', async () => {
      amqp.connect.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5672'));

      rmq = new RabbitMQManager('order-service', {
        initialRetryDelay: 5,
        maxRetryDelay: 20,
        backoffFactor: 2,
        maxConnectionRetries: 3
      });

      await expect(rmq.connect()).rejects.toThrow('connect ECONNREFUSED 127.0.0.1:5672');
      expect(amqp.connect).toHaveBeenCalledTimes(3);
      expect(rmq.connection).toBeNull();
      expect(rmq.channel).toBeNull();
    });
  });

  describe('Requirement 4, 5 & 9: Consumer registration & duplicate prevention', () => {
    it('should register consumer only once after a successful connection', async () => {
      rmq = new RabbitMQManager('order-service', {
        initialRetryDelay: 10,
        maxConnectionRetries: 3
      });

      const handler = jest.fn();
      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed', 'payment.failed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler
      });

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('order.dlq', { durable: true });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('order.queue', { durable: true });
      expect(mockChannel.bindQueue).toHaveBeenCalledWith('order.queue', 'ecommerce.events', 'payment.processed');
      expect(mockChannel.bindQueue).toHaveBeenCalledWith('order.queue', 'ecommerce.events', 'payment.failed');
      expect(mockChannel.prefetch).toHaveBeenCalledWith(1);
      expect(mockChannel.consume).toHaveBeenCalledTimes(1);

      // Re-invoking consume on the same queue must not re-register duplicate consumers
      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed', 'payment.failed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler
      });

      expect(mockChannel.consume).toHaveBeenCalledTimes(1);
    });

    it('should register consumers after initial startup connection retry succeeds', async () => {
      amqp.connect
        .mockRejectedValueOnce(new Error('RabbitMQ not ready yet'))
        .mockResolvedValueOnce(mockConnection);

      rmq = new RabbitMQManager('order-service', {
        initialRetryDelay: 10,
        maxRetryDelay: 50,
        maxConnectionRetries: 5
      });

      const handler = jest.fn();
      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed', 'payment.failed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler
      });

      expect(amqp.connect).toHaveBeenCalledTimes(2);
      expect(mockChannel.consume).toHaveBeenCalledTimes(1);
      expect(rmq.activeConsumers.has('order.queue')).toBe(true);
    });
  });

  describe('Requirement 3 & 9: Reconnection after connection loss', () => {
    it('should reconnect and re-register consumers without duplicates when connection closes', async () => {
      let connectionCloseHandler;
      mockConnection.on.mockImplementation((event, cb) => {
        if (event === 'close') connectionCloseHandler = cb;
      });

      rmq = new RabbitMQManager('order-service', {
        initialRetryDelay: 10,
        maxRetryDelay: 50,
        maxConnectionRetries: 5
      });

      const handler = jest.fn();
      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler
      });

      expect(mockChannel.consume).toHaveBeenCalledTimes(1);

      const mockChannel2 = {
        ...mockChannel,
        consume: jest.fn().mockResolvedValue({ consumerTag: 'ctag-order-reconnected' })
      };
      const mockConnection2 = {
        ...mockConnection,
        createChannel: jest.fn().mockResolvedValue(mockChannel2),
        on: jest.fn()
      };
      amqp.connect.mockResolvedValueOnce(mockConnection2);

      // Trigger connection close
      expect(connectionCloseHandler).toBeDefined();
      connectionCloseHandler();

      // Wait briefly for reconnection
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(amqp.connect).toHaveBeenCalledTimes(2);
      expect(mockChannel2.consume).toHaveBeenCalledTimes(1);
      expect(rmq.activeConsumers.get('order.queue')).toBe('ctag-order-reconnected');
    });

    it('should recreate channel and resubscribe consumers when channel closes', async () => {
      let channelCloseHandler;
      mockChannel.on.mockImplementation((event, cb) => {
        if (event === 'close') channelCloseHandler = cb;
      });

      rmq = new RabbitMQManager('order-service', {
        initialRetryDelay: 10,
        maxRetryDelay: 50
      });

      const handler = jest.fn();
      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler
      });

      expect(mockChannel.consume).toHaveBeenCalledTimes(1);

      const mockChannel2 = {
        ...mockChannel,
        consume: jest.fn().mockResolvedValue({ consumerTag: 'ctag-order-ch-recreated' })
      };
      mockConnection.createChannel.mockResolvedValueOnce(mockChannel2);

      // Trigger channel close
      expect(channelCloseHandler).toBeDefined();
      channelCloseHandler();

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockChannel2.consume).toHaveBeenCalledTimes(1);
      expect(rmq.activeConsumers.get('order.queue')).toBe('ctag-order-ch-recreated');
    });
  });

  describe('Requirement 6 & 9: Existing retry and DLQ behavior', () => {
    it('should requeue message with incremented retry count on processing failure', async () => {
      let messageHandler;
      mockChannel.consume.mockImplementation((queue, cb) => {
        messageHandler = cb;
        return Promise.resolve({ consumerTag: 'ctag-1' });
      });

      rmq = new RabbitMQManager('order-service');
      const failingHandler = jest.fn().mockRejectedValue(new Error('Temporary DB Timeout'));

      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler: failingHandler
      });

      const msg = {
        fields: { routingKey: 'payment.processed' },
        properties: { headers: { 'x-retry-count': 0 } },
        content: Buffer.from(JSON.stringify({ eventId: 'evt-retry-1', data: {} }))
      };

      await messageHandler(msg);

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'order.queue',
        msg.content,
        expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({
            'x-retry-count': 1
          })
        })
      );
    });

    it('should route message to DLQ after exceeding maximum retries (3)', async () => {
      let messageHandler;
      mockChannel.consume.mockImplementation((queue, cb) => {
        messageHandler = cb;
        return Promise.resolve({ consumerTag: 'ctag-1' });
      });

      rmq = new RabbitMQManager('order-service');
      const failingHandler = jest.fn().mockRejectedValue(new Error('Permanent Error'));

      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler: failingHandler
      });

      const msg = {
        fields: { routingKey: 'payment.processed' },
        properties: { headers: { 'x-retry-count': 2 } },
        content: Buffer.from(JSON.stringify({ eventId: 'evt-max-retry', data: {} }))
      };

      await messageHandler(msg);

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'order.dlq',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true })
      );
    });

    it('should route invalid JSON payload directly to DLQ and acknowledge', async () => {
      let messageHandler;
      mockChannel.consume.mockImplementation((queue, cb) => {
        messageHandler = cb;
        return Promise.resolve({ consumerTag: 'ctag-1' });
      });

      rmq = new RabbitMQManager('order-service');
      const handler = jest.fn();

      await rmq.consume({
        queueName: 'order.queue',
        routingKeys: ['payment.processed'],
        dlqName: 'order.dlq',
        maxRetries: 3,
        handler
      });

      const invalidMsg = {
        fields: { routingKey: 'payment.processed' },
        properties: { headers: {} },
        content: Buffer.from('NOT_VALID_JSON{')
      };

      await messageHandler(invalidMsg);

      expect(handler).not.toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(invalidMsg);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'order.dlq',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true })
      );
    });
  });

  describe('Requirement 8: Graceful Shutdown', () => {
    it('should close channels and connection cleanly and abort reconnects', async () => {
      rmq = new RabbitMQManager('order-service');
      await rmq.connect();

      expect(rmq.channel).not.toBeNull();
      expect(rmq.connection).not.toBeNull();

      await rmq.close();

      expect(mockChannel.close).toHaveBeenCalledTimes(1);
      expect(mockConnection.close).toHaveBeenCalledTimes(1);
      expect(rmq.channel).toBeNull();
      expect(rmq.connection).toBeNull();
      expect(rmq.shouldReconnect).toBe(false);
    });
  });
});
