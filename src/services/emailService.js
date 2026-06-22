const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

transporter.verify(function(error, success) {

    if (error) {

        console.error(
            '❌ SMTP ERROR:',
            error
        );

    } else {

        console.log(
            '✅ SMTP conectado correctamente'
        );

    }

});

async function sendRegistrationNotification(user, code) {

    await transporter.sendMail({

        from: process.env.SMTP_USER,

        to: process.env.ADMIN_EMAIL,

        subject: 'Nueva solicitud de residente - Avalon',

        html: `
            <h2>Nueva solicitud de registro</h2>

            <p><b>Nombre:</b> ${user.nombre} ${user.apellido}</p>

            <p><b>Usuario:</b> ${user.username}</p>

            <p><b>Email:</b> ${user.email}</p>

            <p><b>Bodega:</b> ${user.bodega}</p>

            <p><b>Teléfono:</b> ${user.telefono || 'No registrado'}</p>

            <hr>

            <h3>Código de activación</h3>

            <h1 style="color:#00594C;">
                ${code}
            </h1>
        `
    });

}

module.exports = {
    sendRegistrationNotification
};
