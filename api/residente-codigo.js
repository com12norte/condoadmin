import nodeCrypto from "node:crypto";

const SITE_URL = "https://condoadmin-rouge.vercel.app";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
// La clave se reconstruye en formato estándar: tolera comillas, "\n" escritos como texto,
// saltos de línea de Windows o la clave pegada en una sola línea.
const PRIVATE_KEY = (() => {
  const raw = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const m = /-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/.exec(raw);
  if (!m) return raw.trim();
  const b64 = m[1].replace(/\\[rn]/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  return "-----BEGIN PRIVATE KEY-----\n" + (b64.match(/.{1,64}/g) || []).join("\n") + "\n-----END PRIVATE KEY-----\n";
})();
const FS = () => `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── Token de acceso a Firestore con la cuenta de servicio ───────────────────
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const enc = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const sigInput = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: CLIENT_EMAIL, sub: CLIENT_EMAIL, aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 600, scope: "https://www.googleapis.com/auth/datastore",
  });
  const sig = nodeCrypto.createSign("RSA-SHA256").update(sigInput).sign(PRIVATE_KEY, "base64url");
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: sigInput + "." + sig }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("No se obtuvo access_token: " + JSON.stringify(data));
  return data.access_token;
}

// ── Lectura de documentos Firestore (REST) ──────────────────────────────────
function fsVal(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal);
  if ("mapValue" in v) return fsObj(v.mapValue.fields);
  return null;
}
function fsObj(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fsVal(v);
  return out;
}
// Documentos antiguos guardados como {id, data:{...}}: lo que hay en data es lo vigente
const aplanar = d => {
  if (!d || !d.data || typeof d.data !== "object" || Array.isArray(d.data)) return d;
  const { data, ...rest } = d;
  return { ...rest, ...data };
};
async function fsGetDoc(token, path) {
  const res = await fetch(`${FS()}/${path}`, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path}: ${res.status} ${await res.text()}`);
  return fsObj((await res.json()).fields);
}

// ---------------------------------------------------------------------------
// api/residente-codigo.js
// Acceso del residente a "Mis solicitudes" con un código de 6 dígitos por correo.
//   POST {accion:"enviar", email}            -> envía el código (vale 10 minutos)
//   POST {accion:"verificar", email, codigo} -> {ok:true, sesion} si el código es correcto
//   POST {accion:"listar", email, sesion}     -> {ok:true, solicitudes, vencidas} del residente
// Solo se envía código a correos que tengan al menos una solicitud ingresada,
// para que nadie pueda usar esto para mandar correos a terceros.
// Usa las mismas variables de Vercel que el cron: FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
// ---------------------------------------------------------------------------

const VIGENCIA_MS = 10 * 60 * 1000;
const ESPERA_REENVIO_MS = 60 * 1000;
const MAX_INTENTOS = 5;

const sha = s => nodeCrypto.createHash("sha256").update(s).digest("hex");
// El código nunca se guarda en claro: se guarda una firma hecha con una clave que solo conoce el servidor
const firma = (email, codigo) => nodeCrypto.createHmac("sha256", sha("codigo-residente|" + PRIVATE_KEY)).update(email + "|" + codigo).digest("hex");

// Sesión del residente (30 días): firma del correo + vencimiento, verificable sin guardar nada
const SESION_MS = 30 * 86400000;
const firmaSesion = (email, hasta) => nodeCrypto.createHmac("sha256", sha("sesion-residente|" + PRIVATE_KEY)).update(email + "|" + hasta).digest("base64url");
const crearSesion = email => { const hasta = Date.now() + SESION_MS; return { hasta, sesion: hasta + "." + firmaSesion(email, hasta) }; };
const sesionValida = (email, sesion) => {
  const [h, f] = String(sesion || "").split(".");
  const hasta = parseInt(h, 10);
  if (!hasta || hasta < Date.now() || !f) return false;
  const a = Buffer.from(firmaSesion(email, hasta)), b = Buffer.from(f);
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
};

async function listarTodo(token, coleccion) {
  const out = []; let pageToken = "";
  do {
    const url = `${FS()}/${coleccion}?pageSize=300` + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) throw new Error("Firestore " + coleccion + ": " + res.status + " " + (await res.text()));
    const json = await res.json();
    for (const d of json.documents || []) out.push({ ...aplanar(fsObj(d.fields)), _docId: d.name.split("/").pop() });
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return out;
}

async function tieneSolicitudes(token, email) {
  let pageToken = "";
  do {
    const url = `${FS()}/solicitudes?pageSize=300&mask.fieldPaths=requesterEmail&mask.fieldPaths=data.requesterEmail` + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) throw new Error("Firestore solicitudes: " + res.status + " " + (await res.text()));
    const json = await res.json();
    for (const d of json.documents || []) {
      const s = aplanar(fsObj(d.fields));
      if (String(s.requesterEmail || "").trim().toLowerCase() === email) return true;
    }
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return false;
}

async function guardar(token, docId, f) {
  const res = await fetch(`${FS()}/codigos_acceso/${docId}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: {
      h: { stringValue: f.h }, exp: { integerValue: String(f.exp) },
      n: { integerValue: String(f.n) }, t: { integerValue: String(f.t) },
    } }),
  });
  if (!res.ok) throw new Error("Firestore guardar código: " + res.status + " " + (await res.text()));
}
const borrar = (token, docId) => fetch(`${FS()}/codigos_acceso/${docId}`, { method: "DELETE", headers: { Authorization: "Bearer " + token } });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    let body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const accion = String(body.accion || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) return res.status(400).json({ ok: false, error: "Escribe un correo válido." });
    if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("Faltan variables FIREBASE_*");

    const token = await getAccessToken();
    const docId = sha(email);
    const ahora = Date.now();

    if (accion === "enviar") {
      const previo = await fsGetDoc(token, "codigos_acceso/" + docId);
      if (previo && ahora - (previo.t || 0) < ESPERA_REENVIO_MS) {
        return res.status(429).json({ ok: false, error: "Ya te enviamos un código. Espera un minuto antes de pedir otro." });
      }
      if (!(await tieneSolicitudes(token, email))) {
        return res.status(404).json({ ok: false, error: "No encontramos solicitudes ingresadas con ese correo. Revisa que esté bien escrito." });
      }
      const codigo = String(nodeCrypto.randomInt(0, 1000000)).padStart(6, "0");
      await guardar(token, docId, { h: firma(email, codigo), exp: ahora + VIGENCIA_MS, n: 0, t: ahora });
      const mail = await fetch(`${SITE_URL}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: "[CondoAdmin] Tu código de acceso: " + codigo,
          body: "Tu código para ver tus solicitudes en CondoAdmin es:\n\n    " + codigo + "\n\nVale por 10 minutos. Si no lo pediste, ignora este correo.\n\n— CondoAdmin",
        }),
      });
      if (!mail.ok) {
        await borrar(token, docId);
        return res.status(502).json({ ok: false, error: "No se pudo enviar el correo. Intenta de nuevo en unos minutos." });
      }
      return res.status(200).json({ ok: true });
    }

    if (accion === "verificar") {
      const codigo = String(body.codigo || "").replace(/\D/g, "");
      const reg = await fsGetDoc(token, "codigos_acceso/" + docId);
      if (!reg) return res.status(400).json({ ok: false, error: "Pide un código nuevo." });
      if (ahora > (reg.exp || 0)) { await borrar(token, docId); return res.status(400).json({ ok: false, error: "El código venció. Pide uno nuevo." }); }
      if ((reg.n || 0) >= MAX_INTENTOS) { await borrar(token, docId); return res.status(429).json({ ok: false, error: "Demasiados intentos. Pide un código nuevo." }); }
      const a = Buffer.from(firma(email, codigo)), b = Buffer.from(String(reg.h || ""));
      if (codigo.length !== 6 || a.length !== b.length || !nodeCrypto.timingSafeEqual(a, b)) {
        await guardar(token, docId, { h: reg.h, exp: reg.exp, n: (reg.n || 0) + 1, t: reg.t || 0 });
        return res.status(400).json({ ok: false, error: "Código incorrecto. Revisa el correo e intenta de nuevo." });
      }
      await borrar(token, docId);
      return res.status(200).json({ ok: true, ...crearSesion(email) });
    }

    if (accion === "listar") {
      if (!sesionValida(email, body.sesion)) return res.status(401).json({ ok: false, error: "Tu acceso venció. Confirma tu correo de nuevo." });
      const sols = (await listarTodo(token, "solicitudes")).filter(s => String(s.requesterEmail || "").trim().toLowerCase() === email);
      const ids = new Set(sols.map(s => s.id || s._docId));
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const tareas = (await listarTodo(token, "tareas")).filter(t => ids.has(t.requestId));
      // Solo lo que el residente necesita ver de sus solicitudes
      const CAMPOS = ["id","code","createdAt","category","subcategory","description","priority","status","tower","unit","requesterName","requesterEmail","requesterPhone","accessPermission","affectedTowers","assignedTo","closeNote","closedAt","evalToken","evaluacion","history","attachmentsInitial","prioAuto"];
      const solicitudes = sols.map(s => {
        const o = {}; for (const k of CAMPOS) if (s[k] !== undefined) o[k] = s[k];
        o.id = o.id || s._docId;
        o.history = (o.history || []).map(h => ({ date: h.date, action: h.action, from: h.from, to: h.to, note: h.note || "" }));
        o.comments = [];
        return o;
      });
      const tareasRes = tareas.map(t => ({ id: t.id || t._docId, requestId: t.requestId, title: t.title, dueDate: t.dueDate, status: t.status, informe: (t.informe || "").trim() ? "ok" : "", responsible: t.responsible }));
      return res.status(200).json({ ok: true, solicitudes, tareas: tareasRes });
    }

    return res.status(400).json({ ok: false, error: "Acción no válida" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error del servidor. Intenta de nuevo en unos minutos." });
  }
}
