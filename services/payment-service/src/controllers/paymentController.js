const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const { NotFoundError, ConflictError } = require('../utils/errors');
const RabbitMQManager = require('../messaging/rabbitmq');

const prisma = new PrismaClient();
const rabbitmq = new RabbitMQManager('payment-service');

const createPaymentSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  userId: z.string().min(1, 'userId is required'),
  amountInPaise: z.number().int('amountInPaise must be an integer').gt(0, 'amountInPaise must be greater than 0'),
  simulateFailure: z.boolean().optional()
});

const createPayment = async (req, res, next) => {
  try {
    const { orderId, userId, amountInPaise, simulateFailure } = createPaymentSchema.parse(req.body);

    const existingPayment = await prisma.payment.findFirst({
      where: { orderId }
    });

    if (existingPayment) {
      throw new ConflictError(`Payment for orderId ${orderId} already exists`);
    }

    const isSuccess = !simulateFailure;
    const status = isSuccess ? 'SUCCESS' : 'FAILED';
    const transactionReference = `tx_sim_${randomUUID().substring(0, 8)}`;

    const payment = await prisma.payment.create({
      data: {
        orderId,
        userId,
        amountInPaise,
        status,
        transactionReference
      }
    });

    try {
      if (isSuccess) {
        const processedEvent = rabbitmq.createEvent('PaymentProcessed', {
          paymentId: payment.id,
          orderId: payment.orderId,
          userId: payment.userId,
          amountInPaise: payment.amountInPaise,
          status: 'SUCCESS',
          transactionReference: payment.transactionReference
        });
        await rabbitmq.publish('payment.processed', processedEvent);
      } else {
        const failedEvent = rabbitmq.createEvent('PaymentFailed', {
          paymentId: payment.id,
          orderId: payment.orderId,
          userId: payment.userId,
          amountInPaise: payment.amountInPaise,
          status: 'FAILED',
          reason: 'Simulated payment failure'
        });
        await rabbitmq.publish('payment.failed', failedEvent);
      }
    } catch (msgErr) {
      console.warn('Failed to publish payment event from REST controller:', msgErr.message);
    }

    return res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
};

const getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await prisma.payment.findUnique({
      where: { id }
    });

    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    return res.status(200).json(payment);
  } catch (error) {
    next(error);
  }
};

const getPaymentsByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json(payments);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPaymentSchema,
  createPayment,
  getPaymentById,
  getPaymentsByOrderId
};
