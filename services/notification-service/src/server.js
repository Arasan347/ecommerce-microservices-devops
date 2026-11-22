require('dotenv').config();
const app = require('./app');
const { startNotificationConsumer, rabbitmq } = require('./messaging/notificationConsumer');

const PORT = process.env.PORT || 3005;

const server = app.listen(PORT, async () => {
  console.log(`Notification Service running on port ${PORT}`);
  try {
    await startNotificationConsumer();
  } catch (err) {
    console.error('[notification-service] Error starting consumer:', err.message);
  }
});

let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[notification-service] Received ${signal}. Initiating graceful shutdown...`);

  server.close(async (err) => {
    if (err) {
      console.error('[notification-service] Error closing HTTP server:', err.message);
    } else {
      console.log('[notification-service] HTTP server closed');
    }

    try {
      await rabbitmq.close();
      console.log('[notification-service] RabbitMQ connection closed');
    } catch (rmqErr) {
      console.error('[notification-service] Error closing RabbitMQ:', rmqErr.message);
    }

    process.exit(0);
  });

  setTimeout(() => {
    console.error('[notification-service] Graceful shutdown timeout exceeded. Exiting forcefully.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
