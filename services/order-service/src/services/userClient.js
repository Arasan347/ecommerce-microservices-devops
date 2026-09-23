const { ServiceUnavailableError, NotFoundError } = require('../utils/errors');

class UserClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.USER_SERVICE_URL || 'http://localhost:3001';
  }

  async getUserById(userId) {
    try {
      const response = await fetch(`${this.baseUrl}/users/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service': 'order-service'
        }
      });

      if (response.status === 404) {
        throw new NotFoundError(`User with ID ${userId} not found in User Service`);
      }

      if (!response.ok) {
        throw new ServiceUnavailableError(`User Service returned HTTP status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError(`Failed to communicate with User Service: ${error.message}`);
    }
  }
}

module.exports = UserClient;
