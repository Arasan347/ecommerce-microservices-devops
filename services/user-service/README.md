# User Service

User management and authentication service for the E-Commerce Microservices Platform.

## Features
- User Registration (`POST /users`)
- JWT Authentication (`POST /auth/login`)
- Profile Management (`GET /users/:id`)
- Health and Readiness Checks (`GET /health`, `GET /health/ready`)
- PostgreSQL database integration via Prisma ORM

## Configuration

Environment variables (`.env`):
```env
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/user_db?schema=public
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
