// Simple API key auth for cameras
module.exports = function(req, res, next) {
    const key = req.headers['x-camera-key'] || req.query.cameraKey;
    const expected = process.env.CAMERA_KEY || 'dev_camera_key';
    if (!key || key !== expected) return res.status(401).json({ error: 'Invalid camera key' });
    next();
};