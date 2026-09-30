const { PrismaClient } = require('@prisma/client');
const RabbitMQManager = require('./rabbitmq');

const prisma = new PrismaClient();
const rabbitmq = new RabbitMQManager('notification-service');

const processNotificationEvent = async (event) => {
  const { eventId, eventType, data } = event;
  const { userId, orderId, totalAmountInPaise, transactionReference, reason } = data || {};

  if (!userId) {
    throw new Error('Invalid event payload: missing userId');
  }

  // Idempotency check: verify if this eventId has already been processed
  if (eventId) {
    const existingNotification = await prisma.notification.findUnique({
      where: { eventId }
    });
    if (existingNotification) {
      console.log(`[notification-service] Event ${eventId} already processed. Skipping duplicate notification.`);
      return existingNotification;
    }
  }

  let type;
  let channel = 'EMAIL';
  let message;

  switch (eventType) {
    case 'OrderCreated':
      type = 'ORDER_CREATED';
      channel = 'EMAIL';
      message = `Order ${orderId || ''} has been placed successfully. Total: ₹${((totalAmountInPaise || 0) / 100).toFixed(2)}.`;
      break;

    case 'PaymentProcessed':
      type = 'PAYMENT_SUCCESS';
      channel = 'EMAIL';
      message = `Payment for order ${orderId || ''} was successful (Ref: ${transactionReference || 'N/A'}).`;
      break;

    case 'PaymentFailed':
      type = 'PAYMENT_FAILED';
      channel = 'SMS';
      message = `Payment for order ${orderId || ''} failed: ${reason || 'Transaction declined'}.`;
      break;

    default:
      type = 'ORDER_CREATED';
      message = `Received notification event: ${eventType}`;
      break;
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      orderId: orderId || null,
      type,
      channel,
      status: 'SENT',
      message,
      eventId: eventId || null
    }
  });

  console.log(`[notification-service] Persisted ${type} notification ${notification.id} for user ${userId}`);
  return notification;
};

const startNotificationConsumer = async () => {
  try {
    await rabbitmq.consume({
      queueName: 'notification.queue',
      routingKeys: ['order.created', 'payment.processed', 'payment.failed', 'notification.requested'],
      dlqName: 'notification.dlq',
      maxRetries: 3,
      handler: async (event) => {
        await processNotificationEvent(event);
      }
    });
    console.log('[notification-service] Notification consumer started listening on notification.queue');
  } catch (err) {
    console.error('[notification-service] Failed to start notification consumer:', err.message);
  }
};

module.exports = {
  processNotificationEvent,
  startNotificationConsumer,
  rabbitmq
};
