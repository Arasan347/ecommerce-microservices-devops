const express = require('express');
const { getHealth, getHealthReady } = require('../controllers/healthController');

const router = express.Router();

router.get('/', getHealth);
router.get('/ready', getHealthReady);

module.exports = router;
