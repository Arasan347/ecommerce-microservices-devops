const { PrismaClient } = require('@prisma/client');
const { NotFoundError } = require('../utils/errors');

const prisma = new PrismaClient();

const getNotificationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    return res.status(200).json(notification);
  } catch (error) {
    next(error);
  }
};

const getNotificationsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotificationById,
  getNotificationsByUserId
};
