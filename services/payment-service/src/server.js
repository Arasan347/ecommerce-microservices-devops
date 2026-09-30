require('dotenv').config();
const app = require('./app');
const { startPaymentConsumer } = require('./messaging/paymentConsumer');

const PORT = process.env.PORT || 3004;

app.listen(PORT, async () => {
  console.log(`Payment Service running on port ${PORT}`);
  await startPaymentConsumer();
});
