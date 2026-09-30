# Notification Service

## Overview
The Notification Service (Port 3005) consumes order and payment events asynchronously via RabbitMQ and persists notification records in PostgreSQL (`notification_db`).

## Features
- **Database**: PostgreSQL (`notification_db`) via Prisma ORM
- **Async Event Consumption**: Listens on RabbitMQ queue `notification.queue` bound to `order.created`, `payment.processed`, `payment.failed`, and `notification.requested`
- **Idempotency**: Prevents duplicate notification processing using `eventId` checks
- **Retries & Dead Letter Queue**: Up to 3 retries before routing unprocessable messages to `notification.dlq`
- **Health Checks**: `/health` (Liveness) and `/health/ready` (Readiness: PostgreSQL + RabbitMQ)

## Environment Variables
```env
PORT=3005
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notification_db?schema=public
RABBITMQ_URL=amqp://localhost:5672
```

## API Endpoints
- `GET /notifications/:id`: Get notification by ID
- `GET /notifications/user/:userId`: Get all notifications for a specific user
- `GET /health`: Liveness probe
- `GET /health/ready`: Database and RabbitMQ readiness probe
