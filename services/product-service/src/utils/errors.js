class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'PRODUCT_NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request data') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class InsufficientStockError extends AppError {
  constructor(message = 'Insufficient stock available') {
    super(message, 409, 'INSUFFICIENT_STOCK');
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  InsufficientStockError
};
