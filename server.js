const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

require('dotenv').config();
const accessRoutes = require('./src/routes/accessRoutes');
const authRoutes = require('./src/routes/authRoutes');
const accessController = require('./src/controllers/accessController');
const AccessToken = require('./src/models/AccessToken');
const authMiddleware = require('./src/middleware/auth');
const cameraAuth = require('./src/middleware/cameraAuth');

const app = express();
const corsOrigins = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const corsOrigin = corsOrigins.includes('*') ? true : corsOrigins;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST']
    }
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/access', accessRoutes);
app.use('/api/auth', authRoutes);

// PASO 4: Ruta integrada para cancelar pases activos (protegida por auth)
app.post('/api/access/cancelar/:token', authMiddleware, async (req, res) => {
    try {
        const success = await accessController.ejecutarBaja(req.params.token, 'Cancelado por Residente');
        res.json({ success });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// Endpoint de recepción LPR (protegido por clave de cámara)
app.post('/event-lpr', cameraAuth, async (req, res) => {
    const { placas } = req.body || {};
    if (!placas) return res.status(400).json({ error: 'placas required' });
    const r = await accessController.lprEvent({ body: { placas } }, res);
    return r;
});

// Endpoint para eventos QR enviados por terminales Hikvision
// El terminal debe enviar en el body alguno de estos campos: authCardNo, cardNo, AccessEvent.employeeNoString, qrCode o qrCodeData
app.post('/event-qr', cameraAuth, async (req, res) => {
    const body = req.body || {};
    const token = body.authCardNo || body.cardNo || (body.AccessEvent && body.AccessEvent.employeeNoString) || body.qrCode || body.qrCodeData || body.cardNoString;
    if (!token) {
        console.log('❌ [QR] Token no encontrado en body:', body);
        return res.status(400).json({ error: 'token required' });
    }
    console.log(`📥 [QR] Evento recibido desde cámara - token: ${token}`);
    console.log(`   Body completo:`, body);
    try {
        const AccessToken = require('./src/models/AccessToken');
        const access = await AccessToken.findOne({ token });
        if (!access) {
            console.log(`❌ [QR] Token ${token} NO existe en la BD`);
            return res.json({ granted: false, token, reason: 'Token not found' });
        }
        console.log(`✅ [QR] Token ${token} encontrado - Status: ${access.status}, Visitante: ${access.visitorName}`);
        
        const ok = await accessController.ejecutarBaja(token, 'Acceso QR Confirmado');
        console.log(`📊 [QR] Baja ejecutada para ${token}: ${ok ? 'TRUE' : 'FALSE'}`);
        return res.json({ granted: !!ok, token });
    } catch (e) {
        console.error(`❌ [QR] Error procesando evento QR para token ${token}:`, e.message);
        return res.status(500).json({ error: 'internal server error' });
    }
});

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

app.post('/event-receiver', async (req, res) => {
    const token = req.body?.authCardNo || req.body?.AccessEvent?.employeeNoString;
    if (token) await accessController.ejecutarBaja(token, 'Acceso Confirmado');
    res.status(200).send();
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/martel_db';

mongoose.connect(MONGO_URI).then(() => {
    console.log('✅ MongoDB Conectado', MONGO_URI);
    setInterval(async () => {
        const limite = new Date(Date.now() - (8 * 60 * 60 * 1000));
        const pases = await AccessToken.find({ status: 'approved', accessType: 'single', createdAt: { $lt: limite } });
        for (const p of pases) await accessController.ejecutarBaja(p.token, 'Expirado (8h)');
    }, 600000);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sistema Martel en puerto ${PORT}`));

module.exports = { app, server };