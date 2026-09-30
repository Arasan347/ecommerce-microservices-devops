const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const RabbitMQManager = require('./rabbitmq');

const prisma = new PrismaClient();
const rabbitmq = new RabbitMQManager('payment-service');

const processPaymentEvent = async (event) => {
  const { eventId, data } = event;
  const { orderId, userId, totalAmountInPaise, simulateFailure } = data || {};

  if (!orderId || !userId || totalAmountInPaise === undefined) {
    throw new Error('Invalid OrderCreated payload: missing orderId, userId, or totalAmountInPaise');
  }

  // Idempotency check: check if eventId or orderId payment has already been processed
  if (eventId) {
    const existingByEvent = await prisma.payment.findUnique({
      where: { eventId }
    });
    if (existingByEvent) {
      console.log(`[payment-service] Duplicate event detected (eventId: ${eventId}). Skipping processing.`);
      return existingByEvent;
    }
  }

  const existingByOrder = await prisma.payment.findFirst({
    where: { orderId }
  });

  if (existingByOrder) {
    console.log(`[payment-service] Payment already exists for orderId ${orderId}. Skipping processing.`);
    return existingByOrder;
  }

  // Determine payment status (Simulated: SUCCESS by default, FAILED if simulateFailure is true)
  const isSuccess = !simulateFailure;
  const status = isSuccess ? 'SUCCESS' : 'FAILED';
  const transactionReference = `tx_sim_${randomUUID().substring(0, 8)}`;

  // Create payment record in payment_db
  const payment = await prisma.payment.create({
    data: {
      orderId,
      userId,
      amountInPaise: totalAmountInPaise,
      status,
      transactionReference,
      eventId: eventId || null
    }
  });

  console.log(`[payment-service] Created payment ${payment.id} with status ${status} for order ${orderId}`);

  // Publish event to RabbitMQ
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
      reason: 'Simulated payment processing failure'
    });
    await rabbitmq.publish('payment.failed', failedEvent);
  }

  return payment;
};

const startPaymentConsumer = async () => {
  try {
    await rabbitmq.consume({
      queueName: 'payment.queue',
      routingKeys: ['order.created'],
      dlqName: 'payment.dlq',
      maxRetries: 3,
      handler: async (event) => {
        await processPaymentEvent(event);
      }
    });
    console.log('[payment-service] Payment consumer started listening on payment.queue');
  } catch (err) {
    console.error('[payment-service] Failed to start payment consumer:', err.message);
  }
};

module.exports = {
  processPaymentEvent,
  startPaymentConsumer,
  rabbitmq
};
