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
// api/plan-emergencia.js
// Página PÚBLICA del plan de emergencia para residentes (Ley 21.442, art. 40).
// Muestra solo la información general que la administración publica en
// CondoAdmin → Plan de emergencia (documento emergencia/plan). Nunca muestra
// brigadistas, simulacros ni datos de residentes.
// ---------------------------------------------------------------------------

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parrafos = s => esc(s).split(/\n+/).filter(Boolean).map(l => `<p>${l}</p>`).join("");
const fmtFecha = d => { try { return new Date(d).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }); } catch { return ""; } };

function pagina(cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plan de Emergencia · Edificio 12 Norte</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;color:#0f172a;line-height:1.55}
header{background:#1e3a5f;color:#fff;padding:20px 16px;text-align:center}
header h1{margin:0;font-size:20px}header p{margin:4px 0 0;font-size:13px;opacity:.9}
main{max-width:760px;margin:0 auto;padding:14px}
section{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin-bottom:12px}
h2{font-size:15px;margin:0 0 8px}p{margin:0 0 6px;font-size:14px}
.tel{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:15px}
.tel:last-child{border-bottom:0}.tel a{background:#dc2626;color:#fff;text-decoration:none;font-weight:700;padding:6px 14px;border-radius:99px}
.urg{background:#fef2f2;border-color:#fca5a5}
img{max-width:100%;border-radius:8px;border:1px solid #e2e8f0}
.meta{font-size:12px;color:#64748b;text-align:center;margin:8px 0 24px}
</style></head><body>
<header><h1>🆘 Plan de Emergencia</h1><p>Comunidad Edificio 12 Norte de Viña del Mar</p></header>
<main>${cuerpo}</main></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) throw new Error("Faltan variables FIREBASE_*");
    const token = await getAccessToken();
    const p = await fsGetDoc(token, "emergencia/plan");
    if (!p) {
      return res.status(200).send(pagina(`<section class="urg"><h2>📞 En una emergencia</h2>
<div class="tel">Bomberos <a href="tel:132">132</a></div><div class="tel">Carabineros <a href="tel:133">133</a></div><div class="tel">Ambulancia (SAMU) <a href="tel:131">131</a></div></section>
<p class="meta">La administración aún no publica el plan completo del edificio.</p>`));
    }
    const tels = (Array.isArray(p.telefonos) ? p.telefonos : []).filter(t => t && (t.nombre || t.numero));
    const sec = (t, v) => v ? `<section><h2>${t}</h2>${parrafos(v)}</section>` : "";
    const plano = typeof p.planoUrl === "string" && /^data:image\/(png|jpe?g|webp);base64,/i.test(p.planoUrl)
      ? `<section><h2>🗺️ Plano de evacuación</h2><a href="${p.planoUrl}" target="_blank" rel="noopener"><img src="${p.planoUrl}" alt="Plano de evacuación"></a></section>` : "";
    const cuerpo =
      (tels.length ? `<section class="urg"><h2>📞 Teléfonos de emergencia</h2>${tels.map(t => `<div class="tel">${esc(t.nombre)} ${t.numero ? `<a href="tel:${esc(String(t.numero).replace(/[^\d+]/g, ""))}">${esc(t.numero)}</a>` : ""}</div>`).join("")}</section>` : "") +
      sec("📍 Punto de encuentro", p.puntoEncuentro) +
      sec("🚪 Vías de evacuación", p.viasEvacuacion) +
      sec("🛡️ Zonas seguras", p.zonasSeguras) +
      sec("🌎 En caso de sismo", p.sismo) +
      sec("🔥 En caso de incendio", p.incendio) +
      sec("ℹ️ Otras indicaciones", p.otros) +
      plano +
      `<p class="meta">${p.actualizado ? "Actualizado el " + esc(fmtFecha(p.actualizado)) : ""}${p.revisadoPor ? " · Revisado por " + esc(p.revisadoPor) : ""}<br>Si alguien de tu departamento necesita ayuda para evacuar, indícalo en el Registro de Copropietarios.</p>`;
    return res.status(200).send(pagina(cuerpo));
  } catch (err) {
    console.error(err);
    return res.status(500).send(pagina(`<section class="urg"><h2>📞 En una emergencia</h2><div class="tel">Bomberos <a href="tel:132">132</a></div><div class="tel">Carabineros <a href="tel:133">133</a></div><div class="tel">Ambulancia (SAMU) <a href="tel:131">131</a></div></section><p class="meta">No se pudo cargar el plan del edificio en este momento.</p>`));
  }
}
