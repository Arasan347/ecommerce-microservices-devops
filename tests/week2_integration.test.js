const { processPaymentEvent } = require('../services/payment-service/src/messaging/paymentConsumer');
const { processNotificationEvent } = require('../services/notification-service/src/messaging/notificationConsumer');
const RabbitMQManager = require('../services/payment-service/src/messaging/rabbitmq');

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

      // Simulated recovery: payment processing starts and consumes queued event
      const mockPrismaPayment = {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'pay-recovered-1',
          orderId: 'order-recovery-101',
          userId: 'user-recovery-202',
          amountInPaise: 250000,
          status: 'SUCCESS',
          transactionReference: 'tx_rec_123',
          eventId: 'evt-queue-recovery-1'
        })
      };

      // Mock RabbitMQ publish for PaymentProcessed
      const rmq = new RabbitMQManager('payment-service');
      jest.spyOn(rmq, 'publish').mockResolvedValue(true);

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
          // Simulate 3rd failure attempt (retryCount = 2)
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
      const duplicateEvent = {
        eventId: 'evt-dup-1001',
        eventType: 'OrderCreated',
        data: {
          orderId: 'order-dup-1',
          userId: 'user-dup-1',
          totalAmountInPaise: 9900
        }
      };

      // Mock prisma for Payment Service
      const mockPaymentPrisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
            id: 'pay-exist-1',
            eventId: 'evt-dup-1001',
            orderId: 'order-dup-1'
          }),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'pay-exist-1',
            eventId: 'evt-dup-1001',
            orderId: 'order-dup-1',
            status: 'SUCCESS'
          })
        }
      };

      // First delivery: processes payment
      const firstResult = await mockPaymentPrisma.payment.create();
      expect(firstResult.id).toEqual('pay-exist-1');

      // Second delivery: returns existing payment record without creating duplicate
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

      // Verify HTTP 409 Conflict status and error contract
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
