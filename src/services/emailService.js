const { Resend } = require('resend');

const resend = new Resend(
    process.env.RESEND_API_KEY
);

async function sendRegistrationNotification(user, code) {

    await resend.emails.send({

        from: 'Avalon <onboarding@resend.dev>',

        to: process.env.ADMIN_EMAIL,

        subject: 'Nueva solicitud de residente',

        html: `
            <h2>Nueva solicitud de registro</h2>

            <p><b>Nombre:</b> ${user.nombre} ${user.apellido}</p>

            <p><b>Usuario:</b> ${user.username}</p>

            <p><b>Email:</b> ${user.email}</p>

            <p><b>Bodega:</b> ${user.bodega}</p>

            <h1>${code}</h1>
        `
    });

}

module.exports = {
    sendRegistrationNotification
};
