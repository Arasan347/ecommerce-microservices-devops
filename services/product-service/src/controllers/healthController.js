const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getHealth = (req, res) => {
  return res.status(200).json({
    status: 'UP',
    service: 'product-service'
  });
};

const getHealthReady = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      status: 'UP',
      service: 'product-service',
      database: 'CONNECTED'
    });
  } catch (error) {
    return res.status(503).json({
      status: 'DOWN',
      service: 'product-service',
      database: 'DISCONNECTED',
      error: error.message
    });
  }
};

module.exports = {
  getHealth,
  getHealthReady
};
