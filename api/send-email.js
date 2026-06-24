import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if(req.method !== "POST") return res.status(405).end();
  const { to, subject, body } = req.body;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS }
  });
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to, subject, text: body
  });
  res.status(200).json({ ok: true });
}
