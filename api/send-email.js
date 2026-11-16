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

let _certs = null, _certsHasta = 0;
async function verificarIdToken(idToken) {
  try {
    const [h, p, sig] = String(idToken || "").split(".");
    if (!h || !p || !sig) return null;
    const head = JSON.parse(Buffer.from(h, "base64url").toString());
    const pay = JSON.parse(Buffer.from(p, "base64url").toString());
    const ahora = Math.floor(Date.now() / 1000);
    if (head.alg !== "RS256" || pay.aud !== PROJECT_ID || pay.iss !== "https://securetoken.google.com/" + PROJECT_ID) return null;
    if (!(pay.exp > ahora) || !(pay.iat <= ahora + 300) || !pay.sub || !pay.email) return null;
    if (!_certs || Date.now() > _certsHasta) {
      const r = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
      _certs = await r.json(); _certsHasta = Date.now() + 3600000;
    }
    const cert = _certs[head.kid];
    if (!cert) return null;
    const ok = nodeCrypto.createVerify("RSA-SHA256").update(h + "." + p).verify(cert, Buffer.from(sig, "base64url"));
    return ok ? String(pay.email).trim().toLowerCase() : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// api/send-email.js — Envío de correos (Nodemailer + Gmail)
//
// SOLO acepta pedidos de:
//   1) Los servicios del propio servidor (api/), que envían la cabecera "x-clave-interna".
//   2) Personal de CondoAdmin con sesión iniciada (Administrador, Administrador Edificio,
//      Conserjería, Comité o Proveedor), que envía su token de Firebase.
// Cualquier otro pedido se rechaza, para que nadie pueda usar la cuenta de Gmail
// de la comunidad para enviar correos falsos (Ley 21.719, art. 14 quinquies).
//
// VARIABLES EN VERCEL: GMAIL_USER, GMAIL_APP_PASS (cuenta de envío) y las FIREBASE_*.
// ---------------------------------------------------------------------------
import nodemailer from "nodemailer";

const ROLES_PERSONAL = ["Administrador", "Administrador Edificio", "Conserjeria", "Comite", "Proveedor"];
// Clave interna: se deriva de la clave privada (solo la conoce el servidor). Debe calcularse igual en api/*.
const claveInterna = () => nodeCrypto.createHash("sha256").update("send-email|" + String(process.env.FIREBASE_PRIVATE_KEY || "")).digest("hex");

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
    });
  }
  return transporter;
}

async function autorizado(req) {
  const k = String(req.headers["x-clave-interna"] || "");
  if (k && process.env.FIREBASE_PRIVATE_KEY) {
    const a = Buffer.from(k), b = Buffer.from(claveInterna());
    if (a.length === b.length && nodeCrypto.timingSafeEqual(a, b)) return "servidor";
  }
  const auth = String(req.headers.authorization || "");
  if (auth.startsWith("Bearer ") && PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY) {
    const email = await verificarIdToken(auth.slice(7));
    if (!email) return null;
    const token = await getAccessToken();
    const r = await fsGetDoc(token, "roles/" + encodeURIComponent(email));
    if (r && r.active !== false && ROLES_PERSONAL.includes(r.rol)) return email;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido, use POST" });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
    return res.status(500).json({ error: "Faltan las variables de entorno GMAIL_USER / GMAIL_APP_PASS en Vercel" });
  }
  let quien;
  try { quien = await autorizado(req); } catch (e) { console.error("auth send-email", e); quien = null; }
  if (!quien) return res.status(401).json({ error: "No autorizado" });

  let body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").slice(0, 300);
  const texto = String(body.body || "").slice(0, 20000);
  // Un solo destinatario por envío
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to) || !subject) {
    return res.status(400).json({ error: "Faltan campos requeridos: 'to' (un correo válido) y 'subject'" });
  }
  try {
    const info = await getTransporter().sendMail({ from: `"CondoAdmin · Edificio 12 Norte" <${process.env.GMAIL_USER}>`, to, subject, text: texto });
    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error("Error enviando correo con Nodemailer:", err);
    return res.status(500).json({ error: String(err) });
  }
}
