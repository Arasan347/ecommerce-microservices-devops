# Payment Service

## Overview
The Payment Service (Port 3004) processes e-commerce payments asynchronously using RabbitMQ events and persists payment records in PostgreSQL (`payment_db`).

## Features
- **Database**: PostgreSQL (`payment_db`) via Prisma ORM
- **Async Event Consumption**: Listens on RabbitMQ queue `payment.queue` bound to `order.created`
- **Async Event Publishing**: Publishes `payment.processed` or `payment.failed` to `ecommerce.events` topic exchange
- **Idempotency**: Prevents duplicate payment processing using `eventId` and `orderId` checks
- **Retries & Dead Letter Queue**: Up to 3 processing retries before routing failed messages to `payment.dlq`
- **Health Checks**: `/health` (Liveness) and `/health/ready` (Readiness: PostgreSQL + RabbitMQ)

## Environment Variables
```env
PORT=3004
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_db?schema=public
RABBITMQ_URL=amqp://localhost:5672
```

## API Endpoints
- `POST /payments`: Manually initiate/process payment
- `GET /payments/:id`: Get payment details by ID
- `GET /payments/order/:orderId`: Get payments for a specific order
- `GET /health`: Liveness probe
- `GET /health/ready`: Database and RabbitMQ readiness probe
