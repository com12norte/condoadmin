// api/send-email.js
// ---------------------------------------------------------------------------
// Este es el endpoint REAL de envío de correo (Nodemailer + Gmail).
// No existía — el archivo que estaba en esta ruta tenía por error el mismo
// código de cron-recordatorios.js, así que ningún correo se enviaba nunca.
//
// VARIABLES DE ENTORNO NECESARIAS (ya las tienes configuradas en Vercel):
//   GMAIL_USER      -> tu correo de Gmail remitente (ej: notificaciones@tudominio.com)
//   GMAIL_APP_PASS  -> una "Contraseña de aplicación" de Google (NO tu contraseña normal).
//                      Se genera en: Cuenta de Google > Seguridad > Verificación en 2 pasos
//                      > Contraseñas de aplicaciones. Requiere tener la verificación en
//                      2 pasos activada en esa cuenta de Gmail.
//
// IMPORTANTE: agrega "nodemailer" a las dependencias de tu package.json si no está:
//   npm install nodemailer
// ---------------------------------------------------------------------------

import nodemailer from "nodemailer";

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS,
      },
    });
  }
  return transporter;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, use POST" });
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
    return res.status(500).json({ error: "Faltan las variables de entorno GMAIL_USER / GMAIL_APP_PASS en Vercel" });
  }

  const { to, subject, body } = req.body || {};
  if (!to || !subject) {
    return res.status(400).json({ error: "Faltan campos requeridos: 'to' y 'subject'" });
  }

  try {
    const info = await getTransporter().sendMail({
      from: `"CondoAdmin" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text: body || "",
    });
    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error("Error enviando correo con Nodemailer:", err);
    return res.status(500).json({ error: String(err) });
  }
}
