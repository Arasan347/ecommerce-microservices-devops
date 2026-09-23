const { ServiceUnavailableError, NotFoundError } = require('../utils/errors');

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
}

module.exports = ProductClient;
