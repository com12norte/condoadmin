import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPA_URL,
  process.env.SUPA_SERVICE_KEY
)

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS
  }
})

const sendMail = async (to, subject, body) => {
  if (!to || !to.includes('@')) return
  try {
    await transporter.sendMail({
      from: `"CondoAdmin" <${process.env.GMAIL_USER}>`,
      to, subject,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#0f172a;padding:16px 20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0;font-size:16px">🏢 CondoAdmin</h2>
          </div>
          <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
            <p style="color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-wrap">${body}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
            <p style="color:#94a3b8;font-size:11px;margin:0">Enviado desde CondoAdmin · ${process.env.GMAIL_USER}</p>
          </div>
        </div>
      `
    })
    console.log('✓ Mail enviado a', to)
  } catch (ex) {
    console.error('✗ Mail error', to, ex.message)
  }
}

export default async function handler(req, res) {
  // Seguridad: solo Vercel Cron o llamada con secret
  const auth = req.headers.authorization || ''
  const secret = process.env.CRON_SECRET || ''
  if (secret && auth !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    // Cargar tareas y usuarios desde Supabase
    const [{ data: tareasRaw, error: e1 }, { data: usuariosRaw, error: e2 }] = await Promise.all([
      supabase.from('tareas').select('*'),
      supabase.from('usuarios').select('*').eq('active', true)
    ])

    if (e1) throw new Error('Error tareas: ' + e1.message)
    if (e2) throw new Error('Error usuarios: ' + e2.message)

    const tareas = (tareasRaw || []).map(r => r.data).filter(Boolean)
    const usuarios = usuariosRaw || []

    const getUserEmail = (nombre) => {
      const u = usuarios.find(x => x.nombre === nombre || x.email === nombre)
      return u?.email || null
    }

    // Agrupar tareas pendientes por responsable y ejecutor
    const porResponsable = {}
    const porEjecutor = {}

    for (const t of tareas) {
      if (!t.dueDate || t.informe?.trim() || t.status === 'Completada' || t.status === 'Cancelada') continue

      const due = new Date(t.dueDate)
      due.setHours(0, 0, 0, 0)
      const diff = Math.ceil((due - hoy) / 86400000)

      // Solo vencidas o que vencen en 3 días o menos
      if (diff > 3) continue

      const esVencida = diff < 0
      const diasTxt = esVencida
        ? `⚠️ VENCIDA hace ${Math.abs(diff)} día(s)`
        : diff === 0 ? '🔴 Vence HOY'
        : `🟡 Vence en ${diff} día(s)`

      const linea = `• ${t.title} — ${diasTxt} (${new Date(t.dueDate).toLocaleDateString('es-CL')})`

      if (t.responsible) {
        if (!porResponsable[t.responsible]) porResponsable[t.responsible] = []
        porResponsable[t.responsible].push(linea)
      }

      if (t.ejecutor && t.ejecutor !== t.responsible) {
        if (!porEjecutor[t.ejecutor]) porEjecutor[t.ejecutor] = []
        porEjecutor[t.ejecutor].push(linea)
      }
    }

    let enviados = 0

    // Enviar resumen a responsables
    for (const [nombre, lineas] of Object.entries(porResponsable)) {
      const email = getUserEmail(nombre)
      if (!email) { console.warn('Sin email para responsable:', nombre); continue }
      await sendMail(
        email,
        `[CondoAdmin] Resumen diario — ${lineas.length} orden(es) a tu cargo`,
        `Hola ${nombre},\n\nEste es tu resumen diario de órdenes de trabajo pendientes como RESPONSABLE:\n\n${lineas.join('\n')}\n\nIngresa al sistema para gestionarlas.\n\n— CondoAdmin`
      )
      enviados++
    }

    // Enviar resumen a ejecutores
    for (const [nombre, lineas] of Object.entries(porEjecutor)) {
      const email = getUserEmail(nombre)
      if (!email) { console.warn('Sin email para ejecutor:', nombre); continue }
      await sendMail(
        email,
        `[CondoAdmin] Resumen diario — ${lineas.length} orden(es) asignada(s) a ti`,
        `Hola ${nombre},\n\nEste es tu resumen diario de órdenes de trabajo pendientes donde eres EJECUTOR:\n\n${lineas.join('\n')}\n\nRecuerda completar el informe una vez terminado el trabajo.\n\n— CondoAdmin`
      )
      enviados++
    }

    console.log(`Cron completado: ${enviados} mails enviados`)
    return res.status(200).json({ ok: true, enviados, tareas: tareas.length, fecha: hoy.toISOString() })

  } catch (ex) {
    console.error('Cron error:', ex.message)
    return res.status(500).json({ error: ex.message })
  }
}
