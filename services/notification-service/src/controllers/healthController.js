const { PrismaClient } = require('@prisma/client');
const RabbitMQManager = require('../messaging/rabbitmq');

const prisma = new PrismaClient();
const rabbitmq = new RabbitMQManager('notification-service');

const getHealth = (req, res) => {
  return res.status(200).json({
    status: 'UP',
    service: 'notification-service'
  });
};

const getHealthReady = async (req, res) => {
  let dbStatus = 'DISCONNECTED';
  let rmqStatus = 'DISCONNECTED';
  let isReady = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'CONNECTED';
  } catch (error) {
    isReady = false;
  }

  try {
    const rmqConnected = await rabbitmq.checkHealth();
    if (rmqConnected) {
      rmqStatus = 'CONNECTED';
    } else {
      isReady = false;
    }
  } catch (error) {
    isReady = false;
  }

  if (isReady) {
    return res.status(200).json({
      status: 'UP',
      service: 'notification-service',
      database: dbStatus,
      rabbitmq: rmqStatus
    });
  } else {
    return res.status(503).json({
      status: 'DOWN',
      service: 'notification-service',
      database: dbStatus,
      rabbitmq: rmqStatus
    });
  }
};

module.exports = {
  getHealth,
  getHealthReady
};
