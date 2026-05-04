const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const accessController = require('../controllers/accessController');
const auth = require('../middleware/auth');
const cameraAuth = require('../middleware/cameraAuth');

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
// Nuevas rutas: aprobar / denegar / LPR
router.post('/approve/:id', auth, accessController.approveRequest);
router.post('/deny/:id', auth, accessController.denyRequest);
router.post('/provision/:token', auth, accessController.provisionToken);
router.post('/lpr', cameraAuth, [ body('placas').exists().withMessage('placas required') ], (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
}, accessController.lprEvent);

router.get('/active', auth, accessController.getActive);
router.get('/history', auth, accessController.getHistory);
router.get('/check/:token', accessController.checkStatus);
router.get('/request-status/:requestId', accessController.checkRequestStatus);
router.get('/token-info/:token', accessController.getTokenUsageInfo);

module.exports = router;