require('dotenv').config();
const app = require('./app');
const { startNotificationConsumer } = require('./messaging/notificationConsumer');

const PORT = process.env.PORT || 3005;

app.listen(PORT, async () => {
  console.log(`Notification Service running on port ${PORT}`);
  await startNotificationConsumer();
});
