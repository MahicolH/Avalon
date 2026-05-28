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

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ──────────────────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────────────────

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-camera-key'
    ]
}));

// ──────────────────────────────────────────────────────────────
// MIDDLEWARES
// ──────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.text({ type: 'application/xml' }));
app.use(express.text({ type: 'text/xml' }));

app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────────────────────
// HEALTH CHECK
// ──────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.json({
        ok: true,
        app: 'Avalon Backend Online'
    });
});

app.get('/health', (req, res) => {
    res.json({
        ok: true
    });
});

// ──────────────────────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────────────────────

app.use('/api/access', accessRoutes);

app.use('/api/auth', authRoutes);

// ──────────────────────────────────────────────────────────────
// CANCELAR PASE
// ──────────────────────────────────────────────────────────────

app.post(
    '/api/access/cancelar/:token',
    authMiddleware,
    async (req, res) => {

        try {

            const success =
                await accessController.ejecutarBaja(
                    req.params.token,
                    'Cancelado por Residente'
                );

            res.json({
                success
            });

        } catch (e) {

            res.status(500).json({
                success: false
            });
        }
    }
);

// ──────────────────────────────────────────────────────────────
// EVENTO LPR
// ──────────────────────────────────────────────────────────────

app.post(
    '/event-lpr',
    cameraAuth,
    async (req, res) => {

        const { placas } = req.body || {};

        if (!placas) {

            return res.status(400).json({
                error: 'placas required'
            });
        }

        const r =
            await accessController.lprEvent(
                {
                    body: { placas }
                },
                res
            );

        return r;
    }
);

// ──────────────────────────────────────────────────────────────
// EVENTO QR HIKVISION
// ──────────────────────────────────────────────────────────────

app.post(
    '/event-qr',
    cameraAuth,
    async (req, res) => {

        const body = req.body || {};

        const token =
            body.authCardNo ||
            body.cardNo ||
            body.cardNoString ||
            body.qrCode ||
            body.qrCodeData ||
            body?.AccessEvent?.employeeNoString ||
            body?.AccessControllerEvent?.QRCode;

        if (!token) {

            console.log(
                '❌ [QR] Token no encontrado:',
                JSON.stringify(body)
            );

            return res.status(400).json({
                granted: false,
                reason: 'token required'
            });
        }

        console.log(`📥 [QR] Token recibido: ${token}`);

        try {

            const access =
                await AccessToken.findOne({
                    token,
                    status: 'approved'
                });

            if (!access) {

                console.log(
                    `❌ [QR] Token inválido: ${token}`
                );

                return res.json({
                    granted: false,
                    token,
                    reason: 'QR inválido o ya utilizado'
                });
            }

            console.log(
                `✅ [QR] Acceso concedido a: ${access.visitorName}`
            );

            await accessController.ejecutarBaja(
                token,
                'Acceso QR Confirmado'
            );

            return res.json({
                granted: true,
                token,
                visitorName: access.visitorName,
                destination: access.destination
            });

        } catch (e) {

            console.error(
                '❌ [QR] Error:',
                e.message
            );

            return res.status(500).json({
                granted: false,
                reason: 'error interno'
            });
        }
    }
);

// ──────────────────────────────────────────────────────────────
// EVENTO LEGACY
// ──────────────────────────────────────────────────────────────

app.post(
    '/event-receiver',
    async (req, res) => {

        const token =
            req.body?.authCardNo ||
            req.body?.AccessEvent?.employeeNoString;

        if (token) {

            await accessController.ejecutarBaja(
                token,
                'Acceso Confirmado'
            );
        }

        res.status(200).send();
    }
);

// ──────────────────────────────────────────────────────────────
// SOCKET.IO
// ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

    socket.on('join-request', (id) => {

        socket.join(id);
    });

    socket.on('approve-access', (data) => {

        io.to(data.requestId).emit(
            'access-response',
            {
                status: 'approved',
                token: data.token,
                qrCodeImage: data.qrCodeImage
            }
        );
    });

    socket.on('deny-access', (id) => {

        io.to(id).emit(
            'access-response',
            {
                status: 'denied'
            }
        );
    });
});

// ──────────────────────────────────────────────────────────────
// MONGODB
// ──────────────────────────────────────────────────────────────

const MONGO_URI =
    process.env.MONGO_URI ||
    'mongodb://localhost:27017/martel_db';

mongoose.connect(MONGO_URI)
.then(() => {

    console.log('✅ MongoDB Conectado');

    // Expirar pases cada 10 minutos

    setInterval(async () => {

        const limite =
            new Date(
                Date.now() - (8 * 60 * 60 * 1000)
            );

        const pases =
            await AccessToken.find({
                status: 'approved',
                accessType: 'single',
                createdAt: { $lt: limite }
            });

        for (const p of pases) {

            await accessController.ejecutarBaja(
                p.token,
                'Expirado (8h)'
            );
        }

    }, 600000);

})
.catch((e) => {

    console.error(
        '❌ Error MongoDB:',
        e.message
    );
});

// ──────────────────────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────────────────────

const PORT =
    process.env.PORT || 3000;

server.listen(PORT, () => {

    console.log(`🚀 Avalon Backend corriendo en puerto ${PORT}`);
});
