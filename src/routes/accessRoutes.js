const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const accessController = require('../controllers/accessController');
const auth = require('../middleware/auth');
const cameraAuth = require('../middleware/cameraAuth');

// ─── Rutas de autenticación de usuarios ──────────────────────────────────────
router.post('/generate-manual', auth, accessController.generateManual);

router.post('/request', [
    body('visitorName').exists().withMessage('visitorName required'),
    body('destination').exists().withMessage('destination required'),
    body('placas').optional().isString().trim()
], (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
}, accessController.createRequest);

router.get('/pending', auth, accessController.getPending);
router.delete('/request/:id', auth, accessController.deleteRequest);
router.post('/approve/:id', auth, accessController.approveRequest);
router.post('/deny/:id', auth, accessController.denyRequest);
router.post('/provision/:token', auth, accessController.provisionToken);

// ─── LPR (cámara de placas) ───────────────────────────────────────────────────
router.post('/lpr', cameraAuth, [
    body('placas').exists().withMessage('placas required')
], (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
}, accessController.lprEvent);

// ─── NUEVO: Evento QR directo desde Hikvision (SIN Gateway, SIN PC) ──────────
// Configurar en Hikvision: Red → HTTP Event → POST → esta URL
// Header requerido: x-camera-key: [valor de CAMERA_KEY en tu .env]
router.post('/qr-event', cameraAuth, accessController.qrEvent);

// ─── Consultas ────────────────────────────────────────────────────────────────
router.get('/active', auth, accessController.getActive);
router.get('/history', auth, accessController.getHistory);
router.get('/check/:token', accessController.checkStatus);
router.get('/request-status/:requestId', accessController.checkRequestStatus);
router.get('/token-info/:token', accessController.getTokenUsageInfo);

// ─── Gateway (se mantiene por compatibilidad con LPR) ────────────────────────
router.get('/gateway/commands', cameraAuth, accessController.getCommands);
router.post('/gateway/confirm', cameraAuth, accessController.confirmCommand);

module.exports = router;