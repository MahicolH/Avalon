const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

module.exports = function(req, res, next) {
    console.log('🔐 [Auth] Verificando token...');
    console.log('   Método:', req.method);
    console.log('   URL:', req.url);
    console.log('   Headers:', req.headers);
    
    const h = req.headers['authorization'];
    if (!h) {
        console.error('❌ [Auth] No token provided');
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const parts = h.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        console.error('❌ [Auth] Invalid auth format:', h);
        return res.status(401).json({ error: 'Invalid auth format' });
    }
    
    const token = parts[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('✅ [Auth] Token válido para usuario:', decoded.username);
        req.user = decoded;
        next();
    } catch (e) {
        console.error('❌ [Auth] Token inválido:', e.message);
        res.status(401).json({ error: 'Invalid token' });
    }
};