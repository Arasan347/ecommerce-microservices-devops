const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/users', userRoutes);
app.use('/auth', authRoutes);

// Error handler
app.use(errorHandler);

module.exports = app;
