const { ServiceUnavailableError, NotFoundError, InsufficientStockError } = require('../utils/errors');

class ProductClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
  }

  async getProductById(productId) {
    try {
      const response = await fetch(`${this.baseUrl}/products/${productId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service': 'order-service'
        }
      });

      if (response.status === 404) {
        throw new NotFoundError(`Product with ID ${productId} not found in Product Service`);
      }

      if (!response.ok) {
        throw new ServiceUnavailableError(`Product Service returned HTTP status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError(`Failed to communicate with Product Service: ${error.message}`);
    }
  }

  async reserveStock(productId, quantity) {
    try {
      const response = await fetch(`${this.baseUrl}/products/${productId}/reserve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service': 'order-service'
        },
        body: JSON.stringify({ quantity })
      });

      if (response.status === 404) {
        throw new NotFoundError(`Product with ID ${productId} not found in Product Service`);
      }

      if (response.status === 409 || response.status === 400) {
        const data = await response.json();
        throw new InsufficientStockError(data.error?.message || 'Insufficient stock for product reservation');
      }

      if (!response.ok) {
        throw new ServiceUnavailableError(`Product Service returned HTTP status ${response.status} on inventory reservation`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof InsufficientStockError || error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError(`Failed to communicate with Product Service during stock reservation: ${error.message}`);
    }
  }
}

module.exports = ProductClient;
