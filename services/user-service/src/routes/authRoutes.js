const express = require('express');
const { login, loginSchema } = require('../controllers/authController');
const validate = require('../middleware/validate');

const router = express.Router();

router.post('/login', validate(loginSchema), login);

module.exports = router;
