const express = require('express');
const {
  createPayment,
  getPaymentById,
  getPaymentsByOrderId,
  createPaymentSchema
} = require('../controllers/paymentController');
const validate = require('../middleware/validate');

const router = express.Router();

router.post('/', validate(createPaymentSchema), createPayment);
router.get('/:id', getPaymentById);
router.get('/order/:orderId', getPaymentsByOrderId);

module.exports = router;
