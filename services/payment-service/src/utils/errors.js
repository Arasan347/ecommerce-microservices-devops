class AppError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'PAYMENT_NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request data') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Duplicate payment request') {
    super(message, 409, 'PAYMENT_CONFLICT');
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError
};
