# E-Commerce Microservices Platform

A production-style, DevOps-ready B2B/B2C E-Commerce Microservices Platform built for enterprise architectural demonstration and portfolio deployment.

---

## 1. Project Overview
This repository contains a modular microservices platform designed following clean architecture, database-per-service pattern, hybrid synchronous REST & asynchronous event-driven messaging with RabbitMQ, money-safe financial processing, container readiness, and cloud-native deployment patterns.

---

## 2. Microservices Architecture & Port Mapping

| Microservice | Port | Database | Primary Responsibility | Communication |
| :--- | :--- | :--- | :--- | :--- |
| **User Service** | 3001 | `user_db` | User registration, password hashing (bcrypt), JWT authentication, user lookup. | REST API |
| **Product Service** | 3002 | `product_db` | Product catalog CRUD, money-safe pricing in paise (`priceInPaise`), atomic inventory reservation (`POST /products/:id/reserve`). | REST API |
| **Order Service** | 3003 | `order_db` | Order creation (`PENDING`), stock reservation call, total calculation in paise, publishing `OrderCreated` event, status state machine (`CONFIRMED`, `CANCELLED`, `COMPLETED`). | REST API + AMQP Publisher & Consumer |
| **Payment Service** | 3004 | `payment_db` | Asynchronous payment processing, event consumption (`order.created`), idempotent record creation, event publishing (`payment.processed`, `payment.failed`). | REST API + AMQP Publisher & Consumer |
| **Notification Service** | 3005 | `notification_db` | Asynchronous user notifications (Email/SMS) on `OrderCreated`, `PaymentProcessed`, `PaymentFailed`, idempotent event recording. | REST API + AMQP Consumer |
| **RabbitMQ Broker** | 5672 / 15672 | N/A | Topic exchange `ecommerce.events`, persistent message queues, dead letter queues (DLQs). | AMQP Protocol |

---

## 3. Key Week 2 Architecture Principles

### 3.1 Synchronous vs Asynchronous Communication Trade-Offs
- **Synchronous HTTP REST**: Used for immediate operations where the user expects an instant response (User authentication, Product catalog lookups, stock availability reservation).
- **Asynchronous AMQP Events**: Used for non-blocking downstream workflows (Payment processing, Order status reconciliation, Email/SMS notifications). Decouples services, improves overall system availability, and protects against service downtime cascading.

### 3.2 Money-Safe Integer Financial Calculations
- All monetary values are handled as **positive integers in paise** (e.g. ₹750.50 is stored and processed as `75050`).
- Eliminates floating-point arithmetic rounding errors across databases, API contracts, and event payloads.

### 3.3 Idempotency & Message Deduplication
- All event payloads carry a unique `eventId` UUID.
- Consumer services (`Payment Service`, `Notification Service`) perform database checks before processing. If an `eventId` or `orderId` payment has already been recorded, duplicate processing is gracefully skipped and acknowledged without side effects.

### 3.4 Retries & Dead Letter Queues (DLQ)
- Unhandled consumer errors trigger up to **3 retry attempts** using header tracking (`x-retry-count`).
- After 3 failed attempts, messages are safely routed to dedicated Dead Letter Queues (`payment.dlq`, `notification.dlq`, `order.dlq`) to prevent infinite looping and log unprocessable messages.

---

## 4. Architecture Diagram

```mermaid
graph TD
    Client[Client / Frontend / Postman]

    subgraph Synchronous REST Layer
        US[User Service - Port 3001]
        PS[Product Service - Port 3002]
        OS[Order Service - Port 3003]
    end

    subgraph Message Broker Layer
        RMQ[RabbitMQ Exchange: ecommerce.events]
    end

    subgraph Asynchronous Consumer Layer
        PAY[Payment Service - Port 3004]
        NOTIF[Notification Service - Port 3005]
    end

    subgraph Databases
        UDB[(User PostgreSQL)]
        PDB[(Product PostgreSQL)]
        ODB[(Order PostgreSQL)]
        PAYDB[(Payment PostgreSQL)]
        NDB[(Notification PostgreSQL)]
    end

    US --- UDB
    PS --- PDB
    OS --- ODB
    PAY --- PAYDB
    NOTIF --- NDB

    Client -->|REST| US
    Client -->|REST| PS
    Client -->|REST| OS

    OS -->|1. Sync Stock Reservation| PS
    OS -->|2. Publish OrderCreated| RMQ
    RMQ -->|order.created| PAY
    RMQ -->|order.created| NOTIF

    PAY -->|3. Publish PaymentProcessed / PaymentFailed| RMQ
    RMQ -->|payment.processed / payment.failed| OS
    RMQ -->|payment.processed / payment.failed| NOTIF
```

---

## 5. Local Setup Instructions

### Prerequisites
1. **Node.js**: v18.x or higher
2. **PostgreSQL**: Running on port `5432`
3. **RabbitMQ**: Running on port `5672` (e.g. via Docker: `docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management`)

### Database Creation
Create 5 empty PostgreSQL databases:
```sql
CREATE DATABASE user_db;
CREATE DATABASE product_db;
CREATE DATABASE order_db;
CREATE DATABASE payment_db;
CREATE DATABASE notification_db;
```

---

## 6. Environment Variables

Create `.env` files in each service directory using the `.env.example` files provided:

**Order Service (`services/order-service/.env`)**:
```env
PORT=3003
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/order_db?schema=public
USER_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
RABBITMQ_URL=amqp://localhost:5672
JWT_SECRET=supersecretkey_change_in_production
```

**Payment Service (`services/payment-service/.env`)**:
```env
PORT=3004
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_db?schema=public
RABBITMQ_URL=amqp://localhost:5672
```

**Notification Service (`services/notification-service/.env`)**:
```env
PORT=3005
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notification_db?schema=public
RABBITMQ_URL=amqp://localhost:5672
```

---

## 7. Database Migration Instructions

Run Prisma migrations across all microservices:

```bash
cd services/user-service && npm install && npx prisma migrate dev --name init
cd ../product-service && npm install && npx prisma migrate dev --name init
cd ../order-service && npm install && npx prisma migrate dev --name init
cd ../payment-service && npm install && npx prisma migrate dev --name init
cd ../notification-service && npm install && npx prisma migrate dev --name init
```

---

## 8. How to Start All Services

In 5 separate terminal windows:

```bash
# Terminal 1: User Service
cd services/user-service && npm start

# Terminal 2: Product Service
cd services/product-service && npm start

# Terminal 3: Order Service
cd services/order-service && npm start

# Terminal 4: Payment Service
cd services/payment-service && npm start

# Terminal 5: Notification Service
cd services/notification-service && npm start
```

---

## 9. API Usage & End-to-End Event Flow

### Step 1: Register User & Receive JWT Token
`POST http://localhost:3001/users`
```json
{
  "name": "E2E Tester",
  "email": "e2e@example.com",
  "password": "securepassword123"
}
```

`POST http://localhost:3001/auth/login` -> copy `token`.

### Step 2: Create Product with Price in Paise
`POST http://localhost:3002/products`
```json
{
  "name": "Developer Workstation",
  "description": "High performance computer",
  "priceInPaise": 15000000,
  "stock": 10
}
```

### Step 3: Place Order
`POST http://localhost:3003/orders`
Header: `Authorization: Bearer <JWT_TOKEN>`
```json
{
  "items": [
    {
      "productId": "<PRODUCT_UUID>",
      "quantity": 1
    }
  ]
}
```
**Behind the Scenes Event Flow**:
1. Order Service calls Product Service `POST /products/:id/reserve` to atomically decrement stock.
2. Order created in DB as `PENDING`.
3. Order Service publishes `OrderCreated` event (`order.created`).
4. Payment Service consumes `order.created`, creates payment record, simulates transaction, and publishes `PaymentProcessed` (`payment.processed`).
5. Order Service consumes `payment.processed` and transitions order status from `PENDING` to `CONFIRMED`.
6. Notification Service consumes both `OrderCreated` and `PaymentProcessed` and stores notifications for the user.

---

## 10. Automated Test Execution

Run test suites for all microservices:

```bash
cd services/user-service && npm test
cd services/product-service && npm test
cd services/order-service && npm test
cd services/payment-service && npm test
cd services/notification-service && npm test
```

---

## 11. DevOps & Application Roadmap

- **Week 1 (Completed)**: Foundation Services (User, Product, Order), PostgreSQL, REST APIs, Health Checks, Tests
- **Week 2 (Completed)**: RabbitMQ, Payment Service, Notification Service, Event-Driven Architecture, Retries/DLQ, Money in Paise, Idempotency, Inventory Reservation
- **Week 3**: Docker Containerization & Docker Compose setup
- **Week 4**: Kubernetes Manifests, ConfigMaps, Secrets, Liveness/Readiness Probes (Minikube / Kind)
- **Week 5**: Infrastructure as Code with Terraform & AWS EKS Provisioning
- **Week 6**: CI/CD Automation with GitHub Actions pipelines
- **Week 7**: Observability & Monitoring with Prometheus, Grafana, and ELK Stack
- **Week 8**: Security Hardening, Chaos/Failure Mode Testing, Portfolio Release