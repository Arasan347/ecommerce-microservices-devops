
const amqp = require("amqplib");

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ||
  "amqp://admin:admin123@localhost:5672";

async function main() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createConfirmChannel();

  try {
    const message = await channel.get("payment.dlq", {
      noAck: false,
    });

    if (!message) {
      throw new Error("No message found in payment.dlq");
    }

    const dlqMessage = JSON.parse(message.content.toString());

    // Extract the original OrderCreated event from nested wrappers.
    let originalEvent = dlqMessage;

    for (let depth = 0; depth < 10; depth++) {
      if (
        originalEvent?.eventId &&
        originalEvent?.data?.orderId &&
        originalEvent?.data?.userId &&
        originalEvent?.data?.totalAmountInPaise != null
      ) {
        break;
      }

      originalEvent = originalEvent?.body;
    }

    if (
      !originalEvent?.eventId ||
      !originalEvent?.data?.orderId ||
      !originalEvent?.data?.userId ||
      originalEvent?.data?.totalAmountInPaise == null
    ) {
      channel.nack(message, false, true);
      throw new Error("Original OrderCreated event not found");
    }

    console.log("Recovering event:", originalEvent.eventId);
    console.log("Order ID:", originalEvent.data.orderId);

    channel.sendToQueue(
      "payment.queue",
      Buffer.from(JSON.stringify(originalEvent)),
      {
        persistent: true,
        contentType: "application/json",
      }
    );

    // Wait for RabbitMQ to confirm the new message.
    await channel.waitForConfirms();

    // Acknowledge the old wrapper only after successful publication.
    channel.ack(message);

    console.log("Recovery publication confirmed.");
    console.log("Original DLQ wrapper acknowledged.");
  } catch (error) {
    console.error("Recovery failed:", error.message);
    throw error;
  } finally {
    await channel.close();
    await connection.close();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
