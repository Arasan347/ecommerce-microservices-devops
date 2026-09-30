# Order Service

Order processing microservice for the E-Commerce Microservices Platform.

## Features
- Create Order (`POST /orders`) - Validates User & Product stock via REST APIs
- Get Order Detail (`GET /orders/:id`)
- Get Orders by User ID (`GET /orders/user/:userId`)
- Update Order Status (`PUT /orders/:id/status`)
- Health and Readiness Checks (`GET /health`, `GET /health/ready`)
- Dedicated PostgreSQL database via Prisma ORM

## Configuration

Environment variables (`.env`):
```env
PORT=3003
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/order_db?schema=public
USER_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
JWT_SECRET=supersecretkey_change_in_production
```

## Database Migrations
```bash
npm run prisma:generate
npm run prisma:migrate
```

## Running the Service
```bash
npm start
# or for development
npm run dev
```

## Testing
```bash
npm test
```
