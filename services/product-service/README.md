# Product Service

Product catalog and inventory management microservice for the E-Commerce Platform.

## Features
- Create Product (`POST /products`)
- List Products (`GET /products`)
- Get Product Detail (`GET /products/:id`)
- Update Product & Inventory (`PUT /products/:id`)
- Delete Product (`DELETE /products/:id`)
- Health Check (`GET /health`, `GET /health/ready`)
- Dedicated PostgreSQL database via Prisma ORM

## Configuration

Environment variables (`.env`):
```env
PORT=3002
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/product_db?schema=public
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
