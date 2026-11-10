import nodeCrypto from "node:crypto";

const SITE_URL = "https://condoadmin-rouge.vercel.app";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
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
// api/crear-solicitud.js
// Registra la incidencia de un residente que entra SIN iniciar sesión.
// La app no puede escribir directo en la base sin sesión (las reglas de Firebase
// lo impiden), así que la guarda el servidor con la cuenta de servicio.
// El código SOL-xxx lo genera el servidor, para que nunca se repita.
//   POST {solicitud:{...}} -> {ok:true, code:"SOL-045"}
//   POST {avisar:"SOL-045"} -> avisa a los administradores de una solicitud que la
//        app ya guardó (personal o residente con sesión). Solo envía si la
//        solicitud existe en la base y una sola vez por solicitud.
// Usa las variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
// ---------------------------------------------------------------------------

const MAX_DOC = 950000; // Firestore admite hasta ~1 MB por documento

// Valor JS -> formato Firestore REST
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

const txt = (v, max) => String(v == null ? "" : v).slice(0, max);
const PRIORIDADES = ["Emergencia", "Alta", "Media", "Baja"];

async function siguienteNumero(token) {
  let max = 0, pageToken = "";
  do {
    const url = `${FS()}/solicitudes?pageSize=300&mask.fieldPaths=code` + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) throw new Error("Firestore listar: " + res.status + " " + (await res.text()));
    const json = await res.json();
    for (const d of json.documents || []) {
      const id = d.name.split("/").pop();
      for (const c of [id, d.fields && d.fields.code && d.fields.code.stringValue]) {
        const m = /^SOL-?(\d+)$/i.exec(String(c || ""));
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
    }
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return max + 1;
}

// Avisa por correo a los administradores (el residente sin sesión no puede leer la lista de usuarios)
async function avisarAdmins(token, code, d) {
  const res = await fetch(`${FS()}/usuarios?pageSize=300`, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) throw new Error("Firestore usuarios: " + res.status);
  const us = ((await res.json()).documents || []).map(x => aplanar(fsObj(x.fields)));
  const admins = [...new Set(us.filter(u => u.active !== false && ["Administrador", "Administrador Edificio"].includes(u.rol) && String(u.email || "").includes("@")).map(u => u.email.trim().toLowerCase()))];
  const cuerpo = "Nueva solicitud recibida:\n\nCódigo: " + code + "\nSolicitante: " + d.requesterName + "\nUbicación: " + d.tower + " / " + d.unit + "\nCategoría: " + (d.category || "") + (d.subcategory ? " / " + d.subcategory : "") + "\nPrioridad: " + d.priority + "\n\n" + d.description + "\n\nIngrese al sistema para gestionar.";
  await Promise.all(admins.map(to => fetch(`${SITE_URL}/api/send-email`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject: "[CondoAdmin] Nueva solicitud " + code + (d.priority === "Emergencia" ? " ⚠ EMERGENCIA" : ""), body: cuerpo }),
  }).catch(() => {})));
  return admins.length;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido" });
  try {
    let body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    // Aviso a administradores de una solicitud guardada por la app
    if (body.avisar) {
      const id = String(body.avisar);
      if (!/^[\w.-]{1,60}$/.test(id)) return res.status(400).json({ ok: false, error: "Código no válido" });
      if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("Faltan variables FIREBASE_*");
      const token = await getAccessToken();
      // La app guarda en segundo plano: se espera hasta ~6 s a que aparezca
      let d = null;
      for (let i = 0; i < 6 && !d; i++) {
        d = aplanar(await fsGetDoc(token, "solicitudes/" + encodeURIComponent(id)));
        if (!d) await new Promise(r => setTimeout(r, 1000));
      }
      if (!d) return res.status(404).json({ ok: false, error: "La solicitud no está guardada" });
      if (d.avisoAdmins) return res.status(200).json({ ok: true, yaAvisado: true });
      const n = await avisarAdmins(token, d.code || id, d);
      await fetch(`${FS()}/solicitudes/${encodeURIComponent(id)}?updateMask.fieldPaths=avisoAdmins`, {
        method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { avisoAdmins: { stringValue: new Date().toISOString() } } }),
      });
      return res.status(200).json({ ok: true, enviados: n });
    }

    const s = body.solicitud || {};

    const email = txt(s.requesterEmail, 120).trim().toLowerCase();
    const nombre = txt(s.requesterName, 100).trim();
    const desc = txt(s.description, 3000).trim();
    if (!nombre || !/^\S+@\S+\.\S+$/.test(email) || desc.length < 10 || !txt(s.unit, 80).trim()) {
      return res.status(400).json({ ok: false, error: "Faltan datos de la solicitud." });
    }
    if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("Faltan variables FIREBASE_*");

    const now = new Date().toISOString();
    const prioridad = PRIORIDADES.includes(s.priority) ? s.priority : "Media";
    let fotos = (Array.isArray(s.attachmentsInitial) ? s.attachmentsInitial : []).slice(0, 6).map(a => ({
      id: txt(a.id, 40), type: "inicial", name: txt(a.name, 120), date: now, user: nombre,
      preview: typeof a.preview === "string" ? a.preview : "", comment: "",
    }));

    const token = await getAccessToken();
    let n = await siguienteNumero(token);

    for (let intento = 0; intento < 6; intento++, n++) {
      const code = "SOL-" + String(n).padStart(3, "0");
      const doc = {
        id: code, code, createdAt: now,
        requesterName: nombre, requesterEmail: email, requesterPhone: txt(s.requesterPhone, 40).trim(),
        tower: txt(s.tower, 60), unit: txt(s.unit, 80).trim(),
        category: txt(s.category, 80), subcategory: txt(s.subcategory, 80),
        description: desc, priority: prioridad, isUrgent: prioridad === "Emergencia",
        prioAuto: s.prioAuto === true, avisoAdmins: now,
        accessPermission: s.accessPermission === true, confirm: true,
        affectedTowers: s.affectedTowers == null ? null : txt(s.affectedTowers, 200),
        status: "Ingresada", assignedTo: "Sin asignar", dueDate: null,
        comments: [],
        history: [{ date: now, user: nombre, action: "Solicitud creada", from: null, to: "Ingresada", note: txt(s.historyNote, 300) }],
        attachmentsInitial: fotos.map(f => ({ ...f, requestId: code })),
      };
      // Si las fotos no caben en el documento, se quitan desde la última hasta que quepa (queda su nombre)
      for (let i = doc.attachmentsInitial.length - 1; i >= 0 && JSON.stringify(doc).length > MAX_DOC; i--) {
        if (doc.attachmentsInitial[i].preview.startsWith("data:")) doc.attachmentsInitial[i].preview = "";
      }
      const fields = toFs(doc).mapValue.fields;
      const r = await fetch(`${FS()}/solicitudes/${code}?currentDocument.exists=false`, {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (r.ok) {
        await avisarAdmins(token, code, doc).catch(e => console.warn("aviso admins", e));
        return res.status(200).json({ ok: true, code });
      }
      // 400/409 FAILED_PRECONDITION: ese código ya existe (otra persona lo tomó recién) -> probar el siguiente
      const t = await r.text();
      if (!(r.status === 409 || r.status === 400) || !/exist|precondition/i.test(t)) throw new Error("Firestore crear: " + r.status + " " + t);
    }
    throw new Error("No se encontró un código libre");
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "No se pudo registrar la solicitud. Intenta de nuevo en unos minutos." });
  }
}
