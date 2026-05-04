const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
    visitorName: { type: String, required: true },
    destino: { type: String },
    referencia: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AccessLog', accessLogSchema);