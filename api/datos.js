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

const sha = s => nodeCrypto.createHash("sha256").update(s).digest("hex");
const firmaSesion = (email, hasta) => nodeCrypto.createHmac("sha256", sha("sesion-residente|" + PRIVATE_KEY)).update(email + "|" + hasta).digest("base64url");
const sesionValida = (email, sesion) => {
  const [h, f] = String(sesion || "").split(".");
  const hasta = parseInt(h, 10);
  if (!hasta || hasta < Date.now() || !f) return false;
  const a = Buffer.from(firmaSesion(email, hasta)), b = Buffer.from(f);
  return a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
};

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

function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) fields[k] = toFs(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

// ---------------------------------------------------------------------------
// api/datos.js — Derechos sobre datos personales (Ley 21.719) y plan de evacuación (Ley 21.442 art. 40)
//
//   POST {accion:"mis_datos", email, sesion}  o  {accion:"mis_datos", idToken}
//        -> registro de copropietario y solicitudes de esa persona (derecho de acceso y portabilidad)
//   POST {accion:"ejercer", tipo, detalle, email, sesion | idToken}
//        -> registra una solicitud de rectificación, supresión, oposición o retiro de consentimiento,
//           avisa a la administración y confirma al titular (plazo legal: 30 días corridos)
//   POST {accion:"evacuacion", idToken}  (solo administración, comité y conserjería)
//        -> resumen por unidad para el plan de evacuación (sin nombres)
//   POST {accion:"derechos", idToken}  (solo administración)
//        -> lista de solicitudes de derechos recibidas
//   POST {accion:"derecho_responder", idToken, id, respuesta, estado}  (solo administración)
// Usa las mismas variables de Vercel que el resto: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
// ---------------------------------------------------------------------------

const SITE_URL_D = "https://condoadmin-rouge.vercel.app";
const TIPOS = {
  rectificacion: "Rectificación (corregir datos)",
  supresion: "Supresión (eliminar datos)",
  oposicion: "Oposición a un uso de mis datos",
  retiro_consentimiento: "Retiro del consentimiento (datos de salud)",
  otro: "Otra consulta sobre mis datos",
};
const ROLES_EVAC = ["Administrador", "Administrador Edificio", "Comite", "Conserjeria"];
const ROLES_ADMIN = ["Administrador", "Administrador Edificio"];

// Campos internos que no se muestran (claves, enlaces personales, archivos)
const OCULTOS = /^(token|_.*|docs?|documentos|b64|evalToken|emailHash|hash)$/i;

// Si algún campo guarda un objeto como texto JSON (p. ej. "datos"), se convierte a objeto
function expandir(v) {
  if (typeof v === "string" && /^\s*[{[]/.test(v)) { try { return expandir(JSON.parse(v)); } catch { return v; } }
  if (Array.isArray(v)) return v.map(expandir);
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = expandir(x); return o; }
  return v;
}
// ¿Algún texto dentro del documento es exactamente este correo?
function contieneCorreo(v, email) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().toLowerCase() === email;
  if (Array.isArray(v)) return v.some(x => contieneCorreo(x, email));
  if (typeof v === "object") return Object.values(v).some(x => contieneCorreo(x, email));
  return false;
}
// Quita campos internos y archivos pesados
function limpiar(v) {
  if (Array.isArray(v)) return v.map(limpiar);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (OCULTOS.test(k)) continue;
      if (typeof x === "string" && x.length > 2000) continue;
      o[k] = limpiar(x);
    }
    return o;
  }
  return v;
}
// Busca un campo en el documento o dentro de su mapa "datos"
const campo = (r, k) => (r && r[k] !== undefined ? r[k] : r && r.datos && r.datos[k] !== undefined ? r.datos[k] : undefined);
const num = v => { const n = parseInt(String(v == null ? "" : v).replace(/\D/g, ""), 10); return isNaN(n) ? 0 : n; };

async function identificar(body) {
  if (body.idToken) {
    const email = await verificarIdToken(body.idToken);
    return email ? { email, porCuenta: true } : null;
  }
  const email = String(body.email || "").trim().toLowerCase();
  return email && sesionValida(email, body.sesion) ? { email, porCuenta: false } : null;
}
async function rolDe(token, email) {
  const r = await fsGetDoc(token, "roles/" + encodeURIComponent(email));
  return r && r.active !== false ? r.rol || "" : "";
}
async function enviarCorreo(to, subject, body) {
  try {
    const r = await fetch(`${SITE_URL_D}/api/send-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, body }) });
    return r.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    let body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("Faltan variables FIREBASE_*");
    const accion = String(body.accion || "");
    const quien = await identificar(body);
    if (!quien) return res.status(401).json({ ok: false, error: "Tu acceso venció. Vuelve a confirmar tu correo." });
    const token = await getAccessToken();
    const email = quien.email;

    // ── Derecho de acceso y portabilidad ──
    if (accion === "mis_datos") {
      const [coproRaw, sols] = await Promise.all([listarTodo(token, "copropietarios"), listarTodo(token, "solicitudes")]);
      const copro = coproRaw.map(expandir);
      // El propietario ve su registro completo; un residente (p. ej. arrendatario) ve solo sus propios datos y los de la unidad
      const registros = copro.filter(r => contieneCorreo(r, email)).map(r => {
        const d = limpiar(r);
        const prop = String(campo(r, "prop_mail") || "").trim().toLowerCase();
        if (!prop || prop === email) return d;
        const datos = d.datos && typeof d.datos === "object" ? d.datos : d;
        const propios = Object.fromEntries(Object.entries(datos).filter(([k]) => /^res_|^n_|^consent_|^mascota|^masc_|^em_/.test(k)));
        return { direccion: campo(r, "direccion"), depto: campo(r, "depto"), datos: propios, nota: "Se muestran solo tus datos como residente. Los datos del propietario los ve solo el propietario." };
      });
      const solicitudes = sols.filter(s => String(s.requesterEmail || "").trim().toLowerCase() === email).map(s => limpiar({
        codigo: s.code || s.id, fecha: s.createdAt, categoria: s.category, detalle: s.subcategory, descripcion: s.description,
        torre: s.tower, unidad: s.unit, estado: s.status, nombre: s.requesterName, correo: s.requesterEmail, telefono: s.requesterPhone,
      }));
      const derechos = (await listarTodo(token, "derechos")).filter(d => d.email === email)
        .map(d => ({ fecha: d.fecha, tipo: TIPOS[d.tipo] || d.tipo, estado: d.estado, respuesta: d.respuesta || "" }));
      return res.status(200).json({ ok: true, email, registros, solicitudes, derechos, generado: new Date().toISOString() });
    }

    // ── Rectificación, supresión, oposición, retiro de consentimiento ──
    if (accion === "ejercer") {
      const tipo = String(body.tipo || "");
      if (!TIPOS[tipo]) return res.status(400).json({ ok: false, error: "Tipo de solicitud no válido" });
      const detalle = String(body.detalle || "").trim().slice(0, 3000);
      if (detalle.length < 5) return res.status(400).json({ ok: false, error: "Cuéntanos qué necesitas." });
      const ahora = new Date();
      const vence = new Date(ahora.getTime() + 30 * 86400000);
      const id = "DER-" + ahora.toISOString().slice(0, 10).replace(/-/g, "") + "-" + nodeCrypto.randomBytes(3).toString("hex");
      const doc = { id, email, tipo, detalle, fecha: ahora.toISOString(), vence: vence.toISOString(), estado: "Recibida", respuesta: "", via: quien.porCuenta ? "cuenta" : "codigo" };
      const r = await fetch(`${FS()}/derechos/${id}`, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ fields: toFs(doc).mapValue.fields }) });
      if (!r.ok) throw new Error("Firestore derechos: " + r.status + " " + (await r.text()));
      const fv = vence.toLocaleDateString("es-CL", { timeZone: "America/Santiago" });
      const usuarios = await listarTodo(token, "usuarios");
      const admins = [...new Set(usuarios.filter(u => u.active !== false && ROLES_ADMIN.includes(u.rol) && String(u.email || "").includes("@")).map(u => u.email.trim().toLowerCase()))];
      await Promise.all(admins.map(a => enviarCorreo(a, `[CondoAdmin] Solicitud de datos personales ${id}: ${TIPOS[tipo]}`,
        `Se recibió una solicitud sobre datos personales (Ley 21.719).\n\nCódigo: ${id}\nTitular: ${email}\nTipo: ${TIPOS[tipo]}\n\n${detalle}\n\nPlazo legal para responder: ${fv} (30 días corridos, art. 11).\nResponde desde CondoAdmin → Configuración → Datos personales.\n\n— CondoAdmin`)));
      await enviarCorreo(email, `[Edificio 12 Norte] Recibimos tu solicitud ${id}`,
        `Hola,\n\nRecibimos tu solicitud sobre tus datos personales.\n\nCódigo: ${id}\nTipo: ${TIPOS[tipo]}\n\nTe responderemos a más tardar el ${fv} (30 días corridos, Ley 21.719 art. 11). Si no recibes respuesta o no estás de acuerdo, puedes reclamar ante la Agencia de Protección de Datos Personales.\n\n— Comunidad Edificio 12 Norte de Viña del Mar`);
      return res.status(200).json({ ok: true, id, vence: vence.toISOString() });
    }

    // ── Solo personal: verificar rol ──
    if (!quien.porCuenta) return res.status(403).json({ ok: false, error: "Sin permisos" });
    const rol = await rolDe(token, email);

    // ── Listado para el plan de evacuación (sin nombres) ──
    if (accion === "evacuacion") {
      if (!ROLES_EVAC.includes(rol)) return res.status(403).json({ ok: false, error: "Sin permisos" });
      const copro = (await listarTodo(token, "copropietarios")).map(expandir);
      const filas = copro.map(r => {
        const consent = campo(r, "consent_salud");
        const salud = consent === "Sí" || consent === undefined; // registros anteriores al consentimiento: base legal art. 40
        return {
          direccion: String(campo(r, "direccion") || ""), depto: String(campo(r, "depto") || r._docId || ""),
          residentes: num(campo(r, "n_res")), menores: num(campo(r, "n_menores")), adultosMayores: num(campo(r, "n_adultos")),
          noHispanos: num(campo(r, "n_nohisp")),
          discapacidad: salud ? num(campo(r, "n_disc")) : null, movilidadReducida: salud ? num(campo(r, "n_movred")) : null,
          electrodependientes: salud ? num(campo(r, "n_electro")) : null,
          consentimientoSalud: consent === "Sí" ? "Sí" : consent === "No" ? "No" : "Sin registro",
          mascota: String(campo(r, "mascota") || ""), actualizado: String(campo(r, "anio") || campo(r, "updatedAt") || campo(r, "fecha") || ""),
        };
      }).filter(f => f.depto || f.direccion);
      return res.status(200).json({ ok: true, filas, generado: new Date().toISOString() });
    }

    // ── Bandeja de solicitudes de derechos (administración) ──
    if (accion === "derechos" || accion === "derecho_responder") {
      if (!ROLES_ADMIN.includes(rol)) return res.status(403).json({ ok: false, error: "Sin permisos" });
      if (accion === "derecho_responder") {
        const id = String(body.id || "");
        if (!/^DER-[\w-]{1,40}$/.test(id)) return res.status(400).json({ ok: false, error: "Código no válido" });
        const d = await fsGetDoc(token, "derechos/" + id);
        if (!d) return res.status(404).json({ ok: false, error: "No existe" });
        const respuesta = String(body.respuesta || "").trim().slice(0, 3000);
        const estado = ["Recibida", "En revisión", "Respondida", "Rechazada"].includes(body.estado) ? body.estado : "Respondida";
        if ((estado === "Respondida" || estado === "Rechazada") && respuesta.length < 5) return res.status(400).json({ ok: false, error: "Escribe la respuesta para el titular." });
        const patch = { estado, respuesta, respondidoPor: email, respondidoAt: new Date().toISOString() };
        const mask = Object.keys(patch).map(k => "updateMask.fieldPaths=" + k).join("&");
        const r = await fetch(`${FS()}/derechos/${id}?${mask}`, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ fields: toFs(patch).mapValue.fields }) });
        if (!r.ok) throw new Error("Firestore responder: " + r.status);
        let correo = false;
        if (estado === "Respondida" || estado === "Rechazada") {
          correo = await enviarCorreo(d.email, `[Edificio 12 Norte] Respuesta a tu solicitud ${id}`,
            `Hola,\n\nRespecto de tu solicitud ${id} (${TIPOS[d.tipo] || d.tipo}):\n\n${respuesta}\n\n${estado === "Rechazada" ? "Si no estás de acuerdo, puedes reclamar ante la Agencia de Protección de Datos Personales dentro de 30 días hábiles.\n\n" : ""}— Comunidad Edificio 12 Norte de Viña del Mar`);
        }
        return res.status(200).json({ ok: true, correo });
      }
      const lista = (await listarTodo(token, "derechos")).map(d => ({ id: d.id || d._docId, email: d.email, tipo: d.tipo, tipoTxt: TIPOS[d.tipo] || d.tipo, detalle: d.detalle, fecha: d.fecha, vence: d.vence, estado: d.estado, respuesta: d.respuesta || "", respondidoAt: d.respondidoAt || "" }))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      return res.status(200).json({ ok: true, lista });
    }

    return res.status(400).json({ ok: false, error: "Acción no válida" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error del servidor. Intenta de nuevo en unos minutos." });
  }
}
