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
  price: 500,
  stock: 10
};

const mockOrder = {
  id: 'order-uuid-1234',
  userId: 'user-uuid-1234',
  status: 'PENDING',
  totalAmount: 1000,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: 'item-uuid-1',
      orderId: 'order-uuid-1234',
      productId: 'prod-uuid-1234',
      quantity: 2,
      price: 500
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
const mockGetProductById = jest.fn();

// Mock UserClient and ProductClient
jest.mock('../src/services/userClient', () => {
  return jest.fn().mockImplementation(() => ({
    getUserById: mockGetUserById
  }));
});

jest.mock('../src/services/productClient', () => {
  return jest.fn().mockImplementation(() => ({
    getProductById: mockGetProductById
  }));
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const app = require('../src/app');

describe('Order Service API', () => {
  const secret = process.env.JWT_SECRET || 'supersecretkey_change_in_production';
  const token = jwt.sign({ id: mockUser.id, email: mockUser.email }, secret);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue(mockUser);
    mockGetProductById.mockResolvedValue(mockProduct);
  });

  describe('GET /health & /health/ready', () => {
    it('GET /health should return 200 UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
    });

    it('GET /health/ready should return 200 UP when DB is connected', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await request(app).get('/health/ready');
      expect(res.statusCode).toEqual(200);
      expect(res.body.database).toEqual('CONNECTED');
    });
  });

  describe('POST /orders (Create Order)', () => {
    it('should create an order successfully and calculate server-side price', async () => {
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
      expect(res.body.totalAmount).toEqual(1000);
    });

    it('should fail if requested quantity exceeds product stock', async () => {
      mockGetProductById.mockResolvedValueOnce({
        ...mockProduct,
        stock: 1
      });

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

  describe('GET /orders/:id & PUT /orders/:id/status', () => {
    it('should return order details by ID', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(mockOrder);

      const res = await request(app).get(`/orders/${mockOrder.id}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(mockOrder.id);
    });

    it('should update order status', async () => {
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
  });
});
