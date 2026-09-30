const express = require('express');
const {
  createOrder,
  getOrderById,
  getOrdersByUserId,
  updateOrderStatus,
  createOrderSchema,
  updateStatusSchema
} = require('../controllers/orderController');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, validate(createOrderSchema), createOrder);
router.get('/:id', getOrderById);
router.get('/user/:userId', getOrdersByUserId);
router.put('/:id/status', validate(updateStatusSchema), updateOrderStatus);

module.exports = router;
