const express = require('express');
const { createUser, getUserById, registerSchema } = require('../controllers/userController');
const validate = require('../middleware/validate');
const authMiddleware = (req, res, next) => {
  // If x-internal-service header is set to order-service, bypass user JWT auth
  if (req.headers['x-internal-service'] === 'order-service') {
    return next();
  }
  return require('../middleware/authMiddleware')(req, res, next);
};

const router = express.Router();

router.post('/', validate(registerSchema), createUser);
router.get('/:id', authMiddleware, getUserById);

module.exports = router;
