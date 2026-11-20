import nodeCrypto from "node:crypto";

const SITE_URL = "https://condoadmin-rouge.vercel.app";
// Clave para que api/send-email acepte el envío (se deriva de la clave privada; igual en todos los api/)
const CLAVE_INTERNA = nodeCrypto.createHash("sha256").update("send-email|" + String(process.env.FIREBASE_PRIVATE_KEY || "")).digest("hex");
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
//   POST {accion:"listar", email, sesion}     -> {ok:true, solicitudes, tareas} del residente
//   POST {accion:"listar", idToken}           -> lo mismo, para el residente que entró con su cuenta
//        (el token de Firebase se verifica con las claves públicas de Google)
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

// Verifica el token de inicio de sesión de Firebase y devuelve el correo (o null)
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

// Páginas que pueden llamar a este servicio desde el navegador (formulario de copropietarios en GitHub Pages)
const ORIGENES = ["https://com12norte.github.io", "https://condoadmin-rouge.vercel.app", "https://parkadmin-ashy.vercel.app"];

// Registros de copropietarios asociados a un correo (propietario o residente)
function expandirJSON(v) {
  if (typeof v === "string" && /^\s*[{[]/.test(v)) { try { return JSON.parse(v); } catch { return v; } }
  return v;
}
// Unidad normalizada: "12 Norte 1080" + "1a" -> "1080-A1"
function claveUnidad(dir, depto) {
  const nums = String(dir || "").match(/\d{3,4}/g);
  const t = nums ? nums[nums.length - 1] : "";
  let d = String(depto || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = d.match(/^(\d)([A-Z])$/); if (m) d = m[2] + m[1];
  return t && d ? t + "-" + d : "";
}
// Documentos que faltan según el Registro de Copropietarios (mismo criterio que el código de Google)
const NOMBRE_DOC = { dominio: "Certificado de dominio vigente", ci_dueno: "Cédula de identidad del o los propietarios", contrato: "Contrato de arriendo o declaración del propietario", ci_arrendatario: "Cédula del arrendatario u ocupante" };
function docsFaltan(r) {
  const d = expandirJSON(r.datos) || {}, est = expandirJSON(r.docsEstado) || {}, ocup = expandirJSON(r.ocupante) || {};
  let docs = expandirJSON(r.docs) || []; if (!Array.isArray(docs)) docs = [];
  docs = docs.map(x => (x && x._lista) ? x._lista : x);
  const anio = new Date().getFullYear();
  const vigente = x => x && x.estado !== "rechazado" && !(x.tipo === "dominio" && x.fecha && parseInt(String(x.fecha).slice(0, 4), 10) < anio);
  const arrienda = /arrend|prestada/i.test(d.uso || "") || !!ocup.activo || est.contrato === "falta" || est.ci_arrendatario === "falta";
  const req = ["dominio", "ci_dueno"].concat(arrienda ? ["contrato", "ci_arrendatario"] : []);
  return req.filter(t => est[t] !== "ok" && !docs.some(x => x.tipo === t && vigente(x))).map(t => NOMBRE_DOC[t]);
}
// Unidades del Registro de Copropietarios (el maestro) en que figura este correo
async function registrosDe(token, email) {
  const out = [];
  for (const r of await listarTodo(token, "copropietarios")) {
    const d = expandirJSON(r.datos) || {}, ocup = expandirJSON(r.ocupante) || {};
    const prop = String(d.prop_mail || r.prop_mail || "").trim().toLowerCase();
    const resi = String(d.res_mail || r.res_mail || "").trim().toLowerCase();
    const ocu = String(ocup.correo || "").trim().toLowerCase();
    const base = { direccion: r.direccion || "", depto: r.depto || "", unidad: claveUnidad(r.direccion, r.depto), estado: r.estado || "", faltan: docsFaltan(r) };
    if (prop === email) out.push({ ...base, token: r.token || "", rol: "propietario" });
    else if (resi === email || ocu === email) out.push({ ...base, rol: "residente" });
  }
  return out;
}

// ── Parking: el residente registra su estacionamiento por el servidor ──
// Solo puede hacerlo para una unidad donde su correo figura en el Registro de Copropietarios
// y que tenga los documentos completos. Siempre queda «pendiente» de visado.
function aFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aFs) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, aFs(x)])) } };
  return { stringValue: String(v) };
}
async function fsSet(token, path, obj) {
  const res = await fetch(`${FS()}/${path}`, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ fields: aFs(obj).mapValue.fields }) });
  if (!res.ok) throw new Error("Firestore " + path + ": " + res.status + " " + (await res.text()));
}
const txt = (v, n = 120) => String(v == null ? "" : v).slice(0, n);
const nombreCorto = n => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); return !p.length ? "" : p.length > 1 ? p[0] + " " + p[1][0].toUpperCase() + "." : p[0]; };
async function guardarParking(token, email, b) {
  const spot = parseInt(b.spotId, 10);
  if (!(spot > 0 && spot < 1000)) return { status: 400, body: { ok: false, error: "Estacionamiento no válido" } };
  const unidad = claveUnidad(b.torre, b.depto);
  const mia = (await registrosDe(token, email)).find(r => r.unidad === unidad);
  if (!mia) return { status: 403, body: { ok: false, error: "Tu correo no figura en el Registro de Copropietarios para esta unidad." } };
  if (mia.faltan.length) return { status: 403, body: { ok: false, error: "Faltan documentos en el Registro de Copropietarios.", faltan: mia.faltan } };
  const r = b.registro || {};
  const veh = (Array.isArray(r.vehiculos) ? r.vehiculos : []).slice(0, 5).map(v => ({ patente: txt(v.patente, 10).toUpperCase(), marca: txt(v.marca, 40), color: txt(v.color, 30), esVisita: v.esVisita === "si" ? "si" : "no", nombreVisita: txt(v.nombreVisita, 80), telefonoVisita: txt(v.telefonoVisita, 20) })).filter(v => v.patente);
  const uso = ["uso_exclusivo", "visitas", "ceder_largo", "sin_uso"].includes(r.usoEstacionamiento) ? r.usoEstacionamiento : "";
  const ahora = new Date().toISOString();
  const datos = {
    nombre: txt(r.nombre, 80), rut: txt(r.rut, 15), email, telefono: txt(r.telefono, 20), tipoResidente: txt(r.tipoResidente, 30),
    usoEstacionamiento: uso, vehiculos: veh, patentes: veh.map(v => v.patente.replace(/[^A-Z0-9]/g, "")),
    emailHash: sha(email), estadoRegistro: "pendiente", updatedAt: ahora, fechaRegistro: txt(r.fechaRegistro, 10) || ahora.slice(0, 10),
    unidadRegistro: unidad, rolRegistro: mia.rol,
  };
  if (uso === "ceder_largo") Object.assign(datos, { nombreCedido: txt(r.nombreCedido, 80), rutCedido: txt(r.rutCedido, 15), emailCedido: txt(r.emailCedido, 120), telefonoCedido: txt(r.telefonoCedido, 20), torreCedido: txt(r.torreCedido, 10), deptoCedido: txt(r.deptoCedido, 10), estadoPrestamo: "pendiente", fechaInicioP: txt(r.fechaInicioP, 10), fechaVencP: txt(r.fechaVencP, 10) });
  await fsSet(token, "parking_registros/" + spot, datos);
  const publico = { patentes: datos.patentes, vehiculos: veh.map(v => ({ patente: v.patente, marca: v.marca, color: v.color, esVisita: v.esVisita, nombreVisita: v.nombreVisita })), usoEstacionamiento: uso, estadoRegistro: "pendiente", nombre: nombreCorto(datos.nombre), tieneEmail: true, updatedAt: ahora };
  await fsSet(token, "parking_ocupacion/" + spot, publico);
  return { status: 200, body: { ok: true, publico } };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const origen = String(req.headers.origin || "");
  if (ORIGENES.includes(origen)) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    let body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const accion = String(body.accion || "");
    let email = String(body.email || "").trim().toLowerCase();
    let porCuenta = false;
    if (accion === "listar" && body.idToken) {
      if (!PROJECT_ID) throw new Error("Faltan variables FIREBASE_*");
      email = await verificarIdToken(body.idToken);
      if (!email) return res.status(401).json({ ok: false, error: "Tu sesión venció. Vuelve a iniciar sesión." });
      porCuenta = true;
    }
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
      // Para el registro de copropietarios cualquier correo puede verificarse (también quien se registra por primera vez).
      // Para "Mis solicitudes", solo correos con solicitudes o registro.
      const paraRegistro = body.para === "registro", paraParking = body.para === "parking";
      if (paraParking && !(await registrosDe(token, email)).length) {
        return res.status(404).json({ ok: false, error: "Ese correo no figura en el Registro de Copropietarios. Para registrar patentes, primero completa el registro de tu unidad." });
      }
      if (!paraRegistro && !paraParking && !(await tieneSolicitudes(token, email)) && !(await registrosDe(token, email)).length) {
        return res.status(404).json({ ok: false, error: "No encontramos solicitudes ingresadas con ese correo. Revisa que esté bien escrito." });
      }
      const codigo = String(nodeCrypto.randomInt(0, 1000000)).padStart(6, "0");
      await guardar(token, docId, { h: firma(email, codigo), exp: ahora + VIGENCIA_MS, n: 0, t: ahora });
      const mail = await fetch(`${SITE_URL}/api/send-email`, {
        method: "POST",
        headers: { "x-clave-interna": CLAVE_INTERNA, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: (paraParking ? "[Edificio 12 Norte] Código para Parking: " : paraRegistro ? "[Edificio 12 Norte] Código para el Registro de Copropietarios: " : "[CondoAdmin] Tu código de acceso: ") + codigo,
          body: (paraParking ? "Tu código para registrar tu estacionamiento en Parking del Edificio 12 Norte es:" : paraRegistro ? "Tu código para ingresar al Registro de Copropietarios del Edificio 12 Norte es:" : "Tu código para ver tus solicitudes en CondoAdmin es:") + "\n\n    " + codigo + "\n\nVale por 10 minutos. Si no lo pediste, ignora este correo.\n\n— Comunidad Edificio 12 Norte",
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

    // Registro de copropietarios: ¿este correo ya tiene una unidad registrada? (devuelve su enlace personal)
    // Consulta del código de Google del registro: ¿esta sesión de correo es válida? (no entrega datos)
    if (accion === "sesion_ok") {
      return res.status(200).json({ ok: sesionValida(email, body.sesion) });
    }
    if (accion === "registro") {
      if (!sesionValida(email, body.sesion)) return res.status(401).json({ ok: false, error: "Tu acceso venció. Pide un código nuevo." });
      return res.status(200).json({ ok: true, registros: await registrosDe(token, email) });
    }

    if (accion === "parking_guardar") {
      if (!sesionValida(email, body.sesion)) return res.status(401).json({ ok: false, error: "Tu acceso venció. Pide un código nuevo." });
      const r = await guardarParking(token, email, body);
      return res.status(r.status).json(r.body);
    }

    if (accion === "listar") {
      if (!porCuenta && !sesionValida(email, body.sesion)) return res.status(401).json({ ok: false, error: "Tu acceso venció. Confirma tu correo de nuevo." });
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
