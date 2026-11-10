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
// api/evaluar.js
// El residente llega aquí desde el correo de cierre ("¿Quedó resuelto? Sí / No").
//   GET  /api/evaluar?id=SOL-012&t=<token>&r=si|no  -> muestra página de confirmación
//   POST (botón de la página)                        -> guarda la respuesta en la solicitud
// La respuesta se guarda solo al presionar el botón, porque algunos correos
// abren los enlaces automáticamente para revisarlos.
// Usa las mismas variables de Vercel que el cron: FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
// ---------------------------------------------------------------------------

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function pagina(titulo, cuerpoHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · CondoAdmin</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f1f5f9;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.c{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px 24px;max-width:420px;width:100%;text-align:center}
h1{font-size:19px;margin:0 0 8px}p{font-size:14px;color:#475569;line-height:1.5;margin:0 0 14px}
.b{display:block;width:100%;padding:14px;border-radius:10px;border:2px solid #e2e8f0;background:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:10px;color:#1e293b}
.si{border-color:#10b981;background:#f0fdf4;color:#15803d}.no{border-color:#f97316;background:#fff7ed;color:#c2410c}
.m{font-size:12px;color:#94a3b8;margin-top:16px}.i{font-size:44px;margin-bottom:8px}
</style></head><body><div class="c">${cuerpoHtml}<div class="m">CondoAdmin</div></div></body></html>`;
}
const enviar = (res, status, titulo, cuerpo) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).send(pagina(titulo, cuerpo));
};

export default async function handler(req, res) {
  try {
    let body = req.body || {};
    if (typeof body === "string") body = Object.fromEntries(new URLSearchParams(body));
    const q = { ...(req.query || {}), ...(req.method === "POST" ? body : {}) };
    const id = String(q.id || ""), t = String(q.t || ""), r = String(q.r || "");

    if (!/^[\w.-]{1,60}$/.test(id) || !t || t.length > 100) {
      return enviar(res, 400, "Enlace no válido", `<div class="i">⚠️</div><h1>Enlace no válido</h1><p>Abre el enlace directamente desde el correo que recibiste.</p>`);
    }
    if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("Faltan variables FIREBASE_*");

    const token = await getAccessToken();
    const sol = aplanar(await fsGetDoc(token, "solicitudes/" + encodeURIComponent(id)));
    if (!sol || !sol.evalToken || sol.evalToken !== t) {
      return enviar(res, 404, "Enlace vencido", `<div class="i">⚠️</div><h1>Este enlace ya no es válido</h1><p>Puede que la solicitud haya sido reabierta o cerrada nuevamente. Usa el correo más reciente.</p>`);
    }
    const cod = esc(sol.code || id);
    if (sol.status !== "Cerrada") {
      return enviar(res, 200, "Solicitud reabierta", `<div class="i">🔧</div><h1>La solicitud ${cod} está nuevamente en proceso</h1><p>Te avisaremos cuando se cierre.</p>`);
    }
    const ev = sol.evaluacion;
    if (ev && typeof ev.resuelto === "boolean" && (!ev.token || ev.token === sol.evalToken)) {
      return enviar(res, 200, "Respuesta registrada", `<div class="i">${ev.resuelto ? "👍" : "📝"}</div><h1>Ya registramos tu respuesta</h1><p>Indicaste que la solicitud ${cod} <strong>${ev.resuelto ? "sí" : "no"}</strong> quedó resuelta. ¡Gracias!</p>`);
    }

    // POST con respuesta: guardar
    if (req.method === "POST" && (r === "si" || r === "no")) {
      const resuelto = r === "si";
      const url = `${FS()}/solicitudes/${encodeURIComponent(id)}?updateMask.fieldPaths=evaluacion`;
      const save = await fetch(url, {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { evaluacion: { mapValue: { fields: {
          resuelto: { booleanValue: resuelto },
          date: { stringValue: new Date().toISOString() },
          via: { stringValue: "correo" },
          token: { stringValue: sol.evalToken },
        } } } } }),
      });
      if (!save.ok) throw new Error("Firestore PATCH: " + save.status + " " + (await save.text()));
      return enviar(res, 200, "¡Gracias!", resuelto
        ? `<div class="i">👍</div><h1>¡Gracias por confirmar!</h1><p>Registramos que la solicitud ${cod} quedó resuelta.</p>`
        : `<div class="i">📝</div><h1>Gracias por avisarnos</h1><p>Registramos que la solicitud ${cod} <strong>no</strong> quedó resuelta. La administración la revisará nuevamente.</p>`);
    }

    // GET: página de confirmación con los dos botones
    const hid = `<input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="t" value="${esc(t)}">`;
    return enviar(res, 200, "¿Quedó resuelto?", `<h1>Solicitud ${cod}</h1>
<p>${sol.category ? esc(sol.category) + "<br>" : ""}${sol.closeNote ? "<em>“" + esc(sol.closeNote) + "”</em>" : ""}</p>
<p><strong>¿Quedó resuelto el problema?</strong></p>
<form method="POST" action="/api/evaluar">${hid}
<button class="b si" name="r" value="si">👍 Sí, quedó resuelto</button>
<button class="b no" name="r" value="no">👎 No quedó resuelto</button>
</form>`);
  } catch (err) {
    console.error(err);
    return enviar(res, 500, "Error", `<div class="i">⚠️</div><h1>No pudimos registrar tu respuesta</h1><p>Intenta nuevamente en unos minutos.</p>`);
  }
}
