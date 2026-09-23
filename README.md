# E-Commerce Microservices Platform

A production-style, DevOps-ready B2B/B2C E-Commerce Microservices Platform built for enterprise architectural demonstration and portfolio deployment.

---

## 1. Project Overview
This repository contains a modular microservices platform designed following clean architecture, autonomous database per service, container readiness, and cloud-native deployment patterns. 

---

## 2. Current Week 1 Scope
- **User Service** (Port 3001): Manages user accounts, bcrypt password hashing, and JWT authentication.
- **Product Service** (Port 3002): Manages product catalog, pricing, and stock inventory.
- **Order Service** (Port 3003): Handles order placement, validates user and product details via REST APIs, calculates server-side totals, and tracks order statuses.
- **Health Probes**: Liveness (`/health`) and database readiness (`/health/ready`) probes implemented across all services.
- **Automated Tests**: Unit and integration test suites using Jest & Supertest.

---

## 3. Architecture

```
Client / Frontend / Postman
         │
 ┌───────┼──────────────────────────┐
 │       ▼                          ▼
 │  User Service (3001)     Product Service (3002)
 │       │                          │
 │       ▼                          ▼
 │  User PostgreSQL        Product PostgreSQL
 └───────┬──────────────────────────┘
         │ (HTTP REST Validation)
         ▼
    Order Service (3003)
         │
         ▼
    Order PostgreSQL
```

For detailed architectural diagrams and trade-off analysis, see [docs/architecture.md](docs/architecture.md).

---

## 4. Technology Stack
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: PostgreSQL (v14+)
- **ORM**: Prisma ORM
- **Validation**: Zod
- **Authentication**: JWT & bcryptjs
- **Testing**: Jest & Supertest

---

## 5. Microservices Overview

| Microservice | Port | Database | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **User Service** | 3001 | `user_db` | User registration, login, JWT token issuance, user verification. |
| **Product Service** | 3002 | `product_db` | Product catalog CRUD, inventory & price management. |
| **Order Service** | 3003 | `order_db` | Order creation, synchronous REST validation against User & Product services, order status updates. |

---

## 6. Database-per-Service Pattern
Each microservice completely owns its dedicated PostgreSQL database schema. No service can directly query or write to another service's database. Cross-service references (`userId`, `productId`) are handled as application identifiers, validated via HTTP REST endpoints.

---

## 7. Local Setup Instructions

### Prerequisites
1. **Node.js**: v18.x or higher
2. **PostgreSQL**: Running locally on port `5432`

### Database Creation
Create 3 empty databases in PostgreSQL:
```sql
CREATE DATABASE user_db;
CREATE DATABASE product_db;
CREATE DATABASE order_db;
```

---

## 8. Environment Variables

Create `.env` files in each service directory using the provided `.env.example` templates:

**User Service (`services/user-service/.env`)**:
```env
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/user_db?schema=public
JWT_SECRET=supersecretkey_change_in_production
```

**Product Service (`services/product-service/.env`)**:
```env
PORT=3002
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/product_db?schema=public
```

**Order Service (`services/order-service/.env`)**:
```env
PORT=3003
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/order_db?schema=public
USER_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
JWT_SECRET=supersecretkey_change_in_production
```

---

## 9. Database Migration Instructions

Run Prisma migrations for each service:

```bash
# 1. User Service
cd services/user-service
npm install
npx prisma migrate dev --name init

# 2. Product Service
cd ../product-service
npm install
npx prisma migrate dev --name init

# 3. Order Service
cd ../order-service
npm install
npx prisma migrate dev --name init
```

---

## 10. How to Start Each Service

In separate terminal windows:

```bash
# Terminal 1: User Service
cd services/user-service
npm start

# Terminal 2: Product Service
cd services/product-service
npm start

# Terminal 3: Order Service
cd services/order-service
npm start
```

---

## 11. API Usage & End-to-End Flow Example

### Step 1: Register User
`POST http://localhost:3001/users`
```json
{
  "name": "DevOps Candidate",
  "email": "candidate@example.com",
  "password": "securepassword123"
}
```

### Step 2: Login & Receive JWT
`POST http://localhost:3001/auth/login`
```json
{
  "email": "candidate@example.com",
  "password": "securepassword123"
}
```

### Step 3: Create Product
`POST http://localhost:3002/products`
```json
{
  "name": "Developer Laptop",
  "description": "High performance workstation",
  "price": 75000,
  "stock": 10
}
```

### Step 4: Create Order (Authenticated)
`POST http://localhost:3003/orders`
Header: `Authorization: Bearer <JWT_TOKEN_FROM_STEP_2>`
```json
{
  "items": [
    {
      "productId": "<PRODUCT_UUID_FROM_STEP_3>",
      "quantity": 2
    }
  ]
}
```

---

## 12. Testing Instructions

Run automated test suites for each microservice:

```bash
cd services/user-service && npm test
cd services/product-service && npm test
cd services/order-service && npm test
```

---

## 13. Current Limitations
- **Synchronous REST Calls**: Order creation currently relies on synchronous HTTP calls to User and Product services.
- **In-Memory/Mocked Stock Decrement**: Stock updates will be integrated with event-driven message queuing in Week 2.

---

## 14. Future Phases (8-Week DevOps Roadmap)

- **Week 1 (Completed)**: Application Foundation (Node.js, Express, PostgreSQL, Prisma, JWT, REST APIs, Health Probes, Tests)
- **Week 2**: RabbitMQ + Payment Service + Notification Service (Asynchronous Event-Driven Architecture)
- **Week 3**: Docker Containerization & Docker Compose setup
- **Week 4**: Kubernetes Manifests, ConfigMaps, Secrets, Liveness/Readiness Probes (Minikube / Kind)
- **Week 5**: Infrastructure as Code with Terraform & AWS EKS Provisioning
- **Week 6**: CI/CD Automation with GitHub Actions pipelines
- **Week 7**: Observability & Monitoring with Prometheus, Grafana, and ELK Stack
- **Week 8**: Security Hardening, Failure Mode Testing, and Final Portfolio Documentation