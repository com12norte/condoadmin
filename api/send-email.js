import nodemailer from 'nodemailer'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if(req.method === 'OPTIONS') return res.status(200).end()
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'})
  const { to, subject, body } = req.body || {}
  if(!to || !subject || !body) return res.status(400).json({error:'Faltan datos'})
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS
    }
  })
  try {
    const info = await transporter.sendMail({
      from: `"CondoAdmin" <${process.env.GMAIL_USER}>`,
      to, subject,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><div style="background:#0f172a;padding:16px 20px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:16px">🏢 CondoAdmin</h2></div><div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px"><p style="color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-wrap">${body}</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/><p style="color:#94a3b8;font-size:11px;margin:0">Enviado desde CondoAdmin</p></div></div>`
    })
    return res.status(200).json({ ok: true, messageId: info.messageId })
  } catch(ex) {
    return res.status(500).json({ error:
