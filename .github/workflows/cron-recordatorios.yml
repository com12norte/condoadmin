// api/cron-recordatorios.js
// ---------------------------------------------------------------------------
// Envía UN solo correo resumen diario (solicitudes + órdenes de trabajo) a
// los administradores. Corre en Vercel (servidor), disparado por el workflow
// de GitHub Actions (.github/workflows/cron-recordatorios.yml).
//
// Se auto-controla con la hora real de Chile (America/Santiago) y una marca
// guardada en la tabla "config" de Supabase, así que aunque GitHub Actions lo
// llame varias veces al día, el correo real solo sale UNA vez — y no hay que
// tocar nada cuando Chile cambia de horario de verano/invierno.
//
// VARIABLES DE ENTORNO A CONFIGURAR EN VERCEL (Project Settings > Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  -> Project Settings > API en Supabase (NUNCA la publiques en el frontend)
//   CRON_SECRET                -> el mismo valor que usas en el header Authorization del workflow
//                                  (hoy es "condoadmin2026" — te recomiendo moverlo a esta variable
//                                  de entorno en vez de dejarlo escrito en el .yml)
//
// Reutiliza tu endpoint /api/send-email ya desplegado (Nodemailer + Gmail),
// así no duplicamos la lógica de envío ni las credenciales de Gmail acá.
// ---------------------------------------------------------------------------

const SUPA_URL = "https://ijefrrtdtjshfquuytic.supabase.co";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_sZTDO3ROm8IEnzbWuEUK-w_DeOz65XG";
const SITE_URL = "https://condoadmin-rouge.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET || "condoadmin2026";

const PRIORITIES = ["Emergencia", "Alta", "Media", "Baja"];

function hdr() {
  return { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY };
}

async function dbGet(table, query = "select=*") {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${query}`, { headers: hdr() });
  if (!res.ok) throw new Error(`Error consultando ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function dbUpsertConfig(key, data) {
  await fetch(`${SUPA_URL}/rest/v1/config`, {
    method: "POST",
    headers: { ...hdr(), "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ key, data }),
  });
}

async function sendMail(to, subject, body) {
  const res = await fetch(`${SITE_URL}/api/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, body }),
  });
  if (!res.ok) console.warn("send-email error", res.status, await res.text());
}

function fmt(d) {
  try { return new Date(d).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }); }
  catch { return ""; }
}
function fmtD(d) {
  try { return new Date(d).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }); }
  catch { return ""; }
}

// Misma definición de SLA que usa la app (App.jsx) — si cambias la tabla allá, cámbiala también aquí.
function slaStatus(r) {
  if (!r.dueDate) return null;
  const due = new Date(r.dueDate);
  if (["Resuelta", "Cerrada"].includes(r.status)) {
    const h = (r.history || []).find(x => x.to === "Resuelta" || x.to === "Cerrada");
    const ref = h ? new Date(h.date) : new Date();
    return ref <= due ? "Cumplido" : "Fuera de plazo";
  }
  if (r.status === "Rechazada") return null;
  const now = new Date();
  if (now > due) return "Vencido";
  if ((due.getTime() - now.getTime()) <= 24 * 3600000) return "Por vencer";
  return "En plazo";
}

export default async function handler(req, res) {
  // Autenticación: mismo Bearer token que ya usa el workflow de GitHub Actions
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    // Auto-detección de hora de Chile (sin depender de ajustar el cron a mano
    // dos veces al año). El workflow puede llamarse cada hora; esta función
    // decide sola si "ya son las 8am en Chile" y si hoy ya se envió.
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = t => parts.find(p => p.type === t)?.value;
    const chileHour = parseInt(get("hour"), 10);
    const chileDateKey = `${get("year")}-${get("month")}-${get("day")}`;

    if (chileHour !== 8) {
      return res.status(200).json({ ok: true, skipped: "no son las 8am en Chile", chileHour });
    }

    const configRows = await dbGet("config", "key=eq.daily_summary_last_sent&select=*");
    const last = configRows?.[0]?.data?.date;
    if (last === chileDateKey) {
      return res.status(200).json({ ok: true, skipped: "ya se envió hoy", chileDateKey });
    }

    const [reqs, tasks, usuarios] = await Promise.all([
      dbGet("solicitudes"),
      dbGet("tareas"),
      dbGet("usuarios"),
    ]);

    // Los datos vienen guardados como {id, data:{...}} — igual que en App.jsx
    const reqsData = reqs.map(r => r.data).filter(Boolean);
    const tasksData = tasks.map(t => t.data).filter(Boolean);

    const activas = reqsData.filter(r => !["Cerrada", "Rechazada"].includes(r.status));
    const vencidas = reqsData.filter(r => slaStatus(r) === "Vencido");
    const porVencer = reqsData.filter(r => slaStatus(r) === "Por vencer");
    const porPrioridad = PRIORITIES.map(p => `${p}: ${activas.filter(r => r.priority === p).length}`).join(" · ");
    const ordenesPendientes = tasksData.filter(t => t.status !== "Completada" && t.status !== "Cancelada");
    const ordenesVencidas = ordenesPendientes.filter(t => t.dueDate && new Date(t.dueDate) < now && !(t.informe || "").trim());

    let cuerpo = `Resumen diario CondoAdmin — ${fmtD(now)}\n\n`;
    cuerpo += "SOLICITUDES\n";
    cuerpo += `Activas: ${activas.length} (${porPrioridad})\n`;
    cuerpo += `SLA vencido: ${vencidas.length}\n`;
    cuerpo += `SLA por vencer (próximas 24h): ${porVencer.length}\n\n`;
    if (vencidas.length) {
      cuerpo += "— Vencidas —\n";
      vencidas.slice(0, 15).forEach(r => { cuerpo += `${r.code} · ${r.category} · ${r.priority} · límite ${fmt(r.dueDate)}\n`; });
      if (vencidas.length > 15) cuerpo += `... y ${vencidas.length - 15} más\n`;
      cuerpo += "\n";
    }
    if (porVencer.length) {
      cuerpo += "— Por vencer —\n";
      porVencer.slice(0, 15).forEach(r => { cuerpo += `${r.code} · ${r.category} · ${r.priority} · límite ${fmt(r.dueDate)}\n`; });
      if (porVencer.length > 15) cuerpo += `... y ${porVencer.length - 15} más\n`;
      cuerpo += "\n";
    }
    cuerpo += "ÓRDENES DE TRABAJO\n";
    cuerpo += `Pendientes: ${ordenesPendientes.length}\n`;
    cuerpo += `Vencidas sin informe: ${ordenesVencidas.length}\n`;
    if (ordenesVencidas.length) {
      ordenesVencidas.slice(0, 15).forEach(t => { cuerpo += `- ${t.title} · resp. ${t.responsible} · vencía ${fmtD(t.dueDate)}\n`; });
      if (ordenesVencidas.length > 15) cuerpo += `... y ${ordenesVencidas.length - 15} más\n`;
    }
    cuerpo += "\nIngresa al sistema para más detalle.\n— CondoAdmin";

    const asunto = `[CondoAdmin] Resumen diario — ${fmtD(now)} (${activas.length} activas, ${vencidas.length} vencidas)`;
    const usuariosData = usuarios.map(u => u.data || u).filter(Boolean); // por si "usuarios" no usa el wrapper {data}
    const admins = usuariosData.filter(u => ["Administrador", "Administrador Edificio"].includes(u.rol) && u.active && u.email?.includes("@"));

    for (const u of admins) {
      await sendMail(u.email, asunto, cuerpo);
    }
    await dbUpsertConfig("daily_summary_last_sent", { date: chileDateKey, sentAt: now.toISOString() });

    return res.status(200).json({ ok: true, enviados: admins.length, activas: activas.length, vencidas: vencidas.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
