const request = require('supertest');

// Mock PrismaClient
const mockUser = {
  id: 'user-uuid-1234',
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: '$2a$10$hashedpasswordvalue',
  createdAt: new Date(),
  updatedAt: new Date()
};

jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn()
    },
    $queryRaw: jest.fn()
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const app = require('../src/app');

describe('User Service API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health & /health/ready', () => {
    it('GET /health should return 200 UP', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('UP');
      expect(res.body.service).toEqual('user-service');
    });

    it('GET /health/ready should return 200 UP when DB is connected', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await request(app).get('/health/ready');
      expect(res.statusCode).toEqual(200);
      expect(res.body.database).toEqual('CONNECTED');
    });
  });

  describe('POST /users (Registration)', () => {
    it('should register a new user successfully', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt
      });

      const res = await request(app)
        .post('/users')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toEqual('Test User');
      expect(res.body.email).toEqual('test@example.com');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should reject registration if email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const res = await request(app)
        .post('/users')
        .send({
          name: 'Duplicate User',
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.error.code).toEqual('CONFLICT');
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/users')
        .send({
          name: 'Invalid User',
          email: 'not-an-email',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error.code).toEqual('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/login', () => {
    const bcrypt = require('bcryptjs');

    it('should login successfully with valid credentials and return JWT token', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        passwordHash: hashedPassword
      });

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should fail login with incorrect password', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        passwordHash: hashedPassword
      });

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.error.code).toEqual('UNAUTHORIZED');
    });
  });

  describe('GET /users/:id (Authenticated Profile Retrieval)', () => {
    it('should allow user to retrieve their own profile', async () => {
      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'supersecretkey_change_in_production';
      const token = jwt.sign({ id: mockUser.id, email: mockUser.email }, secret);

      prisma.user.findUnique.mockResolvedValueOnce({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt
      });

      const res = await request(app)
        .get(`/users/${mockUser.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.id).toEqual(mockUser.id);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('should deny retrieval without authentication token', async () => {
      const res = await request(app).get(`/users/${mockUser.id}`);
      expect(res.statusCode).toEqual(401);
    });
  });
});
