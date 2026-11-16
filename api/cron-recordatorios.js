import nodeCrypto from "node:crypto";
// api/cron-recordatorios.js
// ---------------------------------------------------------------------------
// Envía UN solo correo resumen diario por persona con todas sus órdenes
// pendientes/vencidas sin informe. Corre en Vercel (Node.js), disparado por
// GitHub Actions (.github/workflows/cron-recordatorios.yml) cada hora.
// La función decide sola si "ya son las 8am en Chile" y si hoy ya se envió.
//
// VARIABLES DE ENTORNO en Vercel > Settings > Environment Variables:
//   FIREBASE_PROJECT_ID     -> ID del proyecto Firebase (ej: condoadmin-xxxxx)
//   FIREBASE_CLIENT_EMAIL   -> client_email del Service Account JSON
//   FIREBASE_PRIVATE_KEY    -> private_key del Service Account JSON (con \n reales)
//   CRON_SECRET             -> token de autorización (mismo que el secret de GitHub)
// ---------------------------------------------------------------------------

const SITE_URL = "https://condoadmin-rouge.vercel.app";
// Clave para que api/send-email acepte el envío (se deriva de la clave privada; igual en todos los api/)
const CLAVE_INTERNA = nodeCrypto.createHash("sha256").update("send-email|" + String(process.env.FIREBASE_PRIVATE_KEY || "")).digest("hex");
const CRON_SECRET = process.env.CRON_SECRET || "condoadmin2026";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

// ── JWT para Firestore REST API ─────────────────────────────────────────────
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: CLIENT_EMAIL,
    sub: CLIENT_EMAIL,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore",
  };
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sigInput = encode(header) + "." + encode(payload);

  const keyData = PRIVATE_KEY
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Buffer.from(keyData, "base64");
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(sigInput)
  );
  const jwt = sigInput + "." + Buffer.from(sig).toString("base64url");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("No se obtuvo access_token: " + JSON.stringify(data));
  return data.access_token;
}

// ── Firestore REST helpers ──────────────────────────────────────────────────
async function fsGet(token, coleccion) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${coleccion}?pageSize=500`;
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error(`Firestore ${coleccion}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.documents || []).map(fsDoc);
}

async function fsSet(token, coleccion, docId, fields) {
  const fsFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string") fsFields[k] = { stringValue: v };
    else if (typeof v === "boolean") fsFields[k] = { booleanValue: v };
    else if (typeof v === "number") fsFields[k] = { integerValue: String(v) };
  }
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${coleccion}/${docId}`;
  await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fsFields }),
  });
}

function fsVal(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal);
  if ("mapValue" in v) return fsDoc({ fields: v.mapValue.fields });
  return null;
}

function fsDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fsVal(v);
  if (doc.name) out._id = doc.name.split("/").pop();
  return out;
}

// ── Utilidades ──────────────────────────────────────────────────────────────
function fmtD(d) {
  try { return new Date(d).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }); }
  catch { return ""; }
}

async function sendMail(to, subject, body) {
  try {
    const res = await fetch(`${SITE_URL}/api/send-email`, {
      method: "POST",
      headers: { "x-clave-interna": CLAVE_INTERNA, "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
    });
    const text = await res.text().catch(() => "");
    return { to, ok: res.ok, status: res.status, error: res.ok ? undefined : text.slice(0, 200) };
  } catch (err) {
    return { to, ok: false, error: String(err) };
  }
}

// ── Handler principal ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }
  if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    return res.status(500).json({ error: "Faltan variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY" });
  }

  try {
    // Verificar hora de Chile — solo ejecutar a las 8am
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago", hour: "2-digit", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const get = t => parts.find(p => p.type === t)?.value;
    const chileHour = parseInt(get("hour"), 10);
    const chileDateKey = `${get("year")}-${get("month")}-${get("day")}`;

    if (chileHour !== 8) {
      return res.status(200).json({ ok: true, skipped: "no son las 8am en Chile", chileHour });
    }

    const token = await getAccessToken();

    // Verificar si ya se envió hoy
    const configDocs = await fsGet(token, "config");
    const lastSent = configDocs.find(d => d._id === "daily_reminder_last_sent");
    if (lastSent?.date === chileDateKey) {
      return res.status(200).json({ ok: true, skipped: "ya se envió hoy", chileDateKey });
    }

    // Cargar datos
    const [tasks, usuarios, sols] = await Promise.all([
      fsGet(token, "tareas"),
      fsGet(token, "usuarios"),
      fsGet(token, "solicitudes"),
    ]);

    // Documentos antiguos guardados como {id, data:{...}}: lo que hay en data es lo vigente
    const aplanar = d => {
      if (!d || !d.data || typeof d.data !== "object" || Array.isArray(d.data)) return d;
      const { data, ...rest } = d;
      return { ...rest, ...data };
    };
    const tareas = tasks.map(aplanar);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    // Tareas vencidas o por vencer en 3 días, sin informe
    const pendientes = tareas.filter(t => {
      if (!t.dueDate || (t.informe || "").trim() || t.status === "Completada" || t.status === "Cancelada") return false;
      const due = new Date(t.dueDate); due.setHours(0, 0, 0, 0);
      return Math.ceil((due - hoy) / 86400000) <= 3;
    });

    // Ley 21.442 art. 18: las solicitudes deben responderse en máximo 20 días corridos.
    // "Respondida" = la administración ya la asignó, la puso en proceso, la cerró o la rechazó.
    const SIN_RESPUESTA = ["Ingresada", "En revision"];
    const legales = sols.map(aplanar).filter(r => r && SIN_RESPUESTA.includes(r.status) && r.createdAt).map(r => {
      const vence = new Date(new Date(r.createdAt).getTime() + 20 * 86400000);
      const dias = Math.ceil((vence - Date.now()) / 86400000);
      return { ...r, vence, dias };
    }).filter(r => r.dias <= 5).sort((a, b) => a.dias - b.dias);

    // Certificaciones de equipos de seguridad (Mantención → Certificaciones) vencidas o que vencen en 30 días
    const docCerts = configDocs.map(aplanar).find(d => d && (d._id === "certs" || d.key === "certs"));
    const certs = (docCerts && Array.isArray(docCerts.data) ? docCerts.data : []).filter(x => x && x.vencimiento).map(x => {
      const dias = Math.ceil((new Date(x.vencimiento) - hoy) / 86400000);
      return { ...x, dias };
    }).filter(x => !isNaN(x.dias) && x.dias <= 30).sort((a, b) => a.dias - b.dias);

    if (!pendientes.length && !legales.length && !certs.length) {
      await fsSet(token, "config", "daily_reminder_last_sent", { date: chileDateKey, sentAt: now.toISOString() });
      return res.status(200).json({ ok: true, mensaje: "Sin pendientes hoy", chileDateKey });
    }

    // Índice email por nombre de usuario
    const emailPorNombre = {};
    usuarios.filter(u => u.active && u.nombre && u.email).forEach(u => { emailPorNombre[u.nombre] = u.email; });

    // Agrupar por destinatario
    const porEmail = {};
    const destino = (email, nombre) => {
      const k = String(email).trim().toLowerCase();
      if (!porEmail[k]) porEmail[k] = { nombre, tareas: [], legales: [], certs: [] };
      return porEmail[k];
    };
    const addItem = (email, nombre, tarea) => {
      if (!email) return;
      destino(email, nombre).tareas.push(tarea);
    };
    // Las solicitudes con plazo legal próximo o vencido van a los administradores
    if (legales.length || certs.length) {
      usuarios.filter(u => u.active !== false && ["Administrador", "Administrador Edificio"].includes(u.rol) && String(u.email || "").includes("@"))
        .forEach(u => { const d = destino(u.email, u.nombre || ""); d.legales = legales; d.certs = certs; });
    }

    for (const t of pendientes) {
      const due = new Date(t.dueDate); due.setHours(0, 0, 0, 0);
      const diff = Math.ceil((due - hoy) / 86400000);
      const esV = diff < 0;
      const diasTxt = esV
        ? "⚠ VENCIDA hace " + Math.abs(diff) + " día(s)"
        : diff === 0 ? "🔴 Vence HOY"
        : "🟡 Vence en " + diff + " día(s)";
      const item = { ...t, diasTxt, esV };
      if (t.responsible) addItem(emailPorNombre[t.responsible], t.responsible, item);
      if (t.ejecutor && t.ejecutor !== t.responsible) addItem(emailPorNombre[t.ejecutor], t.ejecutor, item);
    }

    // Un correo por persona
    const resultados = [];
    for (const [email, { nombre, tareas, legales: leg, certs: cer }] of Object.entries(porEmail)) {
      const venc = tareas.filter(t => t.esV).length;
      const legVenc = leg.filter(r => r.dias < 0).length;
      const asunto = legVenc > 0
        ? `[CondoAdmin] ⚠ ${legVenc} solicitud${legVenc > 1 ? "es" : ""} con plazo legal de respuesta vencido`
        : venc > 0
        ? `[CondoAdmin] ⚠ Tienes ${venc} orden${venc > 1 ? "es" : ""} vencida${venc > 1 ? "s" : ""} sin informe`
        : cer.some(x => x.dias < 0)
        ? `[CondoAdmin] ⚠ Certificaciones de seguridad vencidas`
        : leg.length && !tareas.length
        ? `[CondoAdmin] ${leg.length} solicitud${leg.length > 1 ? "es" : ""} por responder (plazo legal)`
        : `[CondoAdmin] Recordatorio: ${tareas.length} orden${tareas.length > 1 ? "es" : ""} pendiente${tareas.length > 1 ? "s" : ""} de informe`;
      let cuerpo = `Hola ${nombre},\n\n`;
      if (leg.length) {
        const fl = leg.map(r => `  • [${r.dias < 0 ? "⚠ VENCIDO hace " + Math.abs(r.dias) + " día(s)" : r.dias === 0 ? "🔴 Vence HOY" : "🟡 Quedan " + r.dias + " día(s)"}] ${r.code || r.id} · ${r.category || ""} · ${r.requesterName || ""} (ingresó ${fmtD(r.createdAt)})`).join("\n");
        cuerpo += `Solicitudes que deben responderse dentro de 20 días corridos (Ley 21.442, art. 18):\n\n${fl}\n\nPara darlas por respondidas, asígnalas, ponlas en proceso, ciérralas o recházalas con el motivo.\n\n`;
      }
      if (tareas.length) {
        const filas = tareas.map(t => `  • [${t.diasTxt}] ${t.title} (vence: ${fmtD(t.dueDate)})`).join("\n");
        cuerpo += `Órdenes pendientes de informe de cierre:\n\n${filas}\n\nIngresa al sistema y completa el informe de cada orden.\n\n`;
      }
      if (cer.length) {
        const fc = cer.map(x => `  • [${x.dias < 0 ? "⚠ VENCIDA hace " + Math.abs(x.dias) + " día(s)" : x.dias === 0 ? "🔴 Vence HOY" : "🟡 Vence en " + x.dias + " día(s)"}] ${x.equipoNombre || "Equipo"}${x.torre ? " · " + x.torre : ""}${x.ubicacion ? " · " + x.ubicacion : ""} (vence ${fmtD(x.vencimiento)})`).join("\n");
        cuerpo += `Certificaciones de equipos de seguridad (plan de emergencia, Ley 21.442 art. 40):\n\n${fc}\n\n`;
      }
      cuerpo += `— CondoAdmin`;
      resultados.push(await sendMail(email, asunto, cuerpo));
    }

    await fsSet(token, "config", "daily_reminder_last_sent", { date: chileDateKey, sentAt: now.toISOString() });

    const ok = resultados.filter(r => r.ok).length;
    return res.status(200).json({
      ok: true,
      chileDateKey,
      destinatarios: resultados.length,
      enviadosOk: ok,
      enviadosFallidos: resultados.length - ok,
      detalle: resultados,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
}
