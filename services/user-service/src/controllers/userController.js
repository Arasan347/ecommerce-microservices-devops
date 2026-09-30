const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { NotFoundError, ConflictError, ForbiddenError } = require('../utils/errors');

const prisma = new PrismaClient();

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  email: z.string().email('Invalid email format').toLowerCase().trim(),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const createUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Internal service call check via header or authenticated user check
    const isInternalCall = req.headers['x-internal-service'] === 'order-service';
    const isSelf = req.user && req.user.id === id;

    if (!isInternalCall && !isSelf) {
      throw new ForbiddenError('You are not authorized to view this profile');
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerSchema,
  createUser,
  getUserById
};
