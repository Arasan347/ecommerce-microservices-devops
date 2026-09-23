const request = require('supertest');

const mockProduct = {
  id: 'prod-uuid-1234',
  name: 'Developer Laptop',
  description: 'High performance laptop',
  price: 75000,
  stock: 20,
  createdAt: new Date(),
  updatedAt: new Date()
};

jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    product: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    $queryRaw: jest.fn()
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const app = require('../src/app');

describe('Product Service API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('POST /products (Create Product)', () => {
    it('should create a product with valid fields', async () => {
      prisma.product.create.mockResolvedValueOnce(mockProduct);

      const res = await request(app)
        .post('/products')
        .send({
          name: 'Developer Laptop',
          description: 'High performance laptop',
          price: 75000,
          stock: 20
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.id).toEqual(mockProduct.id);
      expect(res.body.price).toEqual(75000);
    });

    it('should reject creation if price is 0 or negative', async () => {
      const res = await request(app)
        .post('/products')
        .send({
          name: 'Free Laptop',
          description: 'Invalid price product',
          price: 0,
          stock: 5
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error.code).toEqual('VALIDATION_ERROR');
    });

    it('should reject creation if stock is negative', async () => {
      const res = await request(app)
        .post('/products')
        .send({
          name: 'Invalid Stock Laptop',
          description: 'Negative stock product',
          price: 100,
          stock: -5
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error.code).toEqual('VALIDATION_ERROR');
    });
  });

  describe('GET /products & /products/:id', () => {
    it('should return product details for valid ID', async () => {
      prisma.product.findUnique.mockResolvedValueOnce(mockProduct);

      const res = await request(app).get(`/products/${mockProduct.id}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(mockProduct.id);
    });

    it('should return 404 for non-existent product ID', async () => {
      prisma.product.findUnique.mockResolvedValueOnce(null);

      const res = await request(app).get('/products/non-existent-id');
      expect(res.statusCode).toEqual(404);
      expect(res.body.error.code).toEqual('PRODUCT_NOT_FOUND');
    });
  });

  describe('PUT /products/:id & DELETE /products/:id', () => {
    it('should update product information', async () => {
      prisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      prisma.product.update.mockResolvedValueOnce({
        ...mockProduct,
        price: 80000
      });

      const res = await request(app)
        .put(`/products/${mockProduct.id}`)
        .send({ price: 80000 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.price).toEqual(80000);
    });

    it('should delete existing product', async () => {
      prisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      prisma.product.delete.mockResolvedValueOnce(mockProduct);

      const res = await request(app).delete(`/products/${mockProduct.id}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/deleted/i);
    });
  });
});
