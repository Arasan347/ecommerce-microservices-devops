require('dotenv').config();
const app = require('./app');
const { startPaymentConsumer, rabbitmq } = require('./messaging/paymentConsumer');

const PORT = process.env.PORT || 3004;

const server = app.listen(PORT, async () => {
  console.log(`Payment Service running on port ${PORT}`);
  try {
    await startPaymentConsumer();
  } catch (err) {
    console.error('[payment-service] Error starting consumer:', err.message);
  }
});

let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[payment-service] Received ${signal}. Initiating graceful shutdown...`);

  server.close(async (err) => {
    if (err) {
      console.error('[payment-service] Error closing HTTP server:', err.message);
    } else {
      console.log('[payment-service] HTTP server closed');
    }

    try {
      await rabbitmq.close();
      console.log('[payment-service] RabbitMQ connection closed');
    } catch (rmqErr) {
      console.error('[payment-service] Error closing RabbitMQ:', rmqErr.message);
    }

    process.exit(0);
  });

  setTimeout(() => {
    console.error('[payment-service] Graceful shutdown timeout exceeded. Exiting forcefully.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
