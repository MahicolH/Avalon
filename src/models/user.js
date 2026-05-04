// src/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // Campos nuevos para el registro
    username: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true 
    },
    nombre: { 
        type: String, 
        required: true 
    },
    apellido: { 
        type: String, 
        required: true 
    },
    bodega: { 
        type: String, 
        required: true 
    },
    telefono: { 
        type: String 
    },
    
    // Campos existentes (mantenidos para compatibilidad)
    fullName: { 
        type: String 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['RESIDENT', 'ADMIN', 'VISITOR', 'SECURITY'], 
        default: 'RESIDENT' 
    },
    userType: {
        type: String,
        enum: ['resident', 'admin', 'visitor', 'security'],
        default: 'resident'
    },
    carPlate: { 
        type: String, 
        unique: true, 
        sparse: true 
    }, 
    unitNumber: { 
        type: String 
    },
    isActive: {
        type: Boolean,
        default: true
    },
    accessHistory: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'AccessToken' 
    }],
}, { timestamps: true });

// Índices para mejorar búsquedas
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ bodega: 1 });

// Middleware pre-save para generar fullName automáticamente
UserSchema.pre('save', function(next) {
    if (this.nombre && this.apellido && !this.fullName) {
        this.fullName = `${this.nombre} ${this.apellido}`;
    }
    if (this.bodega && !this.unitNumber) {
        this.unitNumber = this.bodega;
    }
    next();
});

module.exports = mongoose.model('User', UserSchema);