const { AppError } = require('../utils/errors');
const { ZodError } = require('zod');

const errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    const message = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message
      }
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message
      }
    });
  }

  console.error('Unhandled error in Product Service:', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
};

module.exports = errorHandler;
