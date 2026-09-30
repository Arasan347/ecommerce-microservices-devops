const express = require('express');
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  reserveStock,
  createProductSchema,
  updateProductSchema,
  reserveStockSchema
} = require('../controllers/productController');
const validate = require('../middleware/validate');

const router = express.Router();

router.post('/', validate(createProductSchema), createProduct);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.put('/:id', validate(updateProductSchema), updateProduct);
router.delete('/:id', deleteProduct);
router.post('/:id/reserve', validate(reserveStockSchema), reserveStock);

module.exports = router;
