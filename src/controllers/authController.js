// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/user');

const USER = process.env.ADMIN_USER || 'admin';
const PASS = process.env.ADMIN_PASS || 'password';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_TTL = process.env.JWT_TTL || '8h';

exports.login = async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Missing credentials' });
        }

        // Primero intentar con el admin hardcoded (legacy)
        if (username === USER && password === PASS) {
            const token = jwt.sign({ username, role: 'ADMIN' }, JWT_SECRET, { expiresIn: JWT_TTL });
            return res.json({ 
                token,
                username,
                message: 'Login successful',
                user: {
                    username,
                    role: 'ADMIN'
                }
            });
        }

        // Si no es el admin hardcoded, buscar en la base de datos
        const user = await User.findOne({ username });

        if (!user) {
            console.log('❌ Usuario no encontrado:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verificar contraseña
        const passwordValido = await bcrypt.compare(password, user.password);

        if (!passwordValido) {
            console.log('❌ Contraseña incorrecta para:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verificar que el usuario esté activo
        if (!user.approved) {
            return res.status(403).json({
                error: 'Tu solicitud aún no ha sido aprobada por el administrador'
            });
        }

        // Verificar rol si se especifica
        if (role && user.role !== role) {
            console.log('❌ Rol no autorizado:', role, 'esperado:', user.role);
            return res.status(403).json({ 
                error: 'No tienes permisos para este tipo de acceso' 
            });
        }

        // Generar token JWT
        const token = jwt.sign(
            { 
                userId: user._id, 
                username: user.username, 
                role: user.role,
                bodega: user.bodega
            },
            JWT_SECRET,
            { expiresIn: JWT_TTL }
        );

        console.log('✅ Login exitoso:', username);

        res.json({ 
            success: true,
            token,
            username: user.username,
            message: 'Login successful',
            user: {
                username: user.username,
                nombre: user.nombre,
                apellido: user.apellido,
                role: user.role,
                bodega: user.bodega,
                email: user.email
            }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
};

exports.register = async (req, res) => {
    try {
        console.log('📝 Solicitud de registro recibida:', req.body);

        const { 
            userType, 
            nombre, 
            apellido, 
            bodega, 
            email, 
            telefono, 
            username, 
            password, 
            role 
        } = req.body;

        // Validaciones
        if (!username || !password || !nombre || !apellido || !bodega || !email) {
            console.log('❌ Faltan campos obligatorios');
            return res.status(400).json({ 
                error: 'Todos los campos son obligatorios' 
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ 
                error: 'La contraseña debe tener al menos 8 caracteres' 
            });
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                error: 'El formato del email no es válido' 
            });
        }

        // Verificar si el usuario ya existe
        const usuarioExistente = await User.findOne({ 
            $or: [{ username }, { email }] 
        });

        if (usuarioExistente) {
            if (usuarioExistente.username === username) {
                console.log('❌ Usuario ya existe:', username);
                return res.status(400).json({ 
                    error: 'El nombre de usuario ya está registrado' 
                });
            }
            if (usuarioExistente.email === email) {
                console.log('❌ Email ya existe:', email);
                return res.status(400).json({ 
                    error: 'El email ya está registrado' 
                });
            }
        }

        // Encriptar contraseña
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Crear nuevo usuario
        const nuevoUsuario = new User({
            username,
            password: hashedPassword,
            nombre,
            apellido,
            bodega,
            email,
            telefono,

            role: 'RESIDENT',
            userType: 'resident',

            createdAt: new Date(),

            isActive: false,
            approved: false
        });

        // Guardar en base de datos
        await nuevoUsuario.save();

        console.log('✅ Usuario creado exitosamente:', username);

        res.status(201).json({ 
            success: true,
            message: 'Solicitud enviada. Esperando aprobación del administrador.',
            user: {
                username,
                nombre,
                apellido,
                email,
                bodega
            }
        });

    } catch (error) {
        console.error('❌ Error en registro:', error);
        
        // Manejo de errores específicos de MongoDB
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                error: `El ${field} ya está registrado` 
            });
        }
        
        res.status(500).json({ 
            error: 'Error al crear la cuenta. Por favor intenta de nuevo.' 
        });
    }

    // =====================================
// OBTENER USUARIOS PENDIENTES
// =====================================
exports.pendingUsers = async (req, res) => {
    try {

        const users = await User.find({
            approved: false
        }).select('-password');

        res.json({
            success: true,
            users
        });

    } catch (error) {

        console.error('❌ Error obteniendo pendientes:', error);

        res.status(500).json({
            error: 'Error obteniendo solicitudes'
        });

    }
};

// =====================================
// APROBAR USUARIO
// =====================================
exports.approveUser = async (req, res) => {
    try {

        const { id } = req.params;

        const user = await User.findByIdAndUpdate(
            id,
            {
                approved: true,
                isActive: true
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                error: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Usuario aprobado correctamente',
            user
        });

    } catch (error) {

        console.error('❌ Error aprobando usuario:', error);

        res.status(500).json({
            error: 'Error aprobando usuario'
        });

    }
};

// =====================================
// RECHAZAR USUARIO
// =====================================
exports.rejectUser = async (req, res) => {
    try {

        const { id } = req.params;

        const user = await User.findByIdAndDelete(id);

        if (!user) {
            return res.status(404).json({
                error: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Solicitud rechazada'
        });

    } catch (error) {

        console.error('❌ Error rechazando usuario:', error);

        res.status(500).json({
            error: 'Error rechazando usuario'
        });

    }
};
};
