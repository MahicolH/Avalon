const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config();
const accessRoutes = require('./src/routes/accessRoutes');
const authRoutes = require('./src/routes/authRoutes');
const accessController = require('./src/controllers/accessController');
const AccessToken = require('./src/models/AccessToken');
const authMiddleware = require('./src/middleware/auth');
const cameraAuth = require('./src/middleware/cameraAuth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/access', accessRoutes);
app.use('/api/auth', authRoutes);

// ─── Cancelar pase activo (protegido por auth) ────────────────────────────────
app.post('/api/access/cancelar/:token', authMiddleware, async (req, res) => {
    try {
        const success = await accessController.ejecutarBaja(req.params.token, 'Cancelado por Residente');
        res.json({ success });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// ─── Evento LPR (cámara de placas) ───────────────────────────────────────────
app.post('/event-lpr', cameraAuth, async (req, res) => {
    const { placas } = req.body || {};
    if (!placas) return res.status(400).json({ error: 'placas required' });
    const r = await accessController.lprEvent({ body: { placas } }, res);
    return r;
});

// ─── Evento QR desde Hikvision (SIN Gateway, SIN PC) ─────────────────────────
// Configurar en Hikvision:
//   URL:    https://avalon-ju7h.onrender.com/event-qr
//   Método: POST
//   Header: x-camera-key = avalon_camera_key
app.post('/event-qr', cameraAuth, async (req, res) => {
    const body = req.body || {};

    // Hikvision puede enviar el QR en distintos campos según firmware
    const token =
        body.authCardNo ||
        body.cardNo ||
        body.cardNoString ||
        body.qrCode ||
        body.qrCodeData ||
        body?.AccessEvent?.employeeNoString ||
        body?.AccessControllerEvent?.QRCode;

    if (!token) {
        console.log('❌ [QR] Token no encontrado en body:', JSON.stringify(body));
        return res.status(400).json({ granted: false, reason: 'token required' });
    }

    console.log(`📥 [QR] Token recibido: ${token}`);

    try {
        // ✅ CORREGIDO: verificar que el pase exista Y esté aprobado
        const access = await AccessToken.findOne({ token, status: 'approved' });

        if (!access) {
            console.log(`❌ [QR] Token inválido o ya usado: ${token}`);
            return res.json({ granted: false, token, reason: 'QR inválido o ya utilizado' });
        }

        console.log(`✅ [QR] Acceso concedido a: ${access.visitorName} → ${access.destination}`);

        // Marcar como usado
        await accessController.ejecutarBaja(token, 'Acceso QR Confirmado');

        return res.json({
            granted: true,
            token,
            visitorName: access.visitorName,
            destination: access.destination
        });

    } catch (e) {
        console.error(`❌ [QR] Error:`, e.message);
        return res.status(500).json({ granted: false, reason: 'error interno' });
    }
});

// ─── Evento genérico (legacy) ─────────────────────────────────────────────────
app.post('/event-receiver', async (req, res) => {
    const token = req.body?.authCardNo || req.body?.AccessEvent?.employeeNoString;
    if (token) await accessController.ejecutarBaja(token, 'Acceso Confirmado');
    res.status(200).send();
});

// ─── Socket.io (notificaciones en tiempo real) ────────────────────────────────
io.on('connection', (socket) => {
    socket.on('join-request', (id) => socket.join(id));
    socket.on('approve-access', (data) => {
        io.to(data.requestId).emit('access-response', {
            status: 'approved',
            token: data.token,
            qrCodeImage: data.qrCodeImage
        });
    });
    socket.on('deny-access', (id) => {
        io.to(id).emit('access-response', { status: 'denied' });
    });
});

// ─── MongoDB + expiración automática de pases ─────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/martel_db';

mongoose.connect(MONGO_URI).then(() => {
    console.log('✅ MongoDB Conectado');

    // Expirar pases de un solo uso después de 8 horas
    setInterval(async () => {
        const limite = new Date(Date.now() - (8 * 60 * 60 * 1000));
        const pases = await AccessToken.find({
            status: 'approved',
            accessType: 'single',
            createdAt: { $lt: limite }
        });
        for (const p of pases) {
            await accessController.ejecutarBaja(p.token, 'Expirado (8h)');
        }
    }, 600000); // cada 10 minutos
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Avalon corriendo en puerto ${PORT}`));

module.exports = { app, server };