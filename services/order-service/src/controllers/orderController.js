const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const UserClient = require('../services/userClient');
const ProductClient = require('../services/productClient');
const { NotFoundError, InsufficientStockError, ValidationError } = require('../utils/errors');

const prisma = new PrismaClient();
const userClient = new UserClient();
const productClient = new ProductClient();

const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1, 'productId is required'),
      quantity: z.number().int('Quantity must be an integer').min(1, 'Quantity must be at least 1')
    })
  ).min(1, 'Order must contain at least one item')
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'], {
    errorMap: () => ({ message: 'Status must be one of: PENDING, CONFIRMED, CANCELLED, COMPLETED' })
  })
});

const createOrder = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;

    // Step 1: Verify User exists in User Service
    await userClient.getUserById(userId);

    // Step 2 & 3: Verify each product, check inventory, and retrieve server-side price
    let totalAmount = 0;
    const preparedItems = [];

    for (const item of items) {
      const product = await productClient.getProductById(item.productId);

      if (product.stock < item.quantity) {
        throw new InsufficientStockError(
          `Product ${product.name} (ID: ${product.id}) has insufficient stock. Available: ${product.stock}, requested: ${item.quantity}`
        );
      }

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;

      preparedItems.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price
      });
    }

    // Round totalAmount to 2 decimal places
    totalAmount = Math.round(totalAmount * 100) / 100;

    // Step 4: Create Order and OrderItems in Order DB
    const order = await prisma.order.create({
      data: {
        userId,
        status: 'PENDING',
        totalAmount,
        items: {
          create: preparedItems
        }
      },
      include: {
        items: true
      }
    });

    return res.status(201).json(order);
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true
      }
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    return res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

const getOrdersByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        items: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.status(200).json(orders);
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const existingOrder = await prisma.order.findUnique({
      where: { id }
    });

    if (!existingOrder) {
      throw new NotFoundError('Order not found');
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        items: true
      }
    });

    return res.status(200).json(updatedOrder);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrderSchema,
  updateStatusSchema,
  createOrder,
  getOrderById,
  getOrdersByUserId,
  updateOrderStatus
};
