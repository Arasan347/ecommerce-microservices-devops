const request = require('supertest');

const mockNotification = {
  id: 'notif-uuid-1234',
  userId: 'user-uuid-1234',
  orderId: 'order-uuid-1234',
  type: 'ORDER_CREATED',
  channel: 'EMAIL',
  status: 'SENT',
  message: 'Order order-uuid-1234 created successfully.',
  eventId: 'evt-uuid-1234',
  createdAt: new Date(),
  updatedAt: new Date()
};

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    notification: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    $queryRaw: jest.fn()
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

// Mock RabbitMQManager
const mockCheckHealth = jest.fn().mockResolvedValue(true);
jest.mock('../src/messaging/rabbitmq', () => {
  return jest.fn().mockImplementation(() => ({
    checkHealth: mockCheckHealth,
    connect: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({})
  }));
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const app = require('../src/app');
const { processNotificationEvent } = require('../src/messaging/notificationConsumer');

describe('Notification Service API & Messaging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health & /health/ready', () => {
    it('GET /health should return 200 UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
      expect(res.body.service).toEqual('notification-service');
    });

    it('GET /health/ready should return 200 UP when DB and RabbitMQ are ready', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await request(app).get('/health/ready');
      expect(res.statusCode).toEqual(200);
      expect(res.body.database).toEqual('CONNECTED');
      expect(res.body.rabbitmq).toEqual('CONNECTED');
    });
  });

  describe('GET /notifications/:id & /notifications/user/:userId', () => {
    it('should return notification by ID', async () => {
      prisma.notification.findUnique.mockResolvedValueOnce(mockNotification);

      const res = await request(app).get(`/notifications/${mockNotification.id}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(mockNotification.id);
    });

    it('should return notifications by User ID', async () => {
      prisma.notification.findMany.mockResolvedValueOnce([mockNotification]);

      const res = await request(app).get(`/notifications/user/${mockNotification.userId}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].userId).toEqual(mockNotification.userId);
    });
  });

  describe('processNotificationEvent (Idempotent Consumer)', () => {
    it('should process OrderCreated event and create ORDER_CREATED notification', async () => {
      const event = {
        eventId: 'evt-oc-1',
        eventType: 'OrderCreated',
        data: {
          userId: 'user-123',
          orderId: 'order-123',
          totalAmountInPaise: 50000
        }
      };

      prisma.notification.findUnique.mockResolvedValueOnce(null);
      prisma.notification.create.mockResolvedValueOnce({
        id: 'notif-1',
        userId: 'user-123',
        orderId: 'order-123',
        type: 'ORDER_CREATED',
        channel: 'EMAIL',
        status: 'SENT',
        message: 'Order created',
        eventId: 'evt-oc-1'
      });

      const result = await processNotificationEvent(event);
      expect(result.type).toEqual('ORDER_CREATED');
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should process PaymentProcessed event and create PAYMENT_SUCCESS notification', async () => {
      const event = {
        eventId: 'evt-pp-1',
        eventType: 'PaymentProcessed',
        data: {
          userId: 'user-123',
          orderId: 'order-123',
          transactionReference: 'tx_123'
        }
      };

      prisma.notification.findUnique.mockResolvedValueOnce(null);
      prisma.notification.create.mockResolvedValueOnce({
        id: 'notif-2',
        userId: 'user-123',
        orderId: 'order-123',
        type: 'PAYMENT_SUCCESS',
        channel: 'EMAIL',
        status: 'SENT',
        message: 'Payment success',
        eventId: 'evt-pp-1'
      });

      const result = await processNotificationEvent(event);
      expect(result.type).toEqual('PAYMENT_SUCCESS');
    });

    it('should process PaymentFailed event and create PAYMENT_FAILED notification', async () => {
      const event = {
        eventId: 'evt-pf-1',
        eventType: 'PaymentFailed',
        data: {
          userId: 'user-123',
          orderId: 'order-123',
          reason: 'Card declined'
        }
      };

      prisma.notification.findUnique.mockResolvedValueOnce(null);
      prisma.notification.create.mockResolvedValueOnce({
        id: 'notif-3',
        userId: 'user-123',
        orderId: 'order-123',
        type: 'PAYMENT_FAILED',
        channel: 'SMS',
        status: 'SENT',
        message: 'Payment failed',
        eventId: 'evt-pf-1'
      });

      const result = await processNotificationEvent(event);
      expect(result.type).toEqual('PAYMENT_FAILED');
    });

    it('should skip processing if eventId was already processed (Idempotency)', async () => {
      const event = {
        eventId: 'evt-oc-1',
        eventType: 'OrderCreated',
        data: { userId: 'user-123', orderId: 'order-123' }
      };

      prisma.notification.findUnique.mockResolvedValueOnce(mockNotification);

      const result = await processNotificationEvent(event);
      expect(result.id).toEqual(mockNotification.id);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
