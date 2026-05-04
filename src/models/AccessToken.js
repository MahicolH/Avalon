const mongoose = require('mongoose');

const AccessTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    visitorName: { type: String, required: true },
    empresa: { type: String },
    hostName: { type: String },
    destination: { type: String },
    vehiculo: { type: String },
    placas: { type: String },
    normalizedPlacas: { type: String, index: true },
    accessType: { type: String, default: 'single' },
    visitType: { type: String, enum: ['cargo','visita'], default: 'cargo' },
    phone: { type: String },
    status: { type: String, default: 'approved' },
    usedAt: { type: Date },
    motivoCierre: { type: String },
    usageCount: { type: Number, default: 0 },
    frequentMaxUses: { type: Number, default: 10 }
}, { timestamps: true });

// Normalize placas before save
AccessTokenSchema.pre('save', function(next) {
    if (this.placas) this.normalizedPlacas = String(this.placas).toUpperCase().replace(/\s|-/g, '');
    next();
});

module.exports = mongoose.model('AccessToken', AccessTokenSchema);