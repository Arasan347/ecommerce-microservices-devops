require('dotenv').config();
const app = require('./app');
const { startOrderConsumer } = require('./messaging/orderConsumer');

const PORT = process.env.PORT || 3003;

app.listen(PORT, async () => {
  console.log(`Order Service running on port ${PORT}`);
  try {
    await startOrderConsumer();
  } catch (err) {
    console.error('[order-service] Error starting consumer:', err.message);
  }
});
