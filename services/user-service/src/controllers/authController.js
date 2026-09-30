const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { UnauthorizedError } = require('../utils/errors');

const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required')
});

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const secret = process.env.JWT_SECRET || 'supersecretkey_change_in_production';
    const token = jwt.sign(
      { id: user.id, email: user.email },
      secret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({ token });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  loginSchema,
  login
};
