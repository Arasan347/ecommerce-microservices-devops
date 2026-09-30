const { PrismaClient } = require('@prisma/client');
const RabbitMQManager = require('./rabbitmq');

const prisma = new PrismaClient();
const rabbitmq = new RabbitMQManager('order-service');

const startOrderConsumer = async () => {
  try {
    await rabbitmq.consume({
      queueName: 'order.queue',
      routingKeys: ['payment.processed', 'payment.failed'],
      dlqName: 'order.dlq',
      maxRetries: 3,
      handler: async (event) => {
        const { eventType, data } = event;
        const { orderId } = data || {};

        if (!orderId) {
          console.warn('[order-service] Event missing orderId:', event);
          return;
        }

        const existingOrder = await prisma.order.findUnique({
          where: { id: orderId }
        });

        if (!existingOrder) {
          console.warn(`[order-service] Order ${orderId} not found`);
          return;
        }

        if (eventType === 'PaymentProcessed') {
          if (existingOrder.status === 'PENDING') {
            await prisma.order.update({
              where: { id: orderId },
              data: { status: 'CONFIRMED' }
            });
            console.log(`[order-service] Order ${orderId} status updated to CONFIRMED`);
          }
        } else if (eventType === 'PaymentFailed') {
          if (existingOrder.status === 'PENDING') {
            await prisma.order.update({
              where: { id: orderId },
              data: { status: 'CANCELLED' }
            });
            console.log(`[order-service] Order ${orderId} status updated to CANCELLED`);
          }
        }
      }
    });
    console.log('[order-service] Order consumer started listening on order.queue');
  } catch (err) {
    console.error('[order-service] Failed to start order consumer:', err.message);
  }
};

module.exports = { startOrderConsumer, rabbitmq };
