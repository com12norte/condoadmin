const nodemailer = require('nodemailer')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPA_URL,
  process.env.SUPA_SERVICE_KEY // service_role key, no la publishable
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
  if(!to || !to.includes('@')) return
  try {
    await transporter.sendMail({
      from: `"CondoAdmin" <${process.env.GMAIL_USER}>`,
      to, subject,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#0f172a;padding:16px 20px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0;font-size:16px">🏢 CondoAdmin</h2>
        </div>
        <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-wrap">${body}</p>
        </div>
      </div>`
    })
    console.log('Mail enviado a', to)
  } catch(ex) {
    console.error('Mail error', ex.message)
  }
}

module.exports = async function handler(req, res) {
  // Verificar que es llamada autorizada
  if(req.headers.authorization !== 'Bearer '+process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const hoy = new Date(); hoy.setHours(0,0,0,0)

    // Cargar tareas y usuarios desde Supabase
    const { data: tareasRaw } = await supabase.from('tareas').select('*')
    const { data: usuariosRaw } = await supabase.from('usuarios').select('*')

    const tareas = (tareasRaw || []).map(r => r.data).filter(Boolean)
    const usuarios = (usuariosRaw || []).filter(u => u.active && u.email)

    const getUserEmail = (nombre) => {
      const u = usuarios.find(x => x.nombre === nombre || x.email === nombre)
      return u?.email || null
    }

    // Agrupar tareas por responsable y ejecutor
    const porResponsable = {}
    const porEjecutor = {}

    for(const t of tareas) {
      if(!t.dueDate || t.informe?.trim() || t.status === 'Completada' || t.status === 'Cancelada') continue

      const due = new Date(t.dueDate); due.setHours(0,0,0,0)
      const diff = Math.ceil((due - hoy) / 86400000)
      const esVencida = diff < 0
      const esCritica = diff <= 3

      if(!esVencida && !esCritica) continue

      const diasTxt = esVencida
        ? `⚠️ VENCIDA hace ${Math.abs(diff)} día(s)`
        : diff === 0 ? '🔴 Vence HOY'
        : `🟡 Vence en ${diff} día(s)`

      const lineaTarea = `• ${t.title} — ${diasTxt} (${new Date(t.dueDate).toLocaleDateString('es-CL')})`

      // Por responsable
      if(t.responsible) {
        if(!porResponsable[t.responsible]) porResponsable[t.responsible] = []
        porResponsable[t.responsible].push(lineaTarea)
      }

      // Por ejecutor (si es distinto)
      if(t.ejecutor && t.ejecutor !== t.responsible) {
        if(!porEjecutor[t.ejecutor]) porEjecutor[t.ejecutor] = []
        porEjecutor[t.ejecutor].push(lineaTarea)
      }
    }

    let enviados = 0

    // Enviar a responsables
    for(const [nombre, lineas] of Object.entries(porResponsable)) {
      const email = getUserEmail(nombre)
      if(!email) continue
      await sendMail(
        email,
        `[CondoAdmin] Resumen diario — Órdenes a tu cargo (${lineas.length})`,
        `Hola ${nombre},\n\nEste es tu resumen diario de órdenes de trabajo pendientes como RESPONSABLE:\n\n${lineas.join('\n')}\n\nPor favor gestiona estas órdenes a la brevedad.\n\n— CondoAdmin`
      )
      enviados++
    }

    // Enviar a ejecutores
    for(const [nombre, lineas] of Object.entries(porEjecutor)) {
      const email = getUserEmail(nombre)
      if(!email) continue
      await sendMail(
        email,
        `[CondoAdmin] Resumen diario — Órdenes asignadas a ti (${lineas.length})`,
        `Hola ${nombre},\n\nEste es tu resumen diario de órdenes de trabajo pendientes donde eres EJECUTOR:\n\n${lineas.join('\n')}\n\nRecuerda completar el informe una vez terminado el trabajo.\n\n— CondoAdmin`
      )
      enviados++
    }

    return res.json({ ok: true, enviados, fecha: hoy.toISOString() })

  } catch(ex) {
    console.error('Cron error:', ex.message)
    return res.status(500).json({ error: ex.message })
  }
}
