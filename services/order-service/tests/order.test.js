const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockUser = {
  id: 'user-uuid-1234',
  name: 'Test User',
  email: 'test@example.com'
};

const mockProduct = {
  id: 'prod-uuid-1234',
  name: 'Developer Laptop',
  description: 'High performance laptop',
  priceInPaise: 50000,
  stock: 10
};

const mockOrder = {
  id: 'order-uuid-1234',
  userId: 'user-uuid-1234',
  status: 'PENDING',
  totalAmountInPaise: 100000,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: 'item-uuid-1',
      orderId: 'order-uuid-1234',
      productId: 'prod-uuid-1234',
      quantity: 2,
      priceInPaise: 50000
    }
  ]
};

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    order: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    },
    $queryRaw: jest.fn()
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

const mockGetUserById = jest.fn();
const mockReserveStock = jest.fn();

jest.mock('../src/services/userClient', () => {
  return jest.fn().mockImplementation(() => ({
    getUserById: mockGetUserById
  }));
});

jest.mock('../src/services/productClient', () => {
  return jest.fn().mockImplementation(() => ({
    reserveStock: mockReserveStock
  }));
});

const mockPublish = jest.fn().mockResolvedValue(true);
const mockCheckHealth = jest.fn().mockResolvedValue(true);
jest.mock('../src/messaging/rabbitmq', () => {
  return jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    checkHealth: mockCheckHealth,
    createEvent: jest.fn((type, data) => ({
      eventId: 'evt-test-123',
      eventType: type,
      timestamp: new Date().toISOString(),
      source: 'order-service',
      data
    })),
    connect: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({})
  }));
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const app = require('../src/app');
const { InsufficientStockError } = require('../src/utils/errors');

describe('Order Service API', () => {
  const secret = process.env.JWT_SECRET || 'supersecretkey_change_in_production';
  const token = jwt.sign({ id: mockUser.id, email: mockUser.email }, secret);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue(mockUser);
    mockReserveStock.mockResolvedValue(mockProduct);
  });

  describe('GET /health & /health/ready', () => {
    it('GET /health should return 200 UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
    });

    it('GET /health/ready should return 200 UP when DB and RabbitMQ are ready', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await request(app).get('/health/ready');
      expect(res.statusCode).toEqual(200);
      expect(res.body.database).toEqual('CONNECTED');
      expect(res.body.rabbitmq).toEqual('CONNECTED');
    });
  });

  describe('POST /orders (Create Order & Publish OrderCreated Event)', () => {
    it('should create an order successfully, reserve inventory, and publish OrderCreated event', async () => {
      prisma.order.create.mockResolvedValueOnce(mockOrder);

      const res = await request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            {
              productId: 'prod-uuid-1234',
              quantity: 2
            }
          ]
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.id).toEqual(mockOrder.id);
      expect(res.body.totalAmountInPaise).toEqual(100000);
      expect(mockReserveStock).toHaveBeenCalledWith('prod-uuid-1234', 2);
      expect(mockPublish).toHaveBeenCalledWith('order.created', expect.any(Object));
    });

    it('should fail if inventory reservation throws InsufficientStockError', async () => {
      mockReserveStock.mockRejectedValueOnce(new InsufficientStockError('Insufficient stock for product reservation'));

      const res = await request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            {
              productId: 'prod-uuid-1234',
              quantity: 20
            }
          ]
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error.code).toEqual('INSUFFICIENT_STOCK');
    });

    it('should reject order creation without authentication token', async () => {
      const res = await request(app)
        .post('/orders')
        .send({
          items: [{ productId: 'prod-uuid-1234', quantity: 1 }]
        });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('State Machine & Transitions (PUT /orders/:id/status)', () => {
    it('should allow valid transition PENDING -> CONFIRMED', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(mockOrder);
      prisma.order.update.mockResolvedValueOnce({
        ...mockOrder,
        status: 'CONFIRMED'
      });

      const res = await request(app)
        .put(`/orders/${mockOrder.id}/status`)
        .send({ status: 'CONFIRMED' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('CONFIRMED');
    });

    it('should reject invalid transition COMPLETED -> PENDING', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        ...mockOrder,
        status: 'COMPLETED'
      });

      const res = await request(app)
        .put(`/orders/${mockOrder.id}/status`)
        .send({ status: 'PENDING' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error.message).toMatch(/Invalid status transition/i);
    });
  });
});
