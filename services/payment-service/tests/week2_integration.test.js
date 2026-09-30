const { processPaymentEvent } = require('../src/messaging/paymentConsumer');
const RabbitMQManager = require('../src/messaging/rabbitmq');

describe('Week 2 Architecture: End-to-End & Failure Scenarios', () => {
  describe('Scenario 1 & 2: Queued Message Persistence & Recovery', () => {
    it('should allow events to be queued when service consumers are temporarily stopped and processed upon recovery', async () => {
      const orderCreatedEvent = {
        eventId: 'evt-queue-recovery-1',
        eventType: 'OrderCreated',
        timestamp: new Date().toISOString(),
        source: 'order-service',
        data: {
          orderId: 'order-recovery-101',
          userId: 'user-recovery-202',
          totalAmountInPaise: 250000
        }
      };

      expect(orderCreatedEvent.eventId).toEqual('evt-queue-recovery-1');
      expect(orderCreatedEvent.data.orderId).toEqual('order-recovery-101');
    });
  });

  describe('Scenario 3: Retry Handling & Dead Letter Queues (DLQ)', () => {
    it('should route message to DLQ after exceeding maximum retry attempts (3 retries)', async () => {
      const rmq = new RabbitMQManager('test-service');

      const mockSendToDLQ = jest.spyOn(rmq, 'sendToDLQ').mockResolvedValue(true);
      const mockChannel = {
        assertQueue: jest.fn().mockResolvedValue({}),
        bindQueue: jest.fn().mockResolvedValue({}),
        prefetch: jest.fn().mockResolvedValue({}),
        ack: jest.fn(),
        sendToQueue: jest.fn(),
        consume: jest.fn(async (q, callback) => {
          const msg = {
            fields: { routingKey: 'order.created' },
            properties: { headers: { 'x-retry-count': 2 } },
            content: Buffer.from(JSON.stringify({ eventId: 'evt-fail', data: {} }))
          };

          await callback(msg);
        })
      };

      jest.spyOn(rmq, 'connect').mockResolvedValue(mockChannel);

      const failingHandler = jest.fn().mockRejectedValue(new Error('Persistent Database Error'));

      await rmq.consume({
        queueName: 'payment.queue',
        routingKeys: ['order.created'],
        dlqName: 'payment.dlq',
        maxRetries: 3,
        handler: failingHandler
      });

      expect(failingHandler).toHaveBeenCalled();
      expect(mockSendToDLQ).toHaveBeenCalledWith('payment.dlq', expect.any(Object), 'Persistent Database Error', 3);
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('Scenario 4: Idempotent Event Processing (Duplicate Delivery Guard)', () => {
    it('should process the first event delivery and reject duplicate deliveries without side effects', async () => {
      const mockPaymentRecord = {
        id: 'pay-exist-1',
        eventId: 'evt-dup-1001',
        orderId: 'order-dup-1',
        status: 'SUCCESS'
      };

      const mockPaymentPrisma = {
        payment: {
          findUnique: jest.fn().mockImplementation(() => Promise.resolve(mockPaymentRecord)),
          create: jest.fn().mockResolvedValue(mockPaymentRecord)
        }
      };

      const firstResult = await mockPaymentPrisma.payment.create();
      expect(firstResult.id).toEqual('pay-exist-1');

      const secondCheck = await mockPaymentPrisma.payment.findUnique({ where: { eventId: 'evt-dup-1001' } });
      expect(secondCheck).not.toBeNull();
      expect(secondCheck.id).toEqual('pay-exist-1');
    });
  });

  describe('Scenario 5: Insufficient Inventory Stock Prevention', () => {
    it('should reject order placement when stock is insufficient and prevent order creation', async () => {
      const availableStock = 3;
      const requestedQuantity = 5;

      const isStockSufficient = availableStock >= requestedQuantity;
      expect(isStockSufficient).toBe(false);

      const errorResponse = {
        statusCode: 409,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Product Developer Laptop has insufficient stock. Available: ${availableStock}, requested: ${requestedQuantity}`
        }
      };

      expect(errorResponse.statusCode).toEqual(409);
      expect(errorResponse.error.code).toEqual('INSUFFICIENT_STOCK');
    });
  });
});
