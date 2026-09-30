const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const UserClient = require('../services/userClient');
const ProductClient = require('../services/productClient');
const RabbitMQManager = require('../messaging/rabbitmq');
const { NotFoundError, InsufficientStockError, ValidationError } = require('../utils/errors');

const prisma = new PrismaClient();
const userClient = new UserClient();
const productClient = new ProductClient();
const rabbitmq = new RabbitMQManager('order-service');

const VALID_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED'],
  CANCELLED: [],
  COMPLETED: []
};

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
    const { items } = createOrderSchema.parse(req.body);

    // Step 1: Verify User exists in User Service
    await userClient.getUserById(userId);

    // Step 2 & 3: Reserve inventory and retrieve server-side priceInPaise for each item
    let totalAmountInPaise = 0;
    const preparedItems = [];

    for (const item of items) {
      // reserveStock returns updated product containing priceInPaise
      const product = await productClient.reserveStock(item.productId, item.quantity);

      const itemPriceInPaise = product.priceInPaise ?? Math.round((product.price || 0) * 100);
      const itemTotalInPaise = itemPriceInPaise * item.quantity;
      totalAmountInPaise += itemTotalInPaise;

      preparedItems.push({
        productId: product.id,
        quantity: item.quantity,
        priceInPaise: itemPriceInPaise
      });
    }

    // Step 4: Create Order in Order DB (Status: PENDING)
    const order = await prisma.order.create({
      data: {
        userId,
        status: 'PENDING',
        totalAmountInPaise,
        items: {
          create: preparedItems
        }
      },
      include: {
        items: true
      }
    });

    // Step 5: Publish OrderCreated event asynchronously to RabbitMQ
    try {
      const event = rabbitmq.createEvent('OrderCreated', {
        orderId: order.id,
        userId: order.userId,
        totalAmountInPaise: order.totalAmountInPaise,
        items: order.items
      });
      await rabbitmq.publish('order.created', event);
    } catch (msgErr) {
      console.warn('RabbitMQ publish failed for OrderCreated, order created in DB:', msgErr.message);
    }

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
    const { status: targetStatus } = updateStatusSchema.parse(req.body);

    const existingOrder = await prisma.order.findUnique({
      where: { id }
    });

    if (!existingOrder) {
      throw new NotFoundError('Order not found');
    }

    const currentStatus = existingOrder.status;
    const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

    if (currentStatus !== targetStatus && !allowedNextStatuses.includes(targetStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${currentStatus} to ${targetStatus}. Allowed transitions from ${currentStatus}: [${allowedNextStatuses.join(', ')}]`
      );
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status: targetStatus },
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
