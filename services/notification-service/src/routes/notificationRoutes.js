const express = require('express');
const {
  getNotificationById,
  getNotificationsByUserId
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/:id', getNotificationById);
router.get('/user/:userId', getNotificationsByUserId);

module.exports = router;
