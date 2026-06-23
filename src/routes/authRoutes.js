const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/activate', authController.activateAccount);

router.get('/pending-users', authController.getPendingUsers);
router.post('/approve-user', authController.approveUser);

module.exports = router;
