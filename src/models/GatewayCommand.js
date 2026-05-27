// models/GatewayCommand.js
// Cola de comandos que el backend encola y el Gateway (PC México) consume.

const mongoose = require('mongoose');

const GatewayCommandSchema = new mongoose.Schema({
    // Tipo de acción a ejecutar en Hikvision
    type: {
        type: String,
        enum: ['CREATE_USER', 'DELETE_USER', 'OPEN_DOOR'],
        required: true
    },
    // Datos que necesita el Gateway para ejecutar el comando
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    // Estado del comando
    status: {
        type: String,
        enum: ['pending', 'done', 'failed'],
        default: 'pending',
        index: true
    },
    // Cuándo lo ejecutó el Gateway
    executedAt: {
        type: Date
    },
    // Mensaje de error si falló
    errorMsg: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('GatewayCommand', GatewayCommandSchema);
