const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../utils/errors');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'));
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'supersecretkey_change_in_production';

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }
};

module.exports = authMiddleware;
