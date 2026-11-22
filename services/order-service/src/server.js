require('dotenv').config();
const app = require('./app');
const { startOrderConsumer, rabbitmq } = require('./messaging/orderConsumer');

const PORT = process.env.PORT || 3003;

const server = app.listen(PORT, async () => {
  console.log(`Order Service running on port ${PORT}`);
  try {
    await startOrderConsumer();
  } catch (err) {
    console.error('[order-service] Error starting consumer:', err.message);
  }
});

let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[order-service] Received ${signal}. Initiating graceful shutdown...`);

  server.close(async (err) => {
    if (err) {
      console.error('[order-service] Error closing HTTP server:', err.message);
    } else {
      console.log('[order-service] HTTP server closed');
    }

    try {
      await rabbitmq.close();
      console.log('[order-service] RabbitMQ connection closed');
    } catch (rmqErr) {
      console.error('[order-service] Error closing RabbitMQ:', rmqErr.message);
    }

    process.exit(0);
  });

  setTimeout(() => {
    console.error('[order-service] Graceful shutdown timeout exceeded. Exiting forcefully.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
