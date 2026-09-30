const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const orderRoutes = require('./routes/orderRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/orders', orderRoutes);

// Error handler
app.use(errorHandler);

module.exports = app;
