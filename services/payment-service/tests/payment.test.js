const request = require('supertest');

const mockPayment = {
  id: 'pay-uuid-1234',
  orderId: 'order-uuid-1234',
  userId: 'user-uuid-1234',
  amountInPaise: 150000,
  status: 'SUCCESS',
  transactionReference: 'tx_sim_12345678',
  eventId: 'evt-uuid-1234',
  createdAt: new Date(),
  updatedAt: new Date()
};

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    $queryRaw: jest.fn()
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

// Mock RabbitMQManager
const mockPublish = jest.fn().mockResolvedValue(true);
const mockCheckHealth = jest.fn().mockResolvedValue(true);
const mockCreateEvent = jest.fn((type, data) => ({
  eventId: 'evt-generated-123',
  eventType: type,
  timestamp: new Date().toISOString(),
  source: 'payment-service',
  data
}));

jest.mock('../src/messaging/rabbitmq', () => {
  return jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    checkHealth: mockCheckHealth,
    createEvent: mockCreateEvent,
    connect: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({})
  }));
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const app = require('../src/app');
const { processPaymentEvent } = require('../src/messaging/paymentConsumer');

describe('Payment Service API & Messaging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health & /health/ready', () => {
    it('GET /health should return 200 UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
      expect(res.body.service).toEqual('payment-service');
    });

    it('GET /health/ready should return 200 UP when DB and RabbitMQ are ready', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await request(app).get('/health/ready');
      expect(res.statusCode).toEqual(200);
      expect(res.body.database).toEqual('CONNECTED');
      expect(res.body.rabbitmq).toEqual('CONNECTED');
    });
  });

  describe('POST /payments (REST Payment Creation)', () => {
    it('should create payment successfully', async () => {
      prisma.payment.findFirst.mockResolvedValueOnce(null);
      prisma.payment.create.mockResolvedValueOnce(mockPayment);

      const res = await request(app)
        .post('/payments')
        .send({
          orderId: mockPayment.orderId,
          userId: mockPayment.userId,
          amountInPaise: mockPayment.amountInPaise
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.id).toEqual(mockPayment.id);
      expect(mockPublish).toHaveBeenCalledWith('payment.processed', expect.any(Object));
    });

    it('should reject payment creation if payment already exists for order', async () => {
      prisma.payment.findFirst.mockResolvedValueOnce(mockPayment);

      const res = await request(app)
        .post('/payments')
        .send({
          orderId: mockPayment.orderId,
          userId: mockPayment.userId,
          amountInPaise: mockPayment.amountInPaise
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.error.code).toEqual('PAYMENT_CONFLICT');
    });
  });

  describe('GET /payments/:id & /payments/order/:orderId', () => {
    it('should return payment by ID', async () => {
      prisma.payment.findUnique.mockResolvedValueOnce(mockPayment);

      const res = await request(app).get(`/payments/${mockPayment.id}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(mockPayment.id);
    });

    it('should return payments by Order ID', async () => {
      prisma.payment.findMany.mockResolvedValueOnce([mockPayment]);

      const res = await request(app).get(`/payments/order/${mockPayment.orderId}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].orderId).toEqual(mockPayment.orderId);
    });
  });

  describe('processPaymentEvent (Idempotent RabbitMQ Event Consumer)', () => {
    const orderCreatedEvent = {
      eventId: 'evt-order-9999',
      eventType: 'OrderCreated',
      timestamp: new Date().toISOString(),
      source: 'order-service',
      data: {
        orderId: 'order-9999',
        userId: 'user-8888',
        totalAmountInPaise: 75050
      }
    };

    it('should process OrderCreated event and publish PaymentProcessed event', async () => {
      prisma.payment.findUnique.mockResolvedValueOnce(null);
      prisma.payment.findFirst.mockResolvedValueOnce(null);
      prisma.payment.create.mockResolvedValueOnce({
        id: 'pay-new-1',
        orderId: 'order-9999',
        userId: 'user-8888',
        amountInPaise: 75050,
        status: 'SUCCESS',
        transactionReference: 'tx_sim_123',
        eventId: 'evt-order-9999'
      });

      const result = await processPaymentEvent(orderCreatedEvent);

      expect(result.status).toEqual('SUCCESS');
      expect(prisma.payment.create).toHaveBeenCalled();
      expect(mockPublish).toHaveBeenCalledWith('payment.processed', expect.objectContaining({
        eventType: 'PaymentProcessed'
      }));
    });

    it('should skip duplicate processing if eventId has already been processed (Idempotency)', async () => {
      prisma.payment.findUnique.mockResolvedValueOnce(mockPayment);

      const result = await processPaymentEvent(orderCreatedEvent);

      expect(result.id).toEqual(mockPayment.id);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('should publish PaymentFailed when simulateFailure is true', async () => {
      const failedOrderEvent = {
        ...orderCreatedEvent,
        eventId: 'evt-order-fail-1',
        data: {
          ...orderCreatedEvent.data,
          simulateFailure: true
        }
      };

      prisma.payment.findUnique.mockResolvedValueOnce(null);
      prisma.payment.findFirst.mockResolvedValueOnce(null);
      prisma.payment.create.mockResolvedValueOnce({
        id: 'pay-failed-1',
        orderId: 'order-9999',
        userId: 'user-8888',
        amountInPaise: 75050,
        status: 'FAILED',
        transactionReference: 'tx_sim_fail',
        eventId: 'evt-order-fail-1'
      });

      const result = await processPaymentEvent(failedOrderEvent);

      expect(result.status).toEqual('FAILED');
      expect(mockPublish).toHaveBeenCalledWith('payment.failed', expect.objectContaining({
        eventType: 'PaymentFailed'
      }));
    });
  });
});
