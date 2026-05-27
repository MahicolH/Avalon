// accessController.js — VERSION SIN GATEWAY (Hikvision → Backend directo)
// El Hikvision llama directamente al endpoint /qr-event via HTTP Event
// Ya NO se necesita la PC Gateway encendida para validar QR

const AccessToken = require('../models/AccessToken');
const PendingRequest = require('../models/PendingRequest');
const GatewayCommand = require('../models/GatewayCommand');
const User = require('../models/User');
const qrcode = require('qrcode');

// ─── Función interna: encolar comando para el Gateway (se mantiene para LPR) ──
async function enqueueGateway(type, payload) {
    await GatewayCommand.create({ type, payload, status: 'pending' });
}

// ─── Baja de token ────────────────────────────────────────────────────────────
exports.ejecutarBaja = async (token, motivo) => {
    try {
        const pase = await AccessToken.findOne({ token, status: 'approved' });
        if (!pase) return false;

        if (pase.accessType === 'frequent') {
            pase.usageCount += 1;
            if (pase.usageCount >= pase.frequentMaxUses) {
                pase.status = 'used';
                pase.usedAt = new Date();
                pase.motivoCierre = 'Máximo de usos alcanzado';
                await enqueueGateway('DELETE_USER', { employeeNo: token });
            }
        } else {
            pase.status = 'used';
            pase.usedAt = new Date();
            pase.motivoCierre = motivo;
            await enqueueGateway('DELETE_USER', { employeeNo: token });
        }

        await pase.save();
        return true;
    } catch (e) {
        console.error('❌ ejecutarBaja error:', e.message);
        return false;
    }
};

// ─── NUEVO: Evento QR directo desde Hikvision (SIN Gateway, SIN PC) ──────────
// El Hikvision llama a este endpoint cuando escanea un QR
// Configurar en Hikvision: Red → HTTP Event → URL = /api/access/qr-event
exports.qrEvent = async (req, res) => {
    try {
        console.log('📷 [QR-Event] Body recibido:', JSON.stringify(req.body));

        // Hikvision puede enviar el QR en distintos campos según el modelo/firmware
        const qrData =
            req.body?.AccessControllerEvent?.QRCode ||
            req.body?.QRCodeInfo?.strQRCode ||
            req.body?.qrCode ||
            req.body?.token ||
            req.body?.cardNo ||
            req.body?.employeeNoString;

        if (!qrData) {
            console.log('❌ [QR-Event] No se recibió QR en el body');
            return res.status(400).json({
                ResultCode: 1,
                Msg: 'QR no recibido'
            });
        }

        const token = String(qrData).trim();
        console.log('🔍 [QR-Event] Validando token:', token);

        // Buscar en MongoDB
        const pase = await AccessToken.findOne({
            token,
            status: 'approved'
        });

        if (!pase) {
            console.log('❌ [QR-Event] Token inválido o ya usado:', token);
            // Hikvision: ResultCode 1 = acceso denegado
            return res.json({
                ResultCode: 1,
                Msg: 'Acceso denegado - QR inválido o expirado'
            });
        }

        // QR válido → marcar como usado si es de un solo uso
        await exports.ejecutarBaja(token, 'Acceso QR confirmado');

        console.log('✅ [QR-Event] Acceso concedido a:', pase.visitorName, '→', pase.destination);

        // Hikvision: ResultCode 0 = acceso permitido → abre la puerta
        return res.json({
            ResultCode: 0,
            Msg: 'Acceso concedido',
            visitorName: pase.visitorName,
            destination: pase.destination
        });

    } catch (e) {
        console.error('❌ [QR-Event] Error:', e.message);
        res.status(500).json({
            ResultCode: 1,
            Msg: 'Error interno del servidor'
        });
    }
};

// ─── Generar pase manual ──────────────────────────────────────────────────────
exports.generateManual = async (req, res) => {
    try {
        const { visitorName, destination, hostName, accessType, visitType, phone } = req.body;
        const token = Math.floor(10000000 + Math.random() * 89999999).toString();

        await AccessToken.create({
            token, visitorName, destination, hostName,
            accessType: accessType || 'single',
            visitType: visitType || 'cargo',
            phone
        });

        await enqueueGateway('CREATE_USER', {
            employeeNo: token,
            name: visitorName.substring(0, 31)
        });

        const qr = await qrcode.toDataURL(token);
        res.json({
            success: true, token, qrCodeImage: qr,
            visitorName, destination: destination || 'Manual',
            accessType: accessType || 'single'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Crear solicitud de visita ────────────────────────────────────────────────
exports.createRequest = async (req, res) => {
    const nuevo = await PendingRequest.create(req.body);
    res.json(nuevo);
};

// ─── Obtener solicitudes pendientes ──────────────────────────────────────────
exports.getPending = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        let query = {};

        if (userRole === 'RESIDENT' && userId) {
            const user = await User.findById(userId);
            if (user) {
                query.$or = [
                    { residentId: user._id },
                    { hostName: new RegExp(user.fullName, 'i') },
                    { hostName: new RegExp(user.nombre, 'i') },
                    { hostName: new RegExp(user.username, 'i') }
                ];
            }
        }

        const solicitudes = await PendingRequest.find(query).sort({ createdAt: 1 });
        res.json(solicitudes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Eliminar solicitud ───────────────────────────────────────────────────────
exports.deleteRequest = async (req, res) => {
    await PendingRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true });
};

// ─── Tokens activos ───────────────────────────────────────────────────────────
exports.getActive = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        let query = { status: 'approved' };

        if (userRole === 'RESIDENT' && userId) {
            const user = await User.findById(userId);
            if (user) {
                query.$or = [
                    { hostName: new RegExp(user.fullName, 'i') },
                    { hostName: new RegExp(user.nombre, 'i') },
                    { hostName: new RegExp(user.username, 'i') }
                ];
            }
        }

        const tokens = await AccessToken.find(query).sort({ createdAt: -1 });
        res.json(tokens);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Historial ────────────────────────────────────────────────────────────────
exports.getHistory = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        let query = { status: 'used' };

        if (userRole === 'RESIDENT' && userId) {
            const user = await User.findById(userId);
            if (user) {
                query.$or = [
                    { hostName: new RegExp(user.fullName, 'i') },
                    { hostName: new RegExp(user.nombre, 'i') },
                    { hostName: new RegExp(user.username, 'i') }
                ];
            }
        }

        const historial = await AccessToken.find(query).sort({ usedAt: -1 });
        res.json(historial);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Check status (para app visitante) ───────────────────────────────────────
exports.checkStatus = async (req, res) => {
    const access = await AccessToken.findOne({ token: req.params.token });
    if (!access) return res.status(404).send();
    const qr = await qrcode.toDataURL(access.token);
    res.json({ qrCodeImage: qr, visitorName: access.visitorName, token: access.token });
};

// ─── Aprobar solicitud ────────────────────────────────────────────────────────
exports.approveRequest = async (req, res) => {
    try {
        const pending = await PendingRequest.findById(req.params.id);
        if (!pending) return res.status(404).json({ error: 'Solicitud no encontrada' });

        const token = Math.floor(10000000 + Math.random() * 89999999).toString();

        await AccessToken.create({
            token,
            visitorName: pending.visitorName,
            destination: pending.destination,
            hostName: pending.hostName,
            placas: pending.placas,
            accessType: pending.accessType || 'single',
            visitType: pending.visitType || 'cargo',
            phone: pending.phone,
            status: 'approved'
        });

        await enqueueGateway('CREATE_USER', {
            employeeNo: token,
            name: pending.visitorName.substring(0, 31)
        });

        const qr = await qrcode.toDataURL(token);
        const requestId = pending.requestId;
        await PendingRequest.findByIdAndDelete(req.params.id);

        res.json({
            token, qrCodeImage: qr, requestId,
            visitorName: pending.visitorName,
            empresa: pending.empresa,
            destination: pending.destination,
            accessType: pending.accessType || 'single'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Denegar solicitud ────────────────────────────────────────────────────────
exports.denyRequest = async (req, res) => {
    try {
        const pending = await PendingRequest.findByIdAndDelete(req.params.id);
        if (!pending) return res.status(404).json({ error: 'Solicitud no encontrada' });
        res.json({ requestId: pending.requestId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Evento LPR ───────────────────────────────────────────────────────────────
exports.lprEvent = async (req, res) => {
    try {
        let plate = req.body.placas || req.body.plate;
        if (!plate) return res.status(400).json({ error: 'Placa requerida' });

        const normalize = s => String(s).toUpperCase().replace(/\s|-/g, '');
        plate = normalize(plate);

        const pase = await AccessToken.findOne({ status: 'approved', normalizedPlacas: plate });
        if (pase) {
            if (pase.accessType === 'frequent') {
                pase.usageCount += 1;
                if (pase.usageCount >= pase.frequentMaxUses) {
                    pase.status = 'used';
                    pase.usedAt = new Date();
                    pase.motivoCierre = 'Máximo de usos alcanzado por LPR';
                    await enqueueGateway('DELETE_USER', { employeeNo: pase.token });
                }
                await pase.save();
                return res.json({ granted: true, token: pase.token, accessType: 'frequent', usageCount: pase.usageCount });
            } else {
                await exports.ejecutarBaja(pase.token, 'Acceso LPR Confirmado');
                return res.json({ granted: true, token: pase.token, accessType: 'single' });
            }
        }
        res.json({ granted: false });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Check estado solicitud ───────────────────────────────────────────────────
exports.checkRequestStatus = async (req, res) => {
    try {
        const pending = await PendingRequest.findOne({ requestId: req.params.requestId });
        if (!pending) return res.json({ found: false });
        res.json({
            found: true, status: 'pending',
            visitorName: pending.visitorName,
            destination: pending.destination,
            hostName: pending.hostName,
            accessType: pending.accessType,
            createdAt: pending.createdAt
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Info de token ────────────────────────────────────────────────────────────
exports.getTokenUsageInfo = async (req, res) => {
    try {
        const access = await AccessToken.findOne({ token: req.params.token });
        if (!access) return res.status(404).json({ error: 'Token no encontrado' });

        const info = {
            visitorName: access.visitorName,
            destination: access.destination,
            accessType: access.accessType,
            status: access.status,
            createdAt: access.createdAt,
            usedAt: access.usedAt
        };

        if (access.accessType === 'frequent') {
            info.usageCount = access.usageCount;
            info.maxUses = access.frequentMaxUses;
            info.remainingUses = Math.max(0, access.frequentMaxUses - access.usageCount);
        }

        res.json(info);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── Re-provisionar token ─────────────────────────────────────────────────────
exports.provisionToken = async (req, res) => {
    try {
        const access = await AccessToken.findOne({ token: req.params.token });
        if (!access) return res.status(404).json({ error: 'Token no encontrado' });

        await enqueueGateway('CREATE_USER', {
            employeeNo: access.token,
            name: (access.visitorName || 'Visitante').substring(0, 31)
        });

        return res.json({ success: true, token: access.token });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

// ─── El Gateway consulta comandos pendientes ──────────────────────────────────
exports.getCommands = async (req, res) => {
    try {
        const commands = await GatewayCommand.find({ status: 'pending' })
            .sort({ createdAt: 1 })
            .limit(10);
        res.json(commands);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ─── El Gateway confirma que ejecutó un comando ───────────────────────────────
exports.confirmCommand = async (req, res) => {
    try {
        const { id, success, error } = req.body;
        await GatewayCommand.findByIdAndUpdate(id, {
            status: success ? 'done' : 'failed',
            executedAt: new Date(),
            errorMsg: error || null
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};