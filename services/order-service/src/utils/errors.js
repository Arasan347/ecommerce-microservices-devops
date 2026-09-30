class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'ORDER_NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request data') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Dependent service unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

class InsufficientStockError extends AppError {
  constructor(message = 'Insufficient product stock') {
    super(message, 400, 'INSUFFICIENT_STOCK');
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ServiceUnavailableError,
  InsufficientStockError
};
