const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// LOGIN
router.post('/login', authController.login);

// REGISTRO
router.post('/register', authController.register);

// USUARIOS PENDIENTES
router.get('/pending-users', authController.pendingUsers);

// APROBAR USUARIO
router.put('/approve-user/:id', authController.approveUser);

// RECHAZAR USUARIO
router.delete('/reject-user/:id', authController.rejectUser);

module.exports = router;
