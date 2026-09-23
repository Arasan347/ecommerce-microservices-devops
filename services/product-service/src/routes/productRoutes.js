const express = require('express');
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  createProductSchema,
  updateProductSchema
} = require('../controllers/productController');
const validate = require('../middleware/validate');

const router = express.Router();

router.post('/', validate(createProductSchema), createProduct);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.put('/:id', validate(updateProductSchema), updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
