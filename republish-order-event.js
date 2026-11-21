
const amqp = require("amqplib");

const event = {
  eventId: "3f90ea94-4b85-4c24-b1bf-ccb0d9a1becf",
  eventType: "OrderCreated",
  timestamp: "2026-10-15T15:10:26.962Z",
  source: "order-service",
  data: {
    orderId: "0f2b613a-c4cf-487c-9ffe-af488adb657a",
    userId: "6795d79b-5547-4a5d-a973-9abb0bf43215",
    totalAmountInPaise: 50000,
    items: [
      {
        id: "cdf516a1-eb16-4540-8bd6-114664286afd",
        orderId: "0f2b613a-c4cf-487c-9ffe-af488adb657a",
        productId: "48df70f2-282d-4f38-91f4-17522fca38e1",
        quantity: 1,
        priceInPaise: 50000
      }
    ]
  }
};

async function main() {
  const url =
    process.env.RABBITMQ_URL ||
    "amqp://admin:admin123@localhost:5672";

  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();

  try {
    await channel.assertQueue("payment.queue", { durable: true });

    const accepted = channel.sendToQueue(
      "payment.queue",
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true,
        contentType: "application/json"
      }
    );

    if (!accepted) {
      throw new Error("RabbitMQ write buffer is full");
    }

    await channel.waitForConfirms();
    console.log("Original OrderCreated event republished.");
    console.log("Event ID:", event.eventId);
    console.log("Order ID:", event.data.orderId);
  } finally {
    await channel.close();
    await connection.close();
  }
}

main().catch((error) => {
  console.error("Publish failed:", error.message);
  process.exitCode = 1;
});
