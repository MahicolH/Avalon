const AccessToken = require('../models/AccessToken');
const PendingRequest = require('../models/PendingRequest');
const User = require('../models/User'); // AGREGAR esta línea
const urllib = require('urllib');
const qrcode = require('qrcode');

const DEVICE = { ip: "192.168.1.68", user: "admin", pass: "1Q2w3e4r5t." };

async function sendToHikvision(endpoint, data) {
    const url = `http://${DEVICE.ip}/ISAPI/AccessControl/${endpoint}?format=json`;
    try {
        const response = await urllib.request(url, {
            method: 'POST', digestAuth: `${DEVICE.user}:${DEVICE.pass}`,
            content: JSON.stringify(data), headers: { 'Content-Type': 'application/json' },
            dataType: 'json', timeout: 5000
        });
        return response.data;
    } catch (e) { return null; }
}

exports.ejecutarBaja = async (token, motivo) => {
    try {
        const pase = await AccessToken.findOne({ token, status: 'approved' });
        if (!pase) return false;
        
        // Para acceso 'frequent', solo incrementar contador
        if (pase.accessType === 'frequent') {
            pase.usageCount += 1;
            // Si alcanzó el máximo de usos, marcar como usado
            if (pase.usageCount >= pase.frequentMaxUses) {
                pase.status = 'used';
                pase.usedAt = new Date();
                pase.motivoCierre = 'Máximo de usos alcanzado';
                await sendToHikvision('UserInfo/Delete', { "UserInfoDetail": { "mode": "byEmployeeNo", "employeeNoList": [{ "employeeNo": token }] } });
            }
        } else {
            // Para acceso 'single', marcar como usado inmediatamente
            pase.status = 'used';
            pase.usedAt = new Date();
            pase.motivoCierre = motivo;
            await sendToHikvision('UserInfo/Delete', { "UserInfoDetail": { "mode": "byEmployeeNo", "employeeNoList": [{ "employeeNo": token }] } });
        }
        
        await pase.save();
        return true;
    } catch (e) { return false; }
};

exports.generateManual = async (req, res) => {
    try {
        const { visitorName, destination, hostName, accessType, visitType, phone } = req.body;
        const token = Math.floor(10000000 + Math.random() * 89999999).toString();
        await AccessToken.create({ 
            token, 
            visitorName, 
            destination, 
            hostName, 
            accessType: accessType || 'single',
            visitType: visitType || 'cargo',
            phone: phone
        });
        await sendToHikvision('UserInfo/Record', { "UserInfo": { "employeeNo": token, "name": visitorName.substring(0, 31), "userType": "normal", "Valid": { "enable": true, "beginTime": "2024-01-01T00:00:00", "endTime": "2030-01-01T00:00:00", "timeType": "local" }, "doorRight": "1", "RightPlan": [{ "doorNo": 1, "planTemplateNo": "1" }] } });
        await sendToHikvision('CardInfo/Record', { "CardInfo": { "employeeNo": token, "cardNo": token, "cardType": "normalCard" } });
        // Generar imagen QR y devolverla al cliente
        const qr = await qrcode.toDataURL(token);
        res.json({ 
            success: true, 
            token, 
            qrCodeImage: qr,
            visitorName,
            destination: destination || 'Manual',
            empresa: 'Manual',
            accessType: accessType || 'single'
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createRequest = async (req, res) => {
    const nuevo = await PendingRequest.create(req.body);
    res.json(nuevo);
};

// MODIFICADO: Filtrar solicitudes pendientes según el usuario
exports.getPending = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;

        console.log('📋 Obteniendo solicitudes pendientes para usuario:', userId, 'Role:', userRole);

        let query = {};

        // Si es residente, filtrar solo sus solicitudes
        if (userRole === 'RESIDENT' && userId) {
            const user = await User.findById(userId);
            
            if (user) {
                // Buscar solicitudes donde hostName coincida con el nombre del residente
                query.$or = [
                    { hostName: new RegExp(user.fullName, 'i') },
                    { hostName: new RegExp(user.nombre, 'i') },
                    { hostName: new RegExp(user.username, 'i') },
                    { hostName: new RegExp(`${user.nombre}.*${user.apellido}`, 'i') }
                ];
                
                console.log('🔍 Filtrando solicitudes para residente:', user.fullName);
            }
        }
        // Si es ADMIN o SECURITY, query queda vacío = ver todas

        const solicitudes = await PendingRequest.find(query).sort({ createdAt: 1 });
        
        console.log(`✅ Se encontraron ${solicitudes.length} solicitudes pendientes`);
        
        res.json(solicitudes);
    } catch (e) {
        console.error('❌ Error al obtener solicitudes pendientes:', e);
        res.status(500).json({ error: e.message });
    }
};

exports.deleteRequest = async (req, res) => {
    await PendingRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true });
};

// MODIFICADO: Filtrar tokens activos según el usuario
exports.getActive = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;

        console.log('🎫 Obteniendo tokens activos para usuario:', userId, 'Role:', userRole);

        let query = { status: 'approved' };

        // Si es residente, filtrar solo sus tokens
        if (userRole === 'RESIDENT' && userId) {
            const user = await User.findById(userId);
            
            if (user) {
                // Buscar tokens donde hostName coincida con el nombre del residente
                query.$or = [
                    { hostName: new RegExp(user.fullName, 'i') },
                    { hostName: new RegExp(user.nombre, 'i') },
                    { hostName: new RegExp(user.username, 'i') },
                    { hostName: new RegExp(`${user.nombre}.*${user.apellido}`, 'i') }
                ];
                
                console.log('🔍 Filtrando tokens activos para residente:', user.fullName);
            }
        }
        // Si es ADMIN o SECURITY, solo filtra por status = ver todos los aprobados

        const tokens = await AccessToken.find(query).sort({ createdAt: -1 });
        
        console.log(`✅ Se encontraron ${tokens.length} tokens activos`);
        
        res.json(tokens);
    } catch (e) {
        console.error('❌ Error al obtener tokens activos:', e);
        res.status(500).json({ error: e.message });
    }
};

// MODIFICADO: Filtrar historial según el usuario
exports.getHistory = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;

        console.log('📜 Obteniendo historial para usuario:', userId, 'Role:', userRole);

        let query = { status: 'used' };

        // Si es residente, filtrar solo su historial
        if (userRole === 'RESIDENT' && userId) {
            const user = await User.findById(userId);
            
            if (user) {
                query.$or = [
                    { hostName: new RegExp(user.fullName, 'i') },
                    { hostName: new RegExp(user.nombre, 'i') },
                    { hostName: new RegExp(user.username, 'i') },
                    { hostName: new RegExp(`${user.nombre}.*${user.apellido}`, 'i') }
                ];
                
                console.log('🔍 Filtrando historial para residente:', user.fullName);
            }
        }

        const historial = await AccessToken.find(query).sort({ usedAt: -1 });
        
        console.log(`✅ Se encontraron ${historial.length} registros en historial`);
        
        res.json(historial);
    } catch (e) {
        console.error('❌ Error al obtener historial:', e);
        res.status(500).json({ error: e.message });
    }
};

exports.checkStatus = async (req, res) => {
    const access = await AccessToken.findOne({ token: req.params.token });
    if (!access) return res.status(404).send();
    const qr = await qrcode.toDataURL(access.token);
    res.json({ qrCodeImage: qr, visitorName: access.visitorName, token: access.token });
};

// Aprobar una solicitud pendiente: crea pase, registra en dispositivo y devuelve token/qr/requestId
exports.approveRequest = async (req, res) => {
    try {
        const pending = await PendingRequest.findById(req.params.id);
        if (!pending) return res.status(404).json({ error: 'Solicitud no encontrada' });
        const token = Math.floor(10000000 + Math.random() * 89999999).toString();
        const access = await AccessToken.create({
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

        await sendToHikvision('UserInfo/Record', { "UserInfo": { "employeeNo": token, "name": pending.visitorName.substring(0, 31), "userType": "normal", "Valid": { "enable": true, "beginTime": "2024-01-01T00:00:00", "endTime": "2030-01-01T00:00:00", "timeType": "local" }, "doorRight": "1", "RightPlan": [{ "doorNo": 1, "planTemplateNo": "1" }] } });
        await sendToHikvision('CardInfo/Record', { "CardInfo": { "employeeNo": token, "cardNo": token, "cardType": "normalCard" } });

        const qr = await qrcode.toDataURL(token);
        const requestId = pending.requestId;
        await PendingRequest.findByIdAndDelete(req.params.id);
        res.json({ 
            token, 
            qrCodeImage: qr, 
            requestId,
            visitorName: pending.visitorName,
            empresa: pending.empresa,
            destination: pending.destination,
            accessType: pending.accessType || 'single'
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// Denegar una solicitud pendiente: eliminar y devolver requestId para emitir socket
exports.denyRequest = async (req, res) => {
    try {
        const pending = await PendingRequest.findByIdAndDelete(req.params.id);
        if (!pending) return res.status(404).json({ error: 'Solicitud no encontrada' });
        res.json({ requestId: pending.requestId });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// Evento LPR: recibe placas, busca pase aprobado (normalizado) y cierra/ejecuta baja
exports.lprEvent = async (req, res) => {
    try {
        let plate = req.body.placas || req.body.plate;
        if (!plate) return res.status(400).json({ error: 'Placa requerida' });
        const normalize = s => String(s).toUpperCase().replace(/\s|-/g, '');
        plate = normalize(plate);
        const pase = await AccessToken.findOne({ status: 'approved', normalizedPlacas: plate });
        if (pase) {
            // Para acceso frecuente, permitir múltiples usos
            if (pase.accessType === 'frequent') {
                pase.usageCount += 1;
                // Marcar como usado cuando alcanza el límite
                if (pase.usageCount >= pase.frequentMaxUses) {
                    pase.status = 'used';
                    pase.usedAt = new Date();
                    pase.motivoCierre = 'Máximo de usos alcanzado por LPR';
                    await sendToHikvision('UserInfo/Delete', { "UserInfoDetail": { "mode": "byEmployeeNo", "employeeNoList": [{ "employeeNo": pase.token }] } });
                }
                await pase.save();
                return res.json({ granted: true, token: pase.token, accessType: 'frequent', usageCount: pase.usageCount, maxUses: pase.frequentMaxUses });
            } else {
                // Para acceso simple, cerrar después de usar
                await exports.ejecutarBaja(pase.token, 'Acceso LPR Confirmado');
                return res.json({ granted: true, token: pase.token, accessType: 'single' });
            }
        }
        res.json({ granted: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// Consultar estado de solicitud por visitante
exports.checkRequestStatus = async (req, res) => {
    try {
        const { requestId } = req.params;
        const pending = await PendingRequest.findOne({ requestId });
        
        if (!pending) {
            // Solicitud no existe o ya fue procesada
            return res.json({ found: false, message: 'Solicitud no encontrada o ya fue procesada' });
        }
        
        res.json({ 
            found: true, 
            status: 'pending', 
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

// Obtener historial de usos de un pase (para visitantes que conocen su token)
exports.getTokenUsageInfo = async (req, res) => {
    try {
        const { token } = req.params;
        const access = await AccessToken.findOne({ token });
        
        if (!access) {
            return res.status(404).json({ error: 'Token no encontrado' });
        }
        
        const info = {
            visitorName: access.visitorName,
            destination: access.destination,
            accessType: access.accessType,
            status: access.status,
            createdAt: access.createdAt,
            usedAt: access.usedAt
        };
        
        // Información adicional para acceso frecuente
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

// Re-provisionar un token en el dispositivo Hikvision (UserInfo + CardInfo)
exports.provisionToken = async (req, res) => {
    try {
        const token = req.params.token;
        const access = await AccessToken.findOne({ token });
        if (!access) return res.status(404).json({ error: 'Token no encontrado' });

        // Registrar usuario en el dispositivo
        await sendToHikvision('UserInfo/Record', {
            "UserInfo": {
                "employeeNo": token,
                "name": (access.visitorName || 'Visitante').substring(0, 31),
                "userType": "normal",
                "Valid": { "enable": true, "beginTime": "2024-01-01T00:00:00", "endTime": "2030-01-01T00:00:00", "timeType": "local" },
                "doorRight": "1",
                "RightPlan": [{ "doorNo": 1, "planTemplateNo": "1" }]
            }
        });

        // Registrar tarjeta/credencial en el dispositivo
        await sendToHikvision('CardInfo/Record', {
            "CardInfo": { "employeeNo": token, "cardNo": token, "cardType": "normalCard" }
        });

        return res.json({ success: true, token });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};