const mongoose = require('mongoose');

const PendingRequestSchema = new mongoose.Schema({
    requestId: { type: String, required: true },
    visitorName: { type: String, required: true },
    empresa: { type: String },
    destination: { type: String },
    hostName: { type: String },
    vehiculo: { type: String },
    placas: { type: String },
    accessType: { type: String, enum: ['single','frequent'], default: 'single' },
    visitType: { type: String, enum: ['cargo','visita'], default: 'cargo' },
    phone: { type: String },

    residentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }

}, { timestamps: true });

module.exports = mongoose.model('PendingRequest', PendingRequestSchema);