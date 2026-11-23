// Parking: panel de administración (portado desde parkadmin). Mismos datos: colecciones parking_* de Firestore.
import { useState, useEffect, useRef, useCallback } from "react";

// ── FIREBASE (Firestore + Auth vía REST) ──
// Base única del edificio: proyecto "condoadmin-1eddc" de la cuenta com12norte@gmail.com.
// Las colecciones de Parking llevan el prefijo "parking_" (ver COL más abajo).
const FB_API_KEY = "AIzaSyBTVvEx7h2kt3NWXJpeSKn4hksU1nSzilE";
const FB_PROJECT = "condoadmin-1eddc";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
// Nombre real de cada colección de Parking dentro de la base única
const COL = (c) => `parking_${c}`;

// ── Sesión de administración ──
// Administradores principales: fijos, no se pueden quitar desde la app.
// Los demás se guardan en la colección "admins" (id = correo) y se agregan desde la pestaña Administradores.
const ADMIN_EMAILS = ["paco.g.u@gmail.com", "com12norte@gmail.com"];
let fbSession = null; // {idToken, refreshToken, exp, email, admin}
const esAdmin = () => !!fbSession && fbSession.admin === true;
const cerrarSesion = () => { fbSession = null; };
// Dentro de CondoAdmin el token lo entrega la sesión de CondoAdmin (se renueva sola)
let proveedorToken = null;
export const conectarCondoAdmin = (fn, email) => { proveedorToken = fn; fbSession = { idToken: "", refreshToken: "", exp: 0, email: String(email || "").trim().toLowerCase(), admin: true }; };
const getIdToken = async () => {
  if (proveedorToken) { try { return await proveedorToken(); } catch (e) { return null; } }
  if (!fbSession) return null;
  if (Date.now() < fbSession.exp - 60000) return fbSession.idToken;
  try {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FB_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(fbSession.refreshToken)}`,
    });
    const j = await r.json();
    if (!j.id_token) { fbSession = null; return null; }
    fbSession = { ...fbSession, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + Number(j.expires_in) * 1000 };
    return fbSession.idToken;
  } catch (e) { return fbSession?.idToken || null; }
};
const fsHeaders = async (extra = {}) => { const t = await getIdToken(); return { ...extra, ...(t ? { Authorization: `Bearer ${t}` } : {}) }; };

// ── Cuentas (Firebase Authentication) ──
const authCall = async (metodo, body) => {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${metodo}?key=${FB_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
};
// Envía el correo de Firebase para crear o restablecer la contraseña
const enviarRecuperacion = async (email) => {
  const j = await authCall("sendOobCode", { requestType: "PASSWORD_RESET", email: String(email).trim() });
  if (j.error) throw new Error(j.error.message || "error");
  return true;
};
const passwordAleatoria = () => {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return Array.from(a, x => x.toString(36).padStart(2, "0")).join("") + "Aa1!";
};

// Huella del correo (SHA-256). Permite verificar al residente sin dejar su correo a la vista.
const hashEmail = async (e) => {
  const t = String(e || "").trim().toLowerCase();
  if (!t) return "";
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
};
// Nombre abreviado para mostrar al público: "Mariana D."
const nombreCorto = (n) => {
  const p = String(n || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  return p.length > 1 ? `${p[0]} ${p[1][0].toUpperCase()}.` : p[0];
};
// Versión pública de un registro: sin correo, teléfono, RUT ni datos del propietario
const proyeccionPublica = (rec) => ({
  patentes: rec.patentes || [],
  vehiculos: (rec.vehiculos || []).map(v => ({ patente: v.patente || "", marca: v.marca || "", color: v.color || "", esVisita: v.esVisita || "no", nombreVisita: v.nombreVisita || "" })),
  usoEstacionamiento: rec.usoEstacionamiento || "",
  estadoRegistro: rec.estadoRegistro || "pendiente",
  nombre: nombreCorto(rec.nombre),
  tieneEmail: !!String(rec.email || "").trim(),
  updatedAt: rec.updatedAt || "",
});

// Conversión entre objetos JS y el formato tipado de Firestore
const toFs = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k, x]) => [k, toFs(x)])) } };
  return { stringValue: String(v) };
};
const fromFs = (v) => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFs);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("referenceValue" in v) return v.referenceValue;
  return null;
};
const docToObj = (d) => ({ _id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, fromFs(x)])) });
const fsCheck = async (res) => { if (!res.ok) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0,200)}`); return res; };

// Lista una colección completa (pagina de a 300)
const fsList = async (col) => {
  const out = []; let token = "";
  do {
    const res = await fsCheck(await fetch(`${FS_BASE}/${COL(col)}?pageSize=300&key=${FB_API_KEY}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, { headers: await fsHeaders() }));
    const j = await res.json();
    (j.documents || []).forEach(d => out.push(docToObj(d)));
    token = j.nextPageToken || "";
  } while (token);
  return out;
};
// Crea o reemplaza un documento completo
const fsSet = async (col, id, obj) => {
  const { _id, ...data } = obj;
  await fsCheck(await fetch(`${FS_BASE}/${COL(col)}/${encodeURIComponent(id)}?key=${FB_API_KEY}`, {
    method: "PATCH", headers: await fsHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ fields: toFs(data).mapValue.fields }),
  }));
};
// Actualiza solo los campos indicados
const fsUpdate = async (col, id, patch) => {
  const mask = Object.keys(patch).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  await fsCheck(await fetch(`${FS_BASE}/${COL(col)}/${encodeURIComponent(id)}?${mask}&key=${FB_API_KEY}`, {
    method: "PATCH", headers: await fsHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ fields: toFs(patch).mapValue.fields }),
  }));
};
// Agrega un documento con id automático
const fsAdd = async (col, obj) => {
  await fsCheck(await fetch(`${FS_BASE}/${COL(col)}?key=${FB_API_KEY}`, {
    method: "POST", headers: await fsHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ fields: toFs(obj).mapValue.fields }),
  }));
};
const fsDelete = async (col, id) => {
  await fsCheck(await fetch(`${FS_BASE}/${COL(col)}/${encodeURIComponent(id)}?key=${FB_API_KEY}`, { method: "DELETE", headers: await fsHeaders() }));
};
// Consulta por igualdad de un campo
const fsWhere = async (col, field, value) => {
  const res = await fsCheck(await fetch(`${FS_BASE}:runQuery?key=${FB_API_KEY}`, {
    method: "POST", headers: await fsHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: COL(col) }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toFs(value) } } } }),
  }));
  const j = await res.json();
  return (Array.isArray(j) ? j : []).filter(r => r.document).map(r => docToObj(r.document));
};

// Público: solo la versión sin datos personales
const loadOcupacion = async () => {
  try { const data = await fsList("ocupacion"); const r = {}; data.forEach(x => { const { _id, ...rest } = x; r[Number(_id)] = rest; }); return r; }
  catch(e){ console.error("loadOcupacion:", e); return {}; }
};
// Administración: registros completos (requiere sesión)
const loadRegistros = async () => {
  try { const data = await fsList("registros"); const r = {}; data.forEach(x => { const id = Number(x._id); const { _id, ...rest } = x; r[id] = rest; }); return r; }
  catch(e){ console.error("loadRegistros:", e); return {}; }
};
// Al ingresar la administración: completa la huella de correo que falte y
// regenera la versión pública de cada registro.
const sincronizarPublico = async (regs) => {
  for (const [id, rec] of Object.entries(regs)) {
    try {
      if (rec.emailHash === undefined) { const h = await hashEmail(rec.email); await fsUpdate("registros", id, { emailHash: h }); rec.emailHash = h; }
      await fsSet("ocupacion", id, proyeccionPublica(rec));
    } catch (e) { console.error("sincronizarPublico", id, e); }
  }
};
const upsertRegistro = async (id,record) => {
  try {
    const { emailHash: _h, ...rec } = record;
    const datos = { ...rec, emailHash: await hashEmail(rec.email), updatedAt: rec.updatedAt || new Date().toISOString() };
    // Un cambio hecho por el residente siempre vuelve a quedar pendiente de visado
    if (!esAdmin()) {
      datos.estadoRegistro = "pendiente";
      if (datos.usoEstacionamiento === "ceder_largo") datos.estadoPrestamo = "pendiente"; else delete datos.estadoPrestamo;
      delete datos.fechaVisado; delete datos.aprobadoAt; delete datos.rechazadoAt; delete datos.motivoRechazo;
    }
    await fsSet("registros", String(id), datos);
    await fsSet("ocupacion", String(id), proyeccionPublica(datos));
    return true;
  }
  catch(e){ console.error("upsertRegistro:", e); return false; }
};
const deleteRegistro = async (id) => {
  try { await fsDelete("registros", String(id)); await fsDelete("ocupacion", String(id)); }
  catch(e){ console.error("deleteRegistro:", e); }
};
// El residente demuestra que es el dueño del registro con su correo:
// las reglas solo aceptan esta escritura si la huella coincide con la guardada.
// ── Administradores ──
const normEmail = (e) => String(e || "").trim().toLowerCase();
const loadAdmins = async () => {
  try { return (await fsList("admins")).map(({ _id, ...a }) => ({ email: _id, ...a })); }
  catch (e) { console.error("loadAdmins:", e); return []; }
};
// Una sola lista de personal: los administradores de CondoAdmin (Configuración → Usuarios,
// rol Administrador o Administrador Edificio, activos) también administran Parking.
const esAdminCondo = async (e) => {
  try {
    const r = await fetch(`${FS_BASE}/roles/${encodeURIComponent(e)}?key=${FB_API_KEY}`, { headers: await fsHeaders() });
    if (!r.ok) return false;
    const d = docToObj(await r.json());
    return d.active === true && ["Administrador", "Administrador Edificio"].includes(d.rol);
  } catch (x) { return false; }
};
const verificarAdmin = async (email) => {
  const e = normEmail(email);
  if (ADMIN_EMAILS.includes(e)) return true;
  if (await esAdminCondo(e)) return true;
  try {
    const r = await fetch(`${FS_BASE}/${COL("admins")}/${encodeURIComponent(e)}?key=${FB_API_KEY}`, { headers: await fsHeaders() });
    return r.ok;
  } catch (x) { return false; }
};
// Crea la cuenta (si no existe) con una clave aleatoria que nadie conoce,
// la registra como administrador y envía el correo para que defina su contraseña.
const agregarAdmin = async (email, nombre) => {
  const e = normEmail(email);
  const alta = await authCall("signUp", { email: e, password: passwordAleatoria(), returnSecureToken: false });
  if (alta.error && alta.error.message !== "EMAIL_EXISTS") throw new Error(alta.error.message);
  await fsSet("admins", e, { nombre: String(nombre || "").trim(), agregadoPor: fbSession?.email || "", agregadoAt: new Date() });
  await enviarRecuperacion(e);
};
const quitarAdmin = async (email) => { await fsDelete("admins", normEmail(email)); };

const verificarCorreo = async (id, email) => {
  try { await fsSet("verificaciones", String(id), { emailHash: await hashEmail(email), at: new Date() }); return true; }
  catch(e){ return false; }
};

// ── EMAILJS ──
const GAS_URL = "https://script.google.com/macros/s/AKfycbxKiKdwZf-4S8A19f9NKpUVJiFnn9ZpZ1u5mDfpWzZtbp-F570M3Ui3Oa3Wzir7tDdCPQ/exec";

const EMAILJS_SERVICE = "service_vxhdrlx";
const EMAILJS_TEMPLATE = "template_dgshb8a";
const EMAILJS_KEY = "wKxD2rJHuftU7W-WE";

const sendEmail = async (params) => {
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE,
        template_id: EMAILJS_TEMPLATE,
        user_id: EMAILJS_KEY,
        template_params: params,
      }),
    });
  } catch(e) { console.error("Email error:",e); }
};

// Convierte File a base64 (data URL)
const fileToBase64=(file)=>new Promise((res,rej)=>{
  const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);
});

// Reduce la foto de la cédula (máx. 1400 px, JPEG) para que el envío sea liviano.
// Si el navegador no puede procesarla, se envía el archivo original.
const prepararAdjunto=async(file,etiqueta="")=>{
  const original=await fileToBase64(file);
  if(!file.type||!file.type.startsWith("image/"))return{nombre:file.name,tipo:file.type||"application/pdf",datos:original,etiqueta};
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=original;});
    const max=1400,esc=Math.min(1,max/Math.max(img.width,img.height));
    const c=document.createElement("canvas");
    c.width=Math.round(img.width*esc);c.height=Math.round(img.height*esc);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    const datos=c.toDataURL("image/jpeg",0.75);
    if(!datos.startsWith("data:image/jpeg"))throw new Error("sin jpeg");
    return{nombre:file.name.replace(/\.[^.]+$/,"")+".jpg",tipo:"image/jpeg",datos,etiqueta};
  }catch(e){return{nombre:file.name,tipo:file.type,datos:original,etiqueta};}
};

// Envío del comprobante con la cédula adjunta. Una sola llamada: el servidor (GAS)
// envía el correo al residente y el aviso de visado a la administración.
// Se usa POST "text/plain" + no-cors porque es lo que Apps Script acepta desde el navegador.
const sendComprobante = async ({datos={}, archivos=[]}) => {
  try {
    const adjuntos=[];
    // archivos: File o {file, etiqueta}
    for(const a of archivos){
      if(!a)continue;
      const f=a instanceof File?a:a.file, et=a instanceof File?"":(a.etiqueta||"");
      if(f) adjuntos.push(await prepararAdjunto(f,et));
    }
    await fetch(GAS_URL,{
      method:"POST",mode:"no-cors",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({tipo:"comprobante",...datos,adjuntos}),
    });
    return true;
  } catch(e){ console.error("Comprobante error:",e); return false; }
};

// Registro de Copropietarios = padrón maestro. El residente entra con un código a su correo,
// y solo puede registrar patentes de las unidades donde su correo figura en ese registro.
const API_CODIGO = "https://condoadmin-rouge.vercel.app/api/residente-codigo";
const apiCodigo = async (body) => {
  const r = await fetch(API_CODIGO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { ok: r.ok && j.ok === true, ...j };
};

// Consulta al servidor si la unidad está en el padrón de copropietarios.
// El padrón (nombres, RUT, correos) nunca se descarga al navegador.
const consultarPadron = async (torre, depto) => {
  const p=new URLSearchParams({tipo:"verificar_padron",torre,depto});
  const res=await fetch(GAS_URL+"?"+p.toString());
  const j=await res.json();
  if(!j||j.ok!==true)throw new Error("respuesta inválida");
  return {enPadron:!!j.enPadron,documentosOk:j.documentosOk!==false,faltan:Array.isArray(j.faltan)?j.faltan:[],
    siArrienda:Array.isArray(j.siArrienda)?j.siArrienda:[],sinFicha:!!j.sinFicha};
};
const SPOTS_DATA = [
  {id:59,torre:"1060",depto:"A1",sector:1,gx:1,gy:0},{id:39,torre:"1036",depto:"A1",sector:1,gx:1,gy:1},
  {id:41,torre:"1080",depto:"A1",sector:1,gx:1,gy:2},{id:46,torre:"1038",depto:"A1",sector:1,gx:1,gy:3},
  {id:62,torre:"1080",depto:"B2",sector:1,gx:2,gy:0},{id:51,torre:"1036",depto:"B2",sector:1,gx:2,gy:1},
  {id:60,torre:"1060",depto:"B2",sector:1,gx:2,gy:2},{id:47,torre:"1080",depto:"C3",sector:1,gx:3,gy:0},
  {id:49,torre:"1036",depto:"C3",sector:1,gx:3,gy:1},{id:53,torre:"1060",depto:"C3",sector:1,gx:3,gy:2},
  {id:48,torre:"1036",depto:"D4",sector:1,gx:4,gy:0},{id:58,torre:"1060",depto:"D4",sector:1,gx:4,gy:1},
  {id:43,torre:"1080",depto:"D4",sector:1,gx:4,gy:2},{id:64,torre:"1080",depto:"E5",sector:1,gx:5,gy:0},
  {id:45,torre:"1036",depto:"E5",sector:1,gx:5,gy:1},{id:56,torre:"1060",depto:"E5",sector:1,gx:5,gy:2},
  {id:50,torre:"1080",depto:"F6",sector:1,gx:6,gy:0},{id:54,torre:"1060",depto:"F6",sector:1,gx:6,gy:1},
  {id:63,torre:"1038",depto:"F6",sector:1,gx:6,gy:2},{id:40,torre:"1080",depto:"G7",sector:1,gx:7,gy:0},
  {id:57,torre:"1060",depto:"G7",sector:1,gx:7,gy:1},{id:42,torre:"1036",depto:"G7",sector:1,gx:7,gy:2},
  {id:55,torre:"1038",depto:"G7",sector:1,gx:7,gy:3},{id:61,torre:"1080",depto:"H8",sector:1,gx:8,gy:0},
  {id:52,torre:"1060",depto:"H8",sector:1,gx:8,gy:1},{id:44,torre:"1036",depto:"H8",sector:1,gx:8,gy:2},
  {id:33,torre:"1052",depto:"B2",sector:2,gx:2,gy:0},{id:38,torre:"1038",depto:"B2",sector:2,gx:2,gy:1},
  {id:27,torre:"1038",depto:"C3",sector:2,gx:3,gy:0},{id:28,torre:"1052",depto:"C3",sector:2,gx:3,gy:1},
  {id:37,torre:"1038",depto:"D4",sector:2,gx:4,gy:0},{id:29,torre:"1052",depto:"D4",sector:2,gx:4,gy:1},
  {id:36,torre:"1038",depto:"E5",sector:2,gx:5,gy:0},{id:32,torre:"1052",depto:"F6",sector:2,gx:6,gy:0},
  {id:31,torre:"1036",depto:"F6",sector:2,gx:6,gy:1},{id:35,torre:"1052",depto:"G7",sector:2,gx:7,gy:0},
  {id:30,torre:"1052",depto:"H8",sector:2,gx:8,gy:0},{id:34,torre:"1038",depto:"H8",sector:2,gx:8,gy:1},
  {id:1,torre:"1081",depto:"A1",sector:3,gx:1,gy:0},{id:12,torre:"1061",depto:"A1",sector:3,gx:1,gy:1},
  {id:21,torre:"1052",depto:"A1",sector:3,gx:1,gy:2},{id:6,torre:"1054",depto:"A1",sector:3,gx:1,gy:3},
  {id:8,torre:"1081",depto:"B2",sector:3,gx:2,gy:0},{id:13,torre:"1061",depto:"B2",sector:3,gx:2,gy:1},
  {id:5,torre:"1054",depto:"B2",sector:3,gx:2,gy:2},{id:3,torre:"1081",depto:"C3",sector:3,gx:3,gy:0},
  {id:14,torre:"1061",depto:"C3",sector:3,gx:3,gy:1},{id:23,torre:"1054",depto:"C3",sector:3,gx:3,gy:2},
  {id:9,torre:"1061",depto:"D4",sector:3,gx:4,gy:0},{id:11,torre:"1081",depto:"D4",sector:3,gx:4,gy:1},
  {id:18,torre:"1054",depto:"D4",sector:3,gx:4,gy:2},{id:2,torre:"1081",depto:"E5",sector:3,gx:5,gy:0},
  {id:4,torre:"1054",depto:"E5",sector:3,gx:5,gy:1},{id:16,torre:"1052",depto:"E5",sector:3,gx:5,gy:2},
  {id:10,torre:"1061",depto:"E6",sector:3,gx:6,gy:0},{id:15,torre:"1061",depto:"F5",sector:3,gx:6,gy:1},
  {id:7,torre:"1081",depto:"F6",sector:3,gx:7,gy:0},{id:19,torre:"1054",depto:"F6",sector:3,gx:7,gy:1},
  {id:17,torre:"1054",depto:"G7",sector:3,gx:8,gy:0},{id:20,torre:"1061",depto:"G7",sector:3,gx:8,gy:1},
  {id:25,torre:"1081",depto:"G7",sector:3,gx:8,gy:2},{id:22,torre:"1081",depto:"H8",sector:3,gx:9,gy:0},
  {id:24,torre:"1054",depto:"H8",sector:3,gx:9,gy:1},{id:26,torre:"1061",depto:"H8",sector:3,gx:9,gy:2},
];

const BY_TD = {};
SPOTS_DATA.forEach(s => { BY_TD[`${s.torre}-${s.depto}`] = s; });
const SECTOR_NAMES = {1:"3 Oriente / 12 Norte",2:"Patio Central",3:"4 Oriente / 12 Norte"};
const SC = {
  1:{bg:"#166534",border:"#22c55e",spotOcc:"#16a34a",accent:"#4ade80",text:"#bbf7d0"},
  2:{bg:"#581c87",border:"#a855f7",spotOcc:"#7c3aed",accent:"#c084fc",text:"#e9d5ff"},
  3:{bg:"#9a3412",border:"#f97316",spotOcc:"#c2410c",accent:"#fb923c",text:"#fed7aa"},
};
const TORRES_LABELS = {
  "1052": "12 Norte 1052",
  "1054": "12 Norte 1054",
  "1036": "12 Norte 1036",
  "1038": "12 Norte 1038",
  "1061": "4 Oriente 1061",
  "1081": "4 Oriente 1081",
  "1060": "3 Oriente 1060",
  "1080": "3 Oriente 1080",
};
const TORRES = ["1052","1054","1036","1038","1061","1081","1060","1080"];
const DEPTOS_ALL = ["A1","B2","C3","D4","E5","E6","F5","F6","G7","H8"];

const validarTelefono = (tel) => {
  if(!tel?.trim()) return null;
  const clean = tel.replace(/[\s\-\+\(\)]/g,'').replace(/^56/,'');
  if(!/^9\d{8}$/.test(clean)) return "Debe ser móvil chileno (ej: 9 1234 5678)";
  if(/^(\d)\1{8}$/.test(clean)) return "Ingresa un número real";
  if(["912345678","987654321","900000000"].includes(clean)) return "Ingresa un número real";
  return null;
};

function emptyForm() {
  return {
    torre:"",depto:"",tipoResidente:"",nombre:"",rut:"",email:"",telefono:"",
    carnetFrontal:null,carnetTrasero:null,
    usoEstacionamiento:"",nombreCedido:"",rutCedido:"",emailCedido:"",telefonoCedido:"",torreCedido:"",deptoCedido:"",docCedido:null,
    vehiculos:[{patente:"",marca:"",color:"",esVisita:"no",nombreVisita:"",telefonoVisita:""}]
  };
}

// ── SECTOR MAP ──
const SPOT_INFO = {};
SPOTS_DATA.forEach(s => { SPOT_INFO[s.id] = s; });
const SW=90,SH=40,G=4,RD=28,DW=88,PAD=6,NBH=SH*2+G;

const SectorMap = ({sectorId,records,onSpotClick,highlightId}) => {
  const sec=sectorId;
  const scm={1:{occ:'#14532d',acc:'#22c55e'},2:{occ:'#4c1d95',acc:'#a855f7'},3:{occ:'#7c2d12',acc:'#f97316'}};

  const spotEl=(id,x,y,w=SW,h=SH)=>{
    const rec=records[id];
    const occ=!!rec,hl=id===highlightId;
    // Color por uso
    const usoColor={
      uso_exclusivo:'#14532d',
      visitas:'#1e3a5f',
      ceder_largo:'#4c1d95',
      sin_uso:'#292524',
    };
    const usoAccent={
      uso_exclusivo:'#22c55e',
      visitas:'#3b82f6',
      ceder_largo:'#a855f7',
      sin_uso:'#78716c',
    };
    const uso=rec?.usoEstacionamiento||'uso_exclusivo';
    const fill=hl?'#facc15':occ?(usoColor[uso]||'#14532d'):'#ffffff';
    const stk=hl?'#ca8a04':occ?(usoAccent[uso]||'#22c55e'):'#cbd5e1';
    const nc=hl?'#0f172a':occ?'#fff':'#94a3b8';
    const sc2=hl?'#1e3a5f':occ?'rgba(255,255,255,.75)':'#94a3b8';
    const inf=SPOT_INFO[id];
    const halo=hl?`<rect x="${x-3}" y="${y-3}" width="${w+6}" height="${h+6}" rx="7" fill="none" stroke="#facc15" stroke-width="2" opacity=".5"/>`:'';
    const pat=occ&&rec?.patentes?.[0]?`<text x="${x+w/2}" y="${y-6}" text-anchor="middle" font-size="6" font-family="monospace" font-weight="700" fill="${usoAccent[uso]||'#22c55e'}">${rec.patentes[0]}</text>`:'';
    return `${pat}<g style="cursor:pointer" data-id="${id}">
      <rect x="${x+1}" y="${y+2}" width="${w}" height="${h}" rx="4" fill="rgba(15,23,42,.06)"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stk}" stroke-width="${hl?2.5:occ?1.5:1}"/>
      <text x="${x+w/2}" y="${y+h*.42}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="900" font-family="monospace" fill="${nc}">#${id}</text>
      ${inf?`<text x="${x+w/2}" y="${y+h*.78}" text-anchor="middle" dominant-baseline="middle" font-size="6.5" font-family="monospace" fill="${sc2}">${inf.torre} ${inf.depto}</text>`:''}
      ${halo}</g>`;
  };
  const doorEl=(x,y,w,h,lines)=>{
    const mid=h/(lines.length+1);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#1d4ed8" stroke="#3b82f6" stroke-width="1"/>
      ${lines.map((l,i)=>`<text x="${x+w/2}" y="${y+mid*(i+1)}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-family="monospace" font-weight="700" fill="#bfdbfe">${l}</text>`).join('')}`;
  };
  const emergEl=(x,y,w,h,lines)=>{
    const mid=h/(lines.length+1);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#854d0e" stroke="#fbbf24" stroke-width="1.5"/>
      ${lines.map((l,i)=>`<text x="${x+w/2}" y="${y+mid*(i+1)}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-family="monospace" font-weight="700" fill="#fef08a">${l}</text>`).join('')}`;
  };
  const nbEl=(x,y,w,h)=>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#450a0a" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,2"/>
     <text x="${x+w/2}" y="${y+h*.28}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-family="monospace" font-weight="700" fill="#fca5a5">Zona con</text>
     <text x="${x+w/2}" y="${y+h*.50}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-family="monospace" font-weight="700" fill="#fca5a5">prohibición de</text>
     <text x="${x+w/2}" y="${y+h*.72}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-family="monospace" font-weight="700" fill="#fca5a5">bloquear</text>`;
  const roadEl=(W,H,lt,rt)=>
    `<rect x="0" y="0" width="${W}" height="${RD}" fill="#1e3358"/>
     <rect x="0" y="${H-RD}" width="${W}" height="${RD}" fill="#1e3358"/>
     <line x1="0" y1="${RD/2}" x2="${W}" y2="${RD/2}" stroke="#facc15" stroke-width="1.5" stroke-dasharray="10,5" opacity=".7"/>
     <line x1="0" y1="${H-RD/2}" x2="${W}" y2="${H-RD/2}" stroke="#facc15" stroke-width="1.5" stroke-dasharray="10,5" opacity=".7"/>
     <text x="8" y="${RD/2}" text-anchor="start" dominant-baseline="middle" font-size="8" font-family="monospace" font-weight="700" fill="#facc15">${lt}</text>
     <text x="${W-8}" y="${H-RD/2}" text-anchor="end" dominant-baseline="middle" font-size="8" font-family="monospace" font-weight="700" fill="#facc15">${rt}</text>`;
  const lblEl=(x,y,lines,fill='#334155',sz=9)=>
    lines.map((l,i)=>`<text x="${x}" y="${y+i*13}" text-anchor="middle" dominant-baseline="middle" font-size="${sz}" font-family="monospace" font-weight="700" fill="${fill}">${l}</text>`).join('');

  let svg='',W=0,H=0;

  if(sec===1){
    const cI=[64,63,62,61,60,59,58],cD=[51,50,49,48,47,46,45],bI=[57,56,55,54,53,52],bD=[44,43,42,41,40,39];
    const PASO=200; W=PAD+DW+G+SW+G+PASO+G+SW+G+DW+PAD;
    const rows=cI.length+1+bI.length; H=RD+PAD+rows*(SH+G)-G+PAD+RD;
    const xL=PAD+DW+G,xR=W-PAD-DW-G-SW,y0=RD+PAD;
    svg+=`<rect width="${W}" height="${H}" fill="#f8fafc" rx="8"/>`;
    svg+=roadEl(W,H,'← Salida 3 oriente','Salida 4 Oriente →');
    svg+=doorEl(PAD,4,DW,RD-6,['Puerta de','acceso 1080']);
    svg+=doorEl(W-PAD-DW,4,DW,RD-6,['Puerta de','acceso 1036']);
    svg+=lblEl(W/2,y0+cI.length*(SH+G)/2-6,['Estacionamiento 3 Oriente /','12 Norte']);
    cI.forEach((id,i)=>{svg+=spotEl(id,xL,y0+i*(SH+G));});
    cD.forEach((id,i)=>{svg+=spotEl(id,xR,y0+i*(SH+G));});
    const yE=y0+cI.length*(SH+G);
    svg+=doorEl(PAD,yE,DW,SH,['Puerta de','acceso 1080']);
    svg+=emergEl(xL,yE,SW,SH,['Salida','emergencia']);
    svg+=emergEl(xR,yE,SW,SH,['Salida','emergencia']);
    svg+=doorEl(W-PAD-DW,yE,DW,SH,['Puerta de','acceso 1038']);
    const yB=yE+SH+G;
    bI.forEach((id,i)=>{svg+=spotEl(id,xL,yB+i*(SH+G));});
    bD.forEach((id,i)=>{svg+=spotEl(id,xR,yB+i*(SH+G));});
  }
  if(sec===2){
    const der=[38,37,36,35,34,33,32,31,30,29],PASO=180;
    W=PAD+SW+G+PASO+G+SW+G+DW+PAD;
    const izqH=NBH+G+SH+G+SH+G+SH+G+SH+G+NBH,derH=der.length*(SH+G)-G,contH=Math.max(izqH,derH);
    H=RD+PAD+contH+PAD+RD;
    const xI=PAD,xD=W-PAD-DW-G-SW,xDr=W-PAD-DW,y0=RD+PAD;
    svg+=`<rect width="${W}" height="${H}" fill="#f8fafc" rx="8"/>`;
    svg+=roadEl(W,H,'← Salida 3 Oriente','Salida 4 Oriente →');
    svg+=doorEl(xDr,4,DW,RD-6,['Puerta de','acceso 1038']);
    let y=y0;
    svg+=nbEl(xI,y,SW,NBH); y+=NBH+G;
    svg+=spotEl(28,xI,y); y+=SH+G; y+=SH+G;
    svg+=spotEl(27,xI,y); y+=SH+G; y+=SH+G;
    svg+=nbEl(xI,y,SW,NBH);
    svg+=lblEl(PAD+SW+G+PASO/2,y0+contH/2-6,['Estacionamientos','Patio Central']);
    der.forEach((id,i)=>{svg+=spotEl(id,xD,y0+i*(SH+G));});
    svg+=`<rect x="${xDr}" y="${y0}" width="${DW}" height="${contH}" rx="4" fill="#1d4ed8" stroke="#3b82f6" stroke-width="1"/>
          <text x="${xDr+DW/2}" y="${y0+contH/2}" text-anchor="middle" dominant-baseline="middle" font-size="7.5" font-family="monospace" font-weight="700" fill="#bfdbfe" transform="rotate(-90,${xDr+DW/2},${y0+contH/2})">Puerta de acceso 1052</text>`;
    svg+=doorEl(xDr,H-RD+2,DW,RD-6,['Puerta de','acceso 1052']);
  }
  if(sec===3){
    const PASO=200,YGAP=G;
    W=PAD+DW+G+SW+G+PASO+G+SW+G+DW+PAD;
    const xDL=PAD,xCL=PAD+DW+G,xPaso=xCL+SW+G,xCR=xPaso+PASO+G,xDR=xCR+SW+G;
    const yGray=RD,grayH=16,yTopSpots=yGray+grayH+G,yDoors=yTopSpots+SH+G,doorH=40;
    const yComedor=yDoors+doorH+G,comedorH=SH+16,y8=yComedor+comedorH+G,yBody=y8+SH+G;
    const cI=[18,19,20,21,22,23,24,25,26],cD=[9,10,11,12,13,14,15,16,17];
    const bodyH=Math.max(cI.length,cD.length)*(SH+YGAP)-YGAP;
    H=yBody+bodyH+PAD+RD;
    svg+=`<rect width="${W}" height="${H}" fill="#f8fafc" rx="8"/>`;
    svg+=roadEl(W,H,'← Salida 3 Oriente','Salida 4 Oriente →');
    svg+=`<rect x="0" y="${yGray}" width="${W}" height="${grayH}" fill="#1a2535" stroke="#1e3a5f" stroke-width="1"/>`;
    const top=[6,5,4,3,2,1],tW=top.length*(SW+G)-G,tX=(W-tW)/2;
    top.forEach((id,i)=>{svg+=spotEl(id,tX+i*(SW+G),yTopSpots,SW,SH);});
    svg+=doorEl(xDL,yDoors,DW,doorH,['Puerta de','acceso 1052']);
    svg+=`<rect x="${xCL}" y="${yDoors}" width="${SW}" height="${doorH}" rx="4" fill="#facc15" stroke="#b45309" stroke-width="1.5"/>`;
    svg+=doorEl(xDR,yDoors,DW,doorH,['Puerta de','acceso 1081']);
    svg+=`<rect x="${xCR}" y="${yDoors}" width="${SW}" height="${doorH}" rx="4" fill="#facc15" stroke="#b45309" stroke-width="1.5"/>`;
    const comX=xPaso,comW=PASO*.65|0;
    svg+=`<rect x="${comX}" y="${yComedor}" width="${comW}" height="${comedorH}" rx="4" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1.5"/>`;
    svg+=`<text x="${comX+comW/2}" y="${yComedor+comedorH/2-6}" text-anchor="middle" dominant-baseline="middle" font-size="8" font-family="monospace" font-weight="700" fill="#64748b">Comedor y</text>`;
    svg+=`<text x="${comX+comW/2}" y="${yComedor+comedorH/2+7}" text-anchor="middle" dominant-baseline="middle" font-size="8" font-family="monospace" font-weight="700" fill="#64748b">Camarines</text>`;
    svg+=spotEl(7,xCR,yComedor,SW,comedorH);
    svg+=spotEl(8,xCR,y8,SW,SH);
    cI.forEach((id,i)=>{svg+=spotEl(id,xCL,yBody+i*(SH+YGAP));});
    cD.forEach((id,i)=>{svg+=spotEl(id,xCR,yBody+i*(SH+YGAP));});
    const yMid=yBody+3*(SH+YGAP);
    svg+=doorEl(xDL,yMid,DW,SH,['Puerta de','acceso 1052']);
    svg+=doorEl(xDR,yMid,DW,SH,['Puerta de','acceso 1061']);
    svg+=lblEl(W/2,yBody+bodyH/2,['Estacionamiento 4 Oriente /','12 Norte']);
  }

  const handleClick=(e)=>{
    const g=e.target.closest('[data-id]');
    if(g&&onSpotClick){const id=parseInt(g.getAttribute('data-id'));const sp=SPOTS_DATA.find(s=>s.id===id);if(sp)onSpotClick(sp);}
  };
  return (
    <div style={{overflowX:'auto',borderRadius:8}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{display:'block',width:'100%',minWidth:320,borderRadius:8}}
        dangerouslySetInnerHTML={{__html:svg}} onClick={handleClick}/>
    </div>
  );
};

// ── HISTORIAL ──
const loadHistorial = async (spotId) => {
  try {
    const data = await fsWhere("historial", "spot_id", Number(spotId));
    return data
      .map(h => ({ ...h, created_at: h.createdAt || h.created_at }))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 20);
  } catch(e) { console.error("loadHistorial:", e); return []; }
};
const addHistorial = async (spotId, accion, detalle) => {
  try { await fsAdd("historial", { spot_id: Number(spotId), accion, detalle, createdAt: new Date() }); }
  catch(e) { console.error("addHistorial:", e); }
};

// ── RECLAMO MODAL ──
const ReclamoModal = ({spot, record, onClose, onSent}) => {
  const [desc, setDesc] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const sc = SC[spot.sector];
  const send = async () => {
    if(!desc.trim()) return;
    setSending(true);
    try {
      const p = new URLSearchParams({
        tipo:"reclamo",
        estac_id: spot.id,
        sector: SECTOR_NAMES[spot.sector],
        torre: spot.torre,
        depto: spot.depto,
        descripcion: desc,
        email_reporta: email||"no indicado",
        patentes: (record?.patentes||[]).join(", ")||"—",
        nombre_registrado: record?.nombre||"—",
        fecha: new Date().toLocaleString("es-CL"),
      });
      new Image().src = GAS_URL + "?" + p.toString();
      onSent();
      onClose();
    } catch(e) { /* silencioso */ }
    setSending(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20,backdropFilter:"blur(4px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#ffffff",borderRadius:18,width:"100%",maxWidth:420,border:"1.5px solid #dc2626",boxShadow:"0 24px 64px rgba(15,23,42,.25)",overflow:"hidden"}}>
        <div style={{background:"#7f1d1d",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"#fca5a5",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Estac. #{spot.id} · {SECTOR_NAMES[spot.sector]}</div>
            <div style={{fontSize:16,fontWeight:900,color:"white"}}>⚠️ Reportar ocupación indebida</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"white",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#f8fafc",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#64748b"}}>
            <strong style={{color:"white"}}>Registrado a:</strong> {record?.nombre||"—"} · Patente(s): {(record?.patentes||[]).join(", ")||"—"}
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Tu correo (opcional)</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="para recibir respuesta"
              style={{width:"100%",padding:"9px 12px",borderRadius:8,fontSize:13,border:"1.5px solid #1e3a5f",background:"#f8fafc",color:"#0f172a",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Descripción <span style={{color:"#e53e3e"}}>*</span></label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="Describe brevemente la situación..."
              style={{width:"100%",padding:"9px 12px",borderRadius:8,fontSize:13,border:"1.5px solid #1e3a5f",background:"#f8fafc",color:"#0f172a",outline:"none",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid #1e3a5f",background:"transparent",color:"#94a3b8",fontWeight:600,fontSize:13,cursor:"pointer"}}>Cancelar</button>
            <button onClick={send} disabled={!desc.trim()||sending} style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:desc.trim()?"#dc2626":"#374151",color:"white",fontWeight:800,fontSize:13,cursor:desc.trim()?"pointer":"not-allowed"}}>
              {sending?"Enviando...":"Enviar reporte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── RECLAMOS TAB ──
const ReclamosTab = () => {
  const [reclamos, setReclamos] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{
    fsList("reclamos")
      .then(d=>{ setReclamos(d.map(r=>({...r,created_at:r.createdAt||r.created_at})).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,50)); setLoading(false); })
      .catch(()=>setLoading(false));
  },[]);
  if(loading) return <div style={{textAlign:"center",padding:40,color:"#64748b"}}>Cargando reclamos...</div>;
  return (
    <div>
      <h3 style={{color:"#0f172a",fontSize:14,fontWeight:800,margin:"0 0 16px"}}>⚠️ Reportes de ocupación indebida</h3>
      {reclamos.length===0&&<div style={{textAlign:"center",padding:40,color:"#4b5563",fontSize:13}}>No hay reportes registrados.</div>}
      {reclamos.map((r,i)=>(
        <div key={i} style={{background:"#ffffff",borderRadius:12,padding:14,marginBottom:8,border:"1px solid #e2e8f0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Estac. #{r.estac_id} — Torre {r.torre} · {r.depto}</div>
            <span style={{fontSize:10,color:"#4b5563",fontFamily:"monospace"}}>{r.created_at?new Date(r.created_at).toLocaleDateString("es-CL"):""}</span>
          </div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{r.descripcion}</div>
          {r.email_reporta&&r.email_reporta!=="no indicado"&&<div style={{fontSize:10,color:"#4b5563"}}>Reportado por: {r.email_reporta}</div>}
        </div>
      ))}
    </div>
  );
};

// ── Small components ──
const Toast = ({msg,type}) => (
  <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:type==="error"?"#7f1d1d":type==="info"?"#1e3a5f":"#064e3b",color:"white",padding:"12px 22px",borderRadius:12,fontSize:13,fontWeight:700,boxShadow:"0 8px 32px rgba(0,0,0,.4)",zIndex:400,whiteSpace:"nowrap",border:`1px solid ${type==="error"?"#dc2626":type==="info"?"#2563eb":"#16a34a"}`}}>
    {type==="error"?"❌":type==="info"?"🔓":"✅"} {msg}
  </div>
);
const RowItem = ({icon,label,value,mono}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,.07)",paddingBottom:10}}>
    <span style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>{icon} {label}</span>
    <span style={{fontSize:14,fontWeight:700,color:"white",fontFamily:mono?"monospace":"inherit",letterSpacing:mono?2:0}}>{value||"—"}</span>
  </div>
);
const Legend = ({color,label}) => (
  <div style={{display:"flex",alignItems:"center",gap:5}}>
    <div style={{width:10,height:10,borderRadius:2,background:color}}/>
    <span style={{fontSize:10,color:"#94a3b8"}}>{label}</span>
  </div>
);
const SummaryRow = ({label,value}) => (
  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
    <span style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,flexShrink:0}}>{label}</span>
    <span style={{fontSize:12,color:"#0f172a",fontWeight:600,textAlign:"right"}}>{value||"—"}</span>
  </div>
);

// ── SpotModal ──
const SpotModal = ({spot,record,onClose,onSave,onDelete}) => {
  const sc=SC[spot.sector];
  const [patentes,setPatentes]=useState(record?.patentes||[""]);
  const [propietario,setPropietario]=useState(record?.propietario||"");
  const [telefono,setTelefono]=useState(record?.telefono||"");
  const [vehiculo,setVehiculo]=useState(record?.vehiculo||"");
  const [historial,setHistorial]=useState([]);
  const [showHist,setShowHist]=useState(false);
  const [loadingHist,setLoadingHist]=useState(false);

  const toggleHist=async()=>{
    if(!showHist&&historial.length===0){
      setLoadingHist(true);
      const h=await loadHistorial(spot.id);
      setHistorial(h);
      setLoadingHist(false);
    }
    setShowHist(v=>!v);
  };

  const save=()=>{
    const c=patentes.filter(p=>p.trim());
    onSave({patentes:c,propietario,telefono,vehiculo,updatedAt:new Date().toISOString()});
    addHistorial(spot.id,"Edición staff",`Patentes: ${c.join(", ")||"—"} · ${propietario||"sin nombre"}`);
  };

  const accionColor={
    "Registro inicial":"#22c55e",
    "Modificación":"#3b82f6",
    "Edición staff":"#a855f7",
    "Liberación":"#ef4444",
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16,backdropFilter:"blur(6px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#ffffff",border:`1.5px solid ${sc.accent}50`,borderRadius:18,width:"100%",maxWidth:420,overflow:"hidden",boxShadow:"0 24px 64px rgba(15,23,42,.25)",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"18px 20px 14px",background:sc.bg,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:sc.accent,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>{SECTOR_NAMES[spot.sector]}</div>
            <div style={{fontSize:22,fontWeight:900,color:"#0f172a",fontFamily:"monospace"}}>Estac. #{spot.id}</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Torre {spot.torre} · Depto {spot.depto}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(15,23,42,.05)",border:"none",color:"#0f172a",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:8}}>Patentes</label>
            {patentes.map((p,i)=>(
              <div key={i} style={{display:"flex",gap:6,marginBottom:7}}>
                <input value={p} onChange={e=>setPatentes(pt=>pt.map((x,j)=>j===i?e.target.value.toUpperCase():x))} placeholder={`Patente ${i+1}`} maxLength={8}
                  style={{flex:1,padding:"10px 14px",borderRadius:9,fontSize:15,fontWeight:800,border:"1.5px solid #1e3a5f",background:"#f1f5f9",color:"#0f172a",outline:"none",fontFamily:"monospace",letterSpacing:3,textTransform:"uppercase"}}/>
                {patentes.length>1&&<button onClick={()=>setPatentes(pt=>pt.filter((_,j)=>j!==i))} style={{padding:"0 11px",borderRadius:9,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",cursor:"pointer",fontSize:15}}>−</button>}
              </div>
            ))}
            {patentes.length<5&&<button onClick={()=>setPatentes(p=>[...p,""])} style={{width:"100%",padding:"7px",borderRadius:9,border:`1.5px dashed ${sc.accent}70`,background:"rgba(255,255,255,.03)",color:sc.accent,cursor:"pointer",fontSize:12,fontWeight:600}}>+ Agregar patente</button>}
          </div>
          {[["Propietario",propietario,setPropietario,"Nombre completo"],["Teléfono",telefono,setTelefono,"+56 9 ..."],["Vehículo",vehiculo,setVehiculo,"Marca/Color"]].map(([lbl,val,setter,ph])=>(
            <div key={lbl} style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5}}>{lbl}</label>
              <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph} style={{padding:"8px 11px",borderRadius:8,fontSize:13,border:"1.5px solid #1e3a5f",background:"#f1f5f9",color:"#0f172a",outline:"none",fontFamily:"inherit"}}/>
            </div>
          ))}

          {/* Historial */}
          <div>
            <button onClick={toggleHist} style={{width:"100%",padding:"8px",borderRadius:8,border:"1px solid #1e3a5f",background:"transparent",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>🕐 Historial de cambios</span>
              <span>{showHist?"▲":"▼"}</span>
            </button>
            {showHist&&(
              <div style={{marginTop:8,background:"#f1f5f9",borderRadius:8,padding:10,border:"1px solid #e2e8f0"}}>
                {loadingHist&&<div style={{color:"#4b5563",fontSize:11,textAlign:"center",padding:8}}>Cargando...</div>}
                {!loadingHist&&historial.length===0&&<div style={{color:"#4b5563",fontSize:11,textAlign:"center",padding:8}}>Sin historial registrado</div>}
                {historial.map((h,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:8,paddingBottom:8,borderBottom:i<historial.length-1?"1px solid #1e293b":"none"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:accionColor[h.accion]||"#64748b",marginTop:4,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:700,color:accionColor[h.accion]||"#94a3b8"}}>{h.accion}</div>
                      <div style={{fontSize:10,color:"#475569",marginTop:2}}>{h.detalle}</div>
                      <div style={{fontSize:9,color:"#334155",marginTop:2}}>{h.created_at?new Date(h.created_at).toLocaleString("es-CL"):""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{padding:"0 20px 20px",display:"flex",gap:8,justifyContent:"space-between"}}>
          <div>{record&&<button onClick={()=>{addHistorial(spot.id,"Liberación",`Liberado por staff`);onDelete();}} style={{padding:"9px 16px",borderRadius:9,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontWeight:700,fontSize:12,cursor:"pointer"}}>Liberar</button>}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{padding:"9px 16px",borderRadius:9,border:"1.5px solid #1e3a5f",background:"transparent",color:"#64748b",fontWeight:600,fontSize:12,cursor:"pointer"}}>Cancelar</button>
            <button onClick={save} style={{padding:"9px 22px",borderRadius:9,border:"none",background:sc.accent,color:"#0f172a",fontWeight:900,fontSize:12,cursor:"pointer"}}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConfirmDialog = ({msg,onConfirm,onCancel}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20,backdropFilter:"blur(4px)"}}>
    <div style={{background:"#f1f5f9",borderRadius:16,padding:28,maxWidth:320,width:"100%",border:"1.5px solid #e2e8f0",textAlign:"center"}}>
      <div style={{fontSize:36,marginBottom:14}}>⚠️</div>
      <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:8}}>¿Confirmar eliminación?</div>
      <div style={{fontSize:13,color:"#64748b",marginBottom:22,lineHeight:1.5}}>{msg}</div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"transparent",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancelar</button>
        <button onClick={onConfirm} style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:"#dc2626",color:"white",fontWeight:800,fontSize:13,cursor:"pointer"}}>Eliminar</button>
      </div>
    </div>
  </div>
);

// ── INACTIVIDAD ──
const INACTIVITY_MINUTES = 15;

const useInactivity = (onTimeout) => {
  const timer = useRef(null);
  const reset = useCallback(() => {
    if(timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onTimeout, INACTIVITY_MINUTES * 60 * 1000);
  }, [onTimeout]);

  useEffect(() => {
    const events = ["mousemove","keydown","click","scroll","touchstart"];
    events.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if(timer.current) clearTimeout(timer.current);
    };
  }, [reset]);
};
let loginInProgress = false;

// ── STAFF LOGIN ──
const StaffLogin = ({onSuccess,onBack}) => {
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [aviso,setAviso]=useState("");
  const [enviando,setEnviando]=useState(false);
  useEffect(()=>{loginInProgress=false;},[]);

  const recuperar=async()=>{
    if(enviando)return;
    if(!email.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError("Escribe tu correo arriba y vuelve a presionar «¿Olvidaste tu contraseña?».");setAviso("");return;}
    setEnviando(true);setError("");setAviso("");
    try{await enviarRecuperacion(email);}catch(e){/* no se revela si la cuenta existe */}
    setEnviando(false);
    setAviso(`Si ${email.trim()} tiene una cuenta, recibirás un correo para crear una nueva contraseña. Revisa también la carpeta de spam.`);
  };

  const login=async()=>{
    if(loginInProgress)return;
    if(!email.trim()||!pass.trim()){setError("Completa todos los campos.");return;}
    loginInProgress=true; setLoading(true); setError("");
    try{
      const res=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:email.trim(),password:pass,returnSecureToken:true}),
      });
      const data=await res.json();
      if(data.idToken){
        fbSession={idToken:data.idToken,refreshToken:data.refreshToken,exp:Date.now()+Number(data.expiresIn||3600)*1000,email:data.email,admin:false};
        const ok=await verificarAdmin(data.email);
        if(!ok){cerrarSesion();setError("Esta cuenta no tiene permisos de administración.");loginInProgress=false;setLoading(false);return;}
        fbSession.admin=true;
        loginInProgress=false;onSuccess();
      }
      else{
        const code=data.error?.message||"";
        const msg=/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(code)?"Correo o contraseña incorrectos."
          :/TOO_MANY_ATTEMPTS/.test(code)?"Demasiados intentos. Espera unos minutos."
          :/USER_DISABLED/.test(code)?"Esta cuenta está deshabilitada.":"No se pudo ingresar. Inténtalo nuevamente.";
        setError(msg);loginInProgress=false;setLoading(false);
      }
    }catch(e){setError("Error de conexión.");loginInProgress=false;setLoading(false);}
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#f1f5f9 0%,#f8fafc 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",fontFamily:"system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={onBack} style={{background:"rgba(15,23,42,.05)",border:"none",color:"#64748b",borderRadius:9,padding:"7px 14px",cursor:"pointer",fontSize:14,marginBottom:28}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:70,height:70,borderRadius:20,background:"linear-gradient(135deg,#f8fafc,#e2e8f0)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,margin:"0 auto 16px",boxShadow:"0 10px 30px rgba(0,0,0,.4)"}}>🔑</div>
          <h2 style={{margin:0,fontSize:22,fontWeight:900,color:"#0f172a",letterSpacing:-0.5}}>Acceso Personal</h2>
          <p style={{margin:"6px 0 0",fontSize:13,color:"#4b5563"}}>Administración · Conserjería</p>
        </div>
        <div style={{background:"#ffffff",borderRadius:18,padding:24,border:"1px solid #e2e8f0",boxShadow:"0 20px 50px rgba(0,0,0,.4)"}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Correo electrónico</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} placeholder="correo@ejemplo.com"
                style={{width:"100%",padding:"12px 14px",borderRadius:10,fontSize:14,border:`1.5px solid ${error?"#fca5a5":"#e2e8f0"}`,background:"#ffffff",color:"#0f172a",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Contraseña</label>
              <input type="password" value={pass} onChange={e=>{setPass(e.target.value);setError("");}} placeholder="••••••••"
                style={{width:"100%",padding:"12px 14px",borderRadius:10,fontSize:14,border:`1.5px solid ${error?"#fca5a5":"#e2e8f0"}`,background:"#ffffff",color:"#0f172a",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            {error&&<div style={{padding:"10px 14px",borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca",fontSize:12,color:"#b91c1c"}}>⚠️ {error}</div>}
            {aviso&&<div style={{padding:"10px 14px",borderRadius:8,background:"#f0fdf4",border:"1px solid #166534",fontSize:12,color:"#15803d"}}>✉️ {aviso}</div>}
            <button onClick={login} disabled={loading}
              style={{padding:"13px",borderRadius:10,border:"none",background:loading?"#374151":"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"white",fontWeight:800,fontSize:15,cursor:loading?"not-allowed":"pointer",marginTop:4,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              {loading?<><span style={{width:16,height:16,border:"2px solid #e2e8f0",borderTop:"2px solid white",borderRadius:"50%",display:"inline-block",animation:"spin 1s linear infinite"}}/> Verificando...</>:"Ingresar →"}
            </button>
            <button onClick={recuperar} disabled={enviando}
              style={{background:"none",border:"none",color:"#2563eb",fontSize:12,cursor:"pointer",padding:4,textDecoration:"underline"}}>
              {enviando?"Enviando…":"¿Olvidaste tu contraseña?"}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

// ── HOME ──
const HomeScreen = ({onGo}) => {
  const [show,setShow]=useState(false);
  useEffect(()=>{setTimeout(()=>setShow(true),60);},[]);
  const card=(icon,title,sub,key,grad,delay)=>(
    <button onClick={()=>onGo(key)} style={{display:"flex",alignItems:"center",gap:18,width:"100%",padding:"22px 24px",borderRadius:20,border:"none",cursor:"pointer",background:grad,color:"white",textAlign:"left",boxShadow:"0 10px 30px rgba(0,0,0,.3)",transform:show?"translateY(0)":"translateY(28px)",opacity:show?1:0,transition:`transform .45s cubic-bezier(.22,1,.36,1) ${delay}ms, opacity .4s ${delay}ms`}}>
      <div style={{fontSize:44,lineHeight:1}}>{icon}</div>
      <div style={{flex:1}}><div style={{fontSize:20,fontWeight:900,marginBottom:4}}>{title}</div><div style={{fontSize:13,opacity:0.78,lineHeight:1.4}}>{sub}</div></div>
      <div style={{fontSize:24,opacity:0.45}}>›</div>
    </button>
  );
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#f1f5f9 0%,#f8fafc 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:44,transform:show?"translateY(0)":"translateY(-18px)",opacity:show?1:0,transition:"transform .5s cubic-bezier(.22,1,.36,1), opacity .5s"}}>
        <div style={{width:90,height:90,borderRadius:28,background:"linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:46,boxShadow:"0 20px 50px rgba(37,99,235,.5)",marginBottom:22}}>🅿</div>
        <h1 style={{margin:0,fontSize:32,fontWeight:800,color:"#0f172a",letterSpacing:-0.8}}>Parking</h1>
        <p style={{margin:"7px 0 0",fontSize:13,color:"#4a5568",fontWeight:500}}>Gestión de Estacionamientos · {SPOTS_DATA.length} espacios</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:390}}>
        {card("🏠","Soy Residente","Registra tus patentes y consulta tu estacionamiento asignado","resident","linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)",100)}
        {card("🔑","Acceso Personal","Verificar patente · Administración · Conserjería","staff","linear-gradient(135deg,#1e3a5f 0%,#2e5490 100%)",210)}
      </div>
      <div style={{marginTop:38,display:"flex",gap:18,transform:show?"translateY(0)":"translateY(10px)",opacity:show?1:0,transition:"all .6s 350ms"}}>
        {Object.entries(SC).map(([k,sc])=>(
          <div key={k} style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:8,height:8,borderRadius:2,background:sc.accent,boxShadow:`0 0 6px ${sc.accent}80`}}/>
            <span style={{fontSize:10,color:"#4a5568"}}>{SECTOR_NAMES[Number(k)]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── QUERY TAB ──
const QueryTab = ({records}) => {
  const [mode,setMode]=useState("patente");
  const [queryPat,setQueryPat]=useState("");
  const [queryTorre,setQueryTorre]=useState("");
  const [queryDepto,setQueryDepto]=useState("");
  const [result,setResult]=useState(null);
  const [reclamo,setReclamo]=useState(null);
  const deptosFiltrados=queryTorre?DEPTOS_ALL.filter(d=>BY_TD[`${queryTorre}-${d}`]):[];

  const buscarPatente=()=>{
    if(!queryPat.trim())return;
    const q=queryPat.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    let res=null;
    for(const s of SPOTS_DATA){const rec=records[s.id];if(rec?.patentes?.some(p=>p.toUpperCase().replace(/[^A-Z0-9]/g,"")===q)){res={spot:s,record:rec};break;}}
    setResult(res||"not_found");
  };
  const buscarDireccion=()=>{
    if(!queryTorre||!queryDepto)return;
    const spot=BY_TD[`${queryTorre}-${queryDepto}`];
    if(!spot){setResult("not_found");return;}
    const rec=records[spot.id];
    if(!rec){setResult({spot,notReg:true});return;}
    setResult({spot,record:rec});
  };
  const reset=()=>{setResult(null);setQueryPat("");setQueryTorre("");setQueryDepto("");};

  return (
    <div>
      <div style={{display:"flex",gap:2,background:"#dde3ed",borderRadius:10,padding:3,marginBottom:16}}>
        {[["patente","🔍 Por Patente"],["direccion","🏠 Por Dirección"]].map(([k,lbl])=>(
          <button key={k} onClick={()=>{setMode(k);setResult(null);}} style={{flex:1,padding:"9px 6px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:mode===k?"white":"transparent",color:mode===k?"#1d4ed8":"#64748b",boxShadow:mode===k?"0 2px 8px rgba(0,0,0,.1)":"none"}}>{lbl}</button>
        ))}
      </div>
      {mode==="patente"&&(
        <div style={{background:"white",borderRadius:16,padding:24,marginBottom:16,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
          <h2 style={{margin:"0 0 6px",fontSize:17,fontWeight:800,color:"#0f172a"}}>Consultar Patente</h2>
          <p style={{margin:"0 0 16px",fontSize:13,color:"#64748b"}}>Ingresa la patente para verificar si está registrada.</p>
          <div style={{display:"flex",gap:10}}>
            <input value={queryPat} onChange={e=>{setQueryPat(e.target.value);setResult(null);}} onKeyDown={e=>e.key==="Enter"&&buscarPatente()} placeholder="ABCD12" maxLength={8}
              style={{flex:1,padding:"13px 16px",borderRadius:10,fontSize:18,fontWeight:900,border:"2px solid #e2e8f0",background:"white",color:"#0f172a",outline:"none",fontFamily:"monospace",textTransform:"uppercase",letterSpacing:3}}/>
            <button onClick={buscarPatente} style={{padding:"13px 20px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Buscar</button>
          </div>
        </div>
      )}
      {mode==="direccion"&&(
        <div style={{background:"white",borderRadius:16,padding:24,marginBottom:16,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
          <h2 style={{margin:"0 0 6px",fontSize:17,fontWeight:800,color:"#0f172a"}}>Consultar por Dirección</h2>
          <p style={{margin:"0 0 16px",fontSize:13,color:"#64748b"}}>Selecciona tu torre y letra para ver tu estacionamiento.</p>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <select value={queryTorre} onChange={e=>{setQueryTorre(e.target.value);setQueryDepto("");setResult(null);}}
              style={{width:"100%",padding:"11px 12px",borderRadius:9,fontSize:14,fontWeight:600,border:"1.5px solid #e2e8f0",background:"white",outline:"none",cursor:"pointer",fontFamily:"monospace"}}>
              <option value="">— Selecciona la dirección —</option>
              {TORRES.map(t=><option key={t} value={t}>{TORRES_LABELS[t]}</option>)}
            </select>
            <select value={queryDepto} onChange={e=>{setQueryDepto(e.target.value);setResult(null);}} disabled={!queryTorre}
              style={{width:"100%",padding:"11px 12px",borderRadius:9,fontSize:14,fontWeight:600,border:"1.5px solid #e2e8f0",background:queryTorre?"white":"#f8fafc",outline:"none",cursor:queryTorre?"pointer":"not-allowed",fontFamily:"monospace"}}>
              <option value="">— Selecciona letra/block —</option>
              {deptosFiltrados.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={buscarDireccion} disabled={!queryTorre||!queryDepto}
              style={{padding:"12px",borderRadius:10,border:"none",background:queryTorre&&queryDepto?"#2563eb":"#cbd5e1",color:"white",fontWeight:800,fontSize:14,cursor:queryTorre&&queryDepto?"pointer":"not-allowed"}}>
              Ver Estacionamiento
            </button>
          </div>
        </div>
      )}
      {result==="not_found"&&(
        <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:16,padding:28,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:10}}>🔍</div>
          <div style={{fontSize:16,fontWeight:700,color:"#92400e",marginBottom:6}}>{mode==="patente"?"Patente no encontrada":"Dirección no encontrada"}</div>
          <div style={{fontSize:12,color:"#b45309",marginBottom:16}}>{mode==="patente"?"Esta patente no está registrada.":"No existe asignación para esta combinación."}</div>
          <button onClick={reset} style={{padding:"9px 20px",borderRadius:8,border:"1.5px solid #f59e0b",background:"transparent",color:"#b45309",cursor:"pointer",fontWeight:700,fontSize:12}}>Nueva búsqueda</button>
        </div>
      )}
      {result&&result!=="not_found"&&result.notReg&&(
        <div style={{background:"#f0f9ff",border:"1.5px solid #bae6fd",borderRadius:16,padding:28,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:10}}>📋</div>
          <div style={{fontSize:16,fontWeight:700,color:"#0c4a6e",marginBottom:8}}>Estacionamiento sin registrar</div>
          {(()=>{const sp=result.spot,sc0=SC[sp.sector];return(
            <div style={{display:"inline-flex",alignItems:"center",gap:10,padding:"10px 18px",borderRadius:10,background:sc0.accent+"20",border:`1.5px solid ${sc0.accent}50`,marginBottom:12}}>
              <div style={{fontFamily:"monospace",fontWeight:900,fontSize:18,color:sc0.spotOcc}}>#{sp.id}</div>
              <div style={{textAlign:"left"}}><div style={{fontSize:11,color:sc0.spotOcc,fontWeight:700}}>{SECTOR_NAMES[sp.sector]}</div><div style={{fontSize:11,color:"#0f172a"}}>Torre {sp.torre} · {sp.depto}</div></div>
            </div>
          );})()}
          <div style={{fontSize:12,color:"#0369a1",marginBottom:16}}>Ve a <strong>Ingresar Datos</strong> para registrarte.</div>
          <button onClick={reset} style={{padding:"9px 20px",borderRadius:8,border:"1.5px solid #0ea5e9",background:"transparent",color:"#0369a1",cursor:"pointer",fontWeight:700,fontSize:12}}>Nueva búsqueda</button>
        </div>
      )}
      {result&&result!=="not_found"&&!result.notReg&&(()=>{
        const {spot,record}=result,sc5=SC[spot.sector];
        const veh=record.vehiculos?.find(v=>v.patente?.toUpperCase().replace(/[^A-Z0-9]/g,"")===queryPat.trim().toUpperCase().replace(/[^A-Z0-9]/g,""));
        const esVisita=veh?.esVisita==="si";
        return <div>
          <div style={{background:sc5.bg,borderRadius:16,overflow:"hidden",marginBottom:14}}>
            <div style={{padding:"18px 22px",background:"rgba(255,255,255,.08)",borderBottom:"1px solid rgba(255,255,255,.1)",display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:36}}>{esVisita?"🚗":"✅"}</div>
              <div>
                <div style={{fontSize:11,color:sc5.accent,fontWeight:700,marginBottom:2}}>{esVisita?"Vehículo de visita registrado":"Patente registrada"}</div>
                <div style={{fontSize:22,fontWeight:900,fontFamily:"monospace",color:"white"}}>#{spot.id}</div>
              </div>
            </div>
            <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:12}}>
              <RowItem icon="📍" label="Sector" value={SECTOR_NAMES[spot.sector]}/>
              <RowItem icon="🏢" label="Torre" value={spot.torre}/>
              <RowItem icon="🏠" label="Departamento" value={spot.depto}/>
              <RowItem icon="👤" label="Propietario inmueble" value={record.nombre||"—"}/>
              {record.telefono&&<RowItem icon="📞" label="Teléfono propietario" value={record.telefono}/>}
              {esVisita&&<>
                <div style={{height:1,background:"rgba(255,255,255,.1)"}}/>
                <div style={{fontSize:10,color:sc5.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Datos de la visita</div>
                <RowItem icon="👥" label="Nombre visita" value={veh?.nombreVisita||"—"}/>
                <RowItem icon="📱" label="Teléfono visita" value={veh?.telefonoVisita||"—"}/>
              </>}
            </div>
          </div>
          <div style={{background:"#1e293b",borderRadius:16,overflow:"hidden",border:`2px solid ${sc5.border}40`,marginBottom:12}}>
            <div style={{padding:"10px 16px",background:sc5.bg,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,fontWeight:700,color:sc5.accent}}>📐 Ubicación en el plano</div>
              <div style={{fontSize:11,color:sc5.text,opacity:0.7}}>{SECTOR_NAMES[spot.sector]}</div>
            </div>
            <div style={{padding:10,overflowX:"auto"}}><SectorMap sectorId={spot.sector} records={records} onSpotClick={()=>{}} highlightId={spot.id}/></div>
            <div style={{padding:"8px 14px 10px",display:"flex",gap:14,flexWrap:"wrap",background:"#162032"}}>
              <Legend color="#facc15" label="Tu estacionamiento"/>
              <Legend color={SC[spot.sector].spotOcc} label="Ocupado"/>
              <Legend color="#2d3f5a" label="Libre"/>
            </div>
          </div>
          <button onClick={reset} style={{width:"100%",padding:"11px",borderRadius:10,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:700,fontSize:13,cursor:"pointer"}}>Nueva búsqueda</button>
          <button onClick={()=>setReclamo({spot,record})}
            style={{width:"100%",marginTop:8,padding:"11px",borderRadius:10,border:"1.5px solid #ef4444",background:"#fff5f5",color:"#dc2626",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            ⚠️ Reportar ocupación indebida
          </button>
        </div>;
      })()}
      {reclamo&&<ReclamoModal spot={reclamo.spot} record={reclamo.record} onClose={()=>setReclamo(null)} onSent={()=>setReclamo(null)}/>}
    </div>
  );
};

// ── RESIDENT ──
const ResidentScreen = ({records,setRecords,setLocal,onBack}) => {
  // Acceso con correo del Registro de Copropietarios
  const [acc,setAcc]=useState({correo:"",codigo:"",enviado:false,sesion:"",unidades:[],cargando:false,error:"",aviso:""});
  const pedirCodigo=async()=>{
    const correo=acc.correo.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)){setAcc(a=>({...a,error:"Escribe un correo válido"}));return;}
    setAcc(a=>({...a,cargando:true,error:"",aviso:""}));
    const j=await apiCodigo({accion:"enviar",email:correo,para:"parking"}).catch(()=>({ok:false,error:"Sin conexión"}));
    setAcc(a=>({...a,cargando:false,enviado:j.ok,error:j.ok?"":(j.error||"No se pudo enviar el código"),aviso:j.ok?"Te enviamos un código de 6 dígitos a "+correo+". Revisa también spam.":""}));
  };
  const validarCodigo=async()=>{
    const correo=acc.correo.trim().toLowerCase();
    setAcc(a=>({...a,cargando:true,error:""}));
    const v=await apiCodigo({accion:"verificar",email:correo,codigo:acc.codigo}).catch(()=>({ok:false,error:"Sin conexión"}));
    if(!v.ok){setAcc(a=>({...a,cargando:false,error:v.error||"Código incorrecto"}));return;}
    const r=await apiCodigo({accion:"registro",email:correo,sesion:v.sesion}).catch(()=>({ok:false}));
    const unidades=(r.registros||[]).filter(u=>u.unidad&&BY_TD[u.unidad]);
    setAcc(a=>({...a,cargando:false,sesion:v.sesion,unidades}));
    setFormState(f=>({...f,email:correo}));
    if(unidades.length===1){const [t,d]=unidades[0].unidad.split("-");setFormState(f=>({...f,torre:t,depto:d,email:correo}));}
  };
  const [tab,setTab]=useState("form");
  const [toast,setToast]=useState(null);
  const [form,setFormState]=useState(emptyForm());
  const [step,setStep]=useState("correo");
  const [found,setFound]=useState(null);
  const [errors,setErrors]=useState({});
  const [emailInput,setEmailInput]=useState("");
  const [isEditing,setIsEditing]=useState(false);

  const [reclamo,setReclamo]=useState(null); // {spot, record}

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),2800);};

  const [verificando,setVerificando]=useState(false);
  const setF=(k,v)=>{setFormState(f=>({...f,[k]:v}));setErrors(e=>({...e,[k]:""}));};

  const handleLookup=async()=>{
    if(verificando)return;
    if(!form.torre||!form.depto){setErrors({lookup:"Selecciona dirección y departamento"});return;}
    const spot=BY_TD[`${form.torre}-${form.depto}`]||null;
    if(!spot){setErrors({lookup:"No se encontró asignación para esta dirección"});return;}
    // La unidad debe estar en el Registro de Copropietarios con el correo verificado
    const u=acc.unidades.find(x=>x.unidad===`${form.torre}-${form.depto}`);
    if(!u){
      setErrors({lookup:`UNIDAD NO REGISTRADA EN EL PADRÓN DE COPROPIETARIOS\n\nTu correo (${acc.correo.trim().toLowerCase()}) no figura en el Registro de Copropietarios para ${TORRES_LABELS[form.torre]||form.torre}, depto. ${form.depto}.\n\nPrimero completa el registro de tu unidad (o pide al propietario que te incluya) en:\nhttps://com12norte.github.io/administracion-edificio/copropietario.html`});
      return;
    }
    const docs={documentosOk:!u.faltan.length,faltan:u.faltan,siArrienda:[],sinFicha:false};
    // Además debe tener todos los documentos entregados (planilla "Listado de Documentos")
    if(!docs.documentosOk){
      // Descripción de cada documento tal como se le pide al copropietario
      const DESC={
        "Certificado de Dominio Vigente":"Certificado de dominio vigente de la unidad (Conservador de Bienes Raíces)",
        "CI Dueño":"Copia de la cédula de identidad del o los propietarios (por ambos lados)",
        "Contrato de Arriendo":"Copia simple del contrato de arrendamiento vigente, o declaración del propietario (arrendador)",
        "CI Arrendatario":"Copia de la cédula de identidad del arrendatario (por ambos lados)",
        "Ficha de Registro":"Registro de copropietarios completo",
      };
      const linea=f=>`• ${DESC[f]||f}`;
      const partes=[];
      if(docs.faltan.length) partes.push(`Documentos pendientes:\n${docs.faltan.map(linea).join("\n")}`);
      if(docs.siArrienda.length) partes.push(`Si la unidad está arrendada, además:\n${docs.siArrienda.map(linea).join("\n")}`);
      if(!partes.length) partes.push("La administración aún está revisando su documentación.");
      const intro=docs.sinFicha
        ?"Su unidad aún no tiene documentación registrada en la administración."
        :"Para registrar el estacionamiento, la administración debe haber recibido toda la documentación de su unidad. Según nuestros registros:";
      setErrors({lookup:`DOCUMENTACIÓN INCOMPLETA\n\nEstimado(a) Copropietario(a) de ${TORRES_LABELS[form.torre]||form.torre}, depto. ${form.depto}:\n\n${intro}\n\n${partes.join("\n\n")}\n\nEnvíe los documentos a com12norte@gmail.com indicando su dirección y departamento. Una vez recibidos y revisados, podrá registrar su estacionamiento (puede tardar unos días).\n\nLa Ley 21.445 (Art. 5°) establece que todo copropietario debe incorporarse al registro de copropietarios.\n\nAtentamente,\nAdministración — Comunidad de Edificios 12 Norte`});
      return;
    }
    setFound(spot);
    const rec=records[spot.id];
    // El correo ya está verificado con el código y figura en el registro de la unidad
    setIsEditing(!!rec);setErrors({});
    if(rec)setFormState(f=>({...f,usoEstacionamiento:rec.usoEstacionamiento||"",
      vehiculos:rec.vehiculos?.length?rec.vehiculos.map(v=>({patente:v.patente||"",marca:v.marca||"",color:v.color||"",esVisita:v.esVisita||"no",nombreVisita:v.nombreVisita||"",telefonoVisita:""})):f.vehiculos}));
    setStep(1);
  };

  const [verificandoCorreo,setVerificandoCorreo]=useState(false);
  const handleEmailVerify=async()=>{
    if(!found||verificandoCorreo)return;
    const rec=records[found.id]||{};
    const entered=emailInput.trim().toLowerCase();
    if(!entered){setErrors({emailVerify:"Ingresa tu correo"});return;}
    setVerificandoCorreo(true);
    const ok=await verificarCorreo(found.id,entered);
    setVerificandoCorreo(false);
    if(!ok){setErrors({emailVerify:"El correo no coincide. Contacta a administración."});return;}
    // Por privacidad solo se precargan patentes y uso; los datos personales se ingresan de nuevo
    setFormState(f=>({...f,nombre:"",email:entered,telefono:"",tipoResidente:"",usoEstacionamiento:rec?.usoEstacionamiento||"",
      vehiculos:rec?.vehiculos?.length?rec.vehiculos.map(v=>({patente:v.patente||"",marca:v.marca||"",color:v.color||"",esVisita:v.esVisita||"no",nombreVisita:v.nombreVisita||"",telefonoVisita:""})):[{patente:"",marca:"",color:"",esVisita:"no",nombreVisita:"",telefonoVisita:""}]}));
    setErrors({});setStep(1);
  };

  const validateStep=s=>{
    const e={};
    if(s===1){
      if(!form.nombre.trim())e.nombre="Requerido";
      if(!form.rut?.trim())e.rut="Requerido para verificar identidad";
      if(!form.tipoResidente)e.tipoResidente="Selecciona una opción";
      if(form.telefono){const err=validarTelefono(form.telefono);if(err)e.telefono=err;}
      if(!form.carnetFrontal)e.carnetFrontal="Debes adjuntar foto frontal del carnet";
      if(!form.carnetTrasero)e.carnetTrasero="Debes adjuntar foto trasera del carnet";
    }
    if(s===2){
      if(!form.usoEstacionamiento)e.usoEstacionamiento="Selecciona una opción";
      if(form.usoEstacionamiento==="ceder_largo"){
        if(!form.nombreCedido?.trim())e.nombreCedido="Requerido";
        if(!form.emailCedido?.trim())e.emailCedido="Requerido";
        if(!form.telefonoCedido?.trim())e.telefonoCedido="Requerido";
        else{const err=validarTelefono(form.telefonoCedido);if(err)e.telefonoCedido=err;}
        if(!form.docCedido)e.docCedido="Debes adjuntar el documento de autorización";
      }
    }
    if(s===3)form.vehiculos.forEach((v,i)=>{if(!v.patente.trim())e[`pat_${i}`]="Ingresa la patente";});
    return e;
  };

  const next=()=>{
    const e=validateStep(step);
    if(Object.keys(e).length){setErrors(e);return;}
    if(step===1)setStep(2);
    else if(step===2)setStep(3);
    else if(step===3)guardar();
  };

  const [guardando,setGuardando]=useState(false);
  const guardar=async()=>{
    if(!found||guardando)return;
    const veh=form.vehiculos.filter(v=>v.patente.trim());
    const data={
      nombre:form.nombre,rut:form.rut,email:form.email,telefono:form.telefono,
      tipoResidente:form.tipoResidente,usoEstacionamiento:form.usoEstacionamiento,
      vehiculos:veh,patentes:veh.map(v=>v.patente.toUpperCase().replace(/[^A-Z0-9]/g,"")),
      ...(form.usoEstacionamiento==="ceder_largo"?{
        nombreCedido:form.nombreCedido||"",rutCedido:form.rutCedido||"",
        emailCedido:form.emailCedido||"",telefonoCedido:form.telefonoCedido||"",
        torreCedido:form.torreCedido||"",deptoCedido:form.deptoCedido||"",
        estadoPrestamo:"pendiente",
        fechaInicioP:new Date().toISOString().split("T")[0],
        fechaVencP:new Date(Date.now()+180*24*60*60*1000).toISOString().split("T")[0]
      }:{}),
      updatedAt:new Date().toISOString(),
      ...(isEditing?{}:{estadoRegistro:"pendiente",fechaRegistro:new Date().toISOString().split("T")[0]})
    };
    setGuardando(true);
    const g=await apiCodigo({accion:"parking_guardar",email:acc.correo.trim().toLowerCase(),sesion:acc.sesion,spotId:found.id,torre:found.torre,depto:found.depto,registro:data}).catch(()=>({ok:false,error:"Sin conexión"}));
    setGuardando(false);
    if(!g.ok){showToast("⚠️ "+(g.error||"No se pudo guardar el registro")+(g.faltan?.length?": "+g.faltan.join(", "):""),"info");return;}
    setLocal(r=>({...r,[found.id]:g.publico}));
    const usoL={uso_exclusivo:"Uso exclusivo",visitas:"Para visitas",ceder_largo:"Préstamo largo plazo",sin_uso:"Sin uso"};
    const fechaStr=new Date().toLocaleString("es-CL");
    const resumen=`Estacionamiento #${found.id} · ${SECTOR_NAMES[found.sector]}
Torre: ${TORRES_LABELS[found.torre]||found.torre} · Depto: ${found.depto}
Residente registrado: ${form.nombre}
RUT declarado: ${form.rut||"—"}
Tipo residente: ${form.tipoResidente||"—"}
Teléfono: ${form.telefono||"—"}
Uso: ${usoL[form.usoEstacionamiento]||form.usoEstacionamiento}
Patentes: ${veh.map(v=>v.patente).join(", ")||"—"}${form.usoEstacionamiento==="ceder_largo"?`

PRÉSTAMO DEL ESTACIONAMIENTO
Se presta a: ${form.nombreCedido||"—"}
RUT beneficiario: ${form.rutCedido||"—"}
Unidad beneficiario: ${TORRES_LABELS[form.torreCedido]||form.torreCedido||"—"} · Depto: ${form.deptoCedido||"—"}
Correo beneficiario: ${form.emailCedido||"—"}
Teléfono beneficiario: ${form.telefonoCedido||"—"}
Estado del préstamo: Pendiente de aprobación por administración`:""}
Fecha registro: ${fechaStr}
Estado: Pendiente de visado por administración`;
    const emailParams={
      nombre:form.nombre,
      torre:TORRES_LABELS[found.torre]||found.torre,
      depto:found.depto,
      estac_id:found.id,
      patentes:veh.map(v=>v.patente).join(", ")||"—",
      telefono:form.telefono||"—",
      uso:usoL[form.usoEstacionamiento]||form.usoEstacionamiento,
      fecha:fechaStr,
      sector:SECTOR_NAMES[found.sector],
      email_residente:form.email||"",
      rut_declarado:form.rut||"—",
      tipo_residente:form.tipoResidente||"—",
      adjunta_carnet:form.carnetFrontal?"Sí (adjunto)":"No adjuntó",
      resumen_registro:resumen,
      estado:"⏳ Pendiente de aprobación por administración",
    };
    const cuerpoComprobante=`COMPROBANTE DE REGISTRO — PENDIENTE DE VISADO
=============================================
${resumen}

📸 Documentos adjuntos:
- Cédula frontal: ${form.carnetFrontal?form.carnetFrontal.name:"No adjuntada"}
- Cédula trasera: ${form.carnetTrasero?form.carnetTrasero.name:"No adjuntada"}${form.usoEstacionamiento==="ceder_largo"?`\n- Autorización de préstamo firmada: ${form.docCedido?form.docCedido.name:"No adjuntada"}`:""}

Este registro debe ser aprobado por la administración.
Una vez visado, recibirás un correo de confirmación.`;
    // Comprobante con la cédula: el servidor lo envía al residente y a la administración,
    // y compara el RUT declarado con el padrón (el resultado solo lo ve la administración)
    sendComprobante({
      datos:{
        to_email:form.email?.trim()||"",
        nombre:form.nombre,estac_id:found.id,
        torre:found.torre,depto:found.depto,
        rut:form.rut||"",tipo_residente:form.tipoResidente||"",
        es_edicion:isEditing,
        cuerpo:cuerpoComprobante,
      },
      archivos:[
        form.carnetFrontal&&{file:form.carnetFrontal,etiqueta:"cedula_frontal"},
        form.carnetTrasero&&{file:form.carnetTrasero,etiqueta:"cedula_trasera"},
        form.usoEstacionamiento==="ceder_largo"&&form.docCedido&&{file:form.docCedido,etiqueta:"autorizacion_prestamo"},
      ].filter(Boolean),
    }).then(ok=>{ if(!ok) showToast("El registro se guardó, pero no se pudo enviar el comprobante por correo"); });
    // Historial
    addHistorial(found.id, isEditing?"Modificación":"Registro inicial",
      `${form.nombre} · Patentes: ${veh.map(v=>v.patente).join(", ")||"—"} · Uso: ${usoL[form.usoEstacionamiento]||"—"}`
    );
    setStep(4);showToast("Registro guardado correctamente");
  };

  const resetForm=()=>{setFormState({...emptyForm(),email:acc.correo.trim().toLowerCase()});setFound(null);setStep(acc.sesion?0:"correo");setErrors({});setIsEditing(false);setEmailInput("");};
  const addVehiculo=()=>{if(form.vehiculos.length<5)setFormState(f=>({...f,vehiculos:[...f.vehiculos,{patente:"",marca:"",color:"",esVisita:"no",nombreVisita:"",telefonoVisita:""}]}));};
  const updateVeh=(i,k,v)=>{setFormState(f=>({...f,vehiculos:f.vehiculos.map((x,j)=>j===i?{...x,[k]:k==="patente"?v.toUpperCase():v}:x)}));setErrors(e=>({...e,[`pat_${i}`]:""}));};
  const removeVeh=i=>setFormState(f=>({...f,vehiculos:f.vehiculos.filter((_,j)=>j!==i)}));

  const sc=found?SC[found.sector]:null;
  const deptosFiltrados=form.torre?DEPTOS_ALL.filter(d=>BY_TD[`${form.torre}-${d}`]&&acc.unidades.some(u=>u.unidad===`${form.torre}-${d}`)):[];
  const STEPS=["Dirección","Identificación","Uso","Vehículos"];
  const stepNum=typeof step==="number"?step:0;

  const radioBtn=(fk,val,label)=>(
    <label key={val} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 14px",borderRadius:9,border:`1.5px solid ${form[fk]===val?"#2563eb":"#e2e8f0"}`,background:form[fk]===val?"#eff6ff":"white",cursor:"pointer",marginBottom:7}} onClick={()=>setF(fk,val)}>
      <div style={{width:17,height:17,borderRadius:"50%",border:"2px solid",marginTop:1,flexShrink:0,borderColor:form[fk]===val?"#2563eb":"#cbd5e1",background:form[fk]===val?"#2563eb":"white",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {form[fk]===val&&<div style={{width:6,height:6,borderRadius:"50%",background:"white"}}/>}
      </div>
      <span style={{fontSize:13,color:form[fk]===val?"#1d4ed8":"#374151",fontWeight:form[fk]===val?600:400,lineHeight:1.4}}>{label}</span>
    </label>
  );

  return (
    <div style={{minHeight:"100vh",background:"#eef2f7",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"white",padding:"16px 20px 0",boxShadow:"0 6px 24px rgba(37,99,235,.4)",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:640,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <button onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",color:"white",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:16,fontWeight:600}}>←</button>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:600,opacity:0.7,textTransform:"uppercase",letterSpacing:1}}>Residente</div>
              <div style={{fontSize:20,fontWeight:900,letterSpacing:-0.4}}>🏠 Mi Estacionamiento</div>
            </div>
          </div>
          <div style={{display:"flex",gap:2,background:"rgba(0,0,0,.2)",borderRadius:10,padding:3}}>
            {[["form","📝","Ingresar Datos"],["query","🔍","Consultar"]].map(([k,icon,label])=>(
              <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"9px 6px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===k?"white":"transparent",color:tab===k?"#1d4ed8":"rgba(255,255,255,.7)",display:"flex",alignItems:"center",justifyContent:"center",gap:5,boxShadow:tab===k?"0 2px 8px rgba(0,0,0,.15)":"none"}}>
                <span>{icon}</span><span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",padding:"20px 16px"}}>
        {tab==="form"&&(
          <div>
            {typeof step==="number"&&step>=1&&step<=3&&(
              <div style={{display:"flex",alignItems:"center",marginBottom:20}}>
                {STEPS.slice(1).map((s,i)=>{
                  const idx=i+1,done=stepNum>idx,active=stepNum===idx;
                  return <div key={s} style={{display:"flex",alignItems:"center",flex:1}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
                      <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,background:done||active?"#2563eb":"#e2e8f0",color:done||active?"white":"#94a3b8",boxShadow:active?"0 0 0 4px rgba(37,99,235,.2)":"none"}}>{done?"✓":idx}</div>
                      <span style={{fontSize:9,color:active?"#1d4ed8":done?"#64748b":"#94a3b8",fontWeight:active?700:400,marginTop:3,textTransform:"uppercase",letterSpacing:0.3}}>{s}</span>
                    </div>
                    {i<2&&<div style={{height:2,flex:1,background:done?"#2563eb":"#e2e8f0",marginBottom:16}}/>}
                  </div>;
                })}
              </div>
            )}

            {step==="correo"&&(
              <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                <h2 style={{margin:"0 0 6px",fontSize:17,fontWeight:800,color:"#0f172a"}}>Ingresa con tu correo</h2>
                <p style={{margin:"0 0 16px",fontSize:13,color:"#64748b",lineHeight:1.5}}>Usa el correo con que figuras en el <b>Registro de Copropietarios</b>. Te enviaremos un código para confirmar que eres tú.</p>
                {!acc.sesion&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <input type="email" value={acc.correo} disabled={acc.enviado} onChange={e=>setAcc(a=>({...a,correo:e.target.value,error:""}))} placeholder="correo@ejemplo.com"
                    style={{padding:"11px 12px",borderRadius:9,fontSize:14,border:"1.5px solid #e2e8f0",outline:"none",fontFamily:"inherit",background:acc.enviado?"#f8fafc":"white"}}/>
                  {acc.enviado&&<input inputMode="numeric" maxLength={6} value={acc.codigo} onChange={e=>setAcc(a=>({...a,codigo:e.target.value.replace(/\D/g,""),error:""}))} placeholder="Código de 6 dígitos"
                    style={{padding:"11px 12px",borderRadius:9,fontSize:18,letterSpacing:4,textAlign:"center",border:"1.5px solid #e2e8f0",outline:"none",fontFamily:"monospace"}}/>}
                  {acc.aviso&&<div style={{fontSize:12,color:"#166534",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 10px"}}>{acc.aviso}</div>}
                  {acc.error&&<div style={{fontSize:12,color:"#9f1239",background:"#fff1f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 10px",whiteSpace:"pre-wrap"}}>{acc.error}{/Registro de Copropietarios/.test(acc.error)&&<><br/><a href="https://com12norte.github.io/administracion-edificio/copropietario.html" target="_blank" rel="noreferrer" style={{color:"#1e40af",fontWeight:700}}>Ir al Registro de Copropietarios →</a></>}</div>}
                  <button disabled={acc.cargando||(acc.enviado&&acc.codigo.length!==6)} onClick={acc.enviado?validarCodigo:pedirCodigo}
                    style={{padding:"12px",borderRadius:10,border:"none",background:"#1e40af",color:"white",fontWeight:700,fontSize:14,cursor:"pointer",opacity:acc.cargando?0.6:1}}>
                    {acc.cargando?"Un momento…":acc.enviado?"Confirmar código":"Enviarme el código"}</button>
                  {acc.enviado&&<button onClick={()=>setAcc(a=>({...a,enviado:false,codigo:"",aviso:"",error:""}))} style={{background:"none",border:"none",color:"#64748b",fontSize:12,cursor:"pointer"}}>Usar otro correo</button>}
                </div>}
                {acc.sesion&&(acc.unidades.length
                  ?<div>
                    <div style={{fontSize:13,color:"#166534",marginBottom:10}}>✅ Correo confirmado. Unidades a tu nombre en el registro:</div>
                    {acc.unidades.map(u=>(<div key={u.unidad} style={{fontSize:13,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>{TORRES_LABELS[u.unidad.split("-")[0]]||u.unidad} · depto {u.unidad.split("-")[1]} <span style={{color:"#64748b"}}>({u.rol==="propietario"?"propietario":"residente"})</span>{u.faltan.length?<span style={{color:"#b45309"}}> · faltan documentos</span>:null}</div>))}
                    <button onClick={()=>setStep(0)} style={{marginTop:14,width:"100%",padding:"12px",borderRadius:10,border:"none",background:"#1e40af",color:"white",fontWeight:700,fontSize:14,cursor:"pointer"}}>Continuar →</button>
                  </div>
                  :<div style={{fontSize:13,color:"#9f1239"}}>Tu correo está en el registro, pero su unidad no tiene estacionamiento asignado. Escribe a com12norte@gmail.com.</div>)}
              </div>
            )}
            {step===0&&(
              <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                <h2 style={{margin:"0 0 6px",fontSize:17,fontWeight:800,color:"#0f172a"}}>Dirección de tu unidad</h2>
                <p style={{margin:"0 0 20px",fontSize:13,color:"#64748b",lineHeight:1.5}}>Selecciona tu dirección para identificar tu estacionamiento.</p>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>1. Dirección / Torre <span style={{color:"#e53e3e"}}>*</span></label>
                    <select value={form.torre} onChange={e=>{setF("torre",e.target.value);setF("depto","");}}
                      style={{width:"100%",padding:"11px 12px",borderRadius:9,fontSize:14,fontWeight:600,border:"1.5px solid #e2e8f0",background:"white",outline:"none",cursor:"pointer",fontFamily:"monospace"}}>
                      <option value="">— Selecciona la dirección —</option>
                      {TORRES.filter(t=>acc.unidades.some(u=>u.unidad.startsWith(t+"-"))).map(t=><option key={t} value={t}>{TORRES_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>2. Letra / Block <span style={{color:"#e53e3e"}}>*</span></label>
                    <select value={form.depto} onChange={e=>setF("depto",e.target.value)} disabled={!form.torre}
                      style={{width:"100%",padding:"11px 12px",borderRadius:9,fontSize:14,fontWeight:600,border:`1.5px solid ${errors.lookup?"#e53e3e":"#e2e8f0"}`,background:form.torre?"white":"#f8fafc",outline:"none",cursor:form.torre?"pointer":"not-allowed",fontFamily:"monospace"}}>
                      <option value="">— Selecciona letra/block —</option>
                      {deptosFiltrados.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                    {errors.lookup&&(
                      <div style={{marginTop:8,padding:"14px 16px",borderRadius:10,background:"#fff1f2",border:"1.5px solid #fecaca"}}>
                        {(errors.lookup.startsWith("UNIDAD NO REGISTRADA")||errors.lookup.startsWith("DOCUMENTACIÓN INCOMPLETA"))
                          ? <div>
                              <div style={{fontWeight:700,color:"#9f1239",fontSize:13,marginBottom:8}}>⚠️ {errors.lookup.startsWith("DOCUMENTACIÓN")?"Documentación incompleta":"Unidad no registrada en el padrón de copropietarios"}</div>
                              {errors.lookup.split("\n").slice(1).map((line,i)=>{
                                if(!line.trim())return null;
                                const titulo=/^(Documentos pendientes|Si la unidad está arrendada|Si usted arrienda)/.test(line);
                                const vineta=line.trim().startsWith("•");
                                const estilo={margin:titulo?"10px 0 4px":"4px 0",fontSize:12,color:titulo?"#9f1239":"#374151",fontWeight:titulo?700:400,paddingLeft:vineta?8:0};
                                if(line.includes("https://forms.gle")){
                                  const url=line.match(/https:\/\/\S+/)?.[0]||"";
                                  const texto=line.replace(url,"").replace(/[:\s]+$/,"");
                                  return <p key={i} style={estilo}>
                                    {texto&&!/^Complete su registro/.test(texto)?<>{texto}: </>:null}
                                    <a href={url} target="_blank" rel="noreferrer"
                                       style={{color:"#0F2557",fontWeight:700,textDecoration:"underline"}}>
                                      📝 {texto&&!/^Complete su registro/.test(texto)?"abrir formulario":"Completar registro de copropietarios aquí"}
                                    </a>
                                  </p>;
                                }
                                if(line.includes("com12norte@gmail.com")){
                                  const [antes,despues]=line.split("com12norte@gmail.com");
                                  return <p key={i} style={estilo}>{antes}<a href="mailto:com12norte@gmail.com" style={{color:"#0F2557",fontWeight:700}}>com12norte@gmail.com</a>{despues}</p>;
                                }
                                return <p key={i} style={estilo}>{line}</p>;
                              })}
                            </div>
                          : <span style={{fontSize:12,color:"#e53e3e"}}>{errors.lookup}</span>
                        }
                      </div>
                    )}
                  </div>
                </div>
                {form.torre&&form.depto&&BY_TD[`${form.torre}-${form.depto}`]&&(()=>{
                  const prev=BY_TD[`${form.torre}-${form.depto}`],sc0=SC[prev.sector];
                  return <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{padding:"12px 16px",borderRadius:10,background:sc0.accent+"18",border:`1.5px solid ${sc0.accent}40`,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:44,height:44,borderRadius:10,background:sc0.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:900,fontSize:14,color:sc0.accent}}>#{prev.id}</div>
                      <div><div style={{fontSize:11,color:sc0.spotOcc,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Estacionamiento asignado ✓</div><div style={{fontSize:13,color:"#0f172a",fontWeight:600}}>{SECTOR_NAMES[prev.sector]}</div></div>
                    </div>
                  </div>;
                })()}
                <button onClick={handleLookup} disabled={verificando} style={{width:"100%",marginTop:20,padding:"13px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:15,cursor:"pointer",boxShadow:"0 4px 14px rgba(37,99,235,.35)"}}>{verificando?"Verificando padrón…":"Continuar →"}</button>
              </div>
            )}

            {step==="verify"&&found&&(()=>{
              const sc0=SC[found.sector],rec=records[found.id];
              return <div style={{background:"white",borderRadius:16,overflow:"hidden",boxShadow:"0 4px 20px rgba(0,0,0,.08)"}}>
                <div style={{background:sc0.bg,padding:"20px 24px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:14}}>
                    <div style={{width:52,height:52,borderRadius:12,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontSize:18,fontWeight:900,color:sc0.accent,flexShrink:0}}>#{found.id}</div>
                    <div>
                      <div style={{fontSize:11,color:sc0.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Registro existente encontrado</div>
                      <div style={{fontSize:14,color:"white",fontWeight:700}}>{SECTOR_NAMES[found.sector]}</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Torre {found.torre} · {found.depto}</div>
                    </div>
                  </div>
                </div>
                <div style={{padding:"22px"}}>
                  <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"12px 16px",marginBottom:20,display:"flex",gap:10}}>
                    <span style={{fontSize:18}}>ℹ️</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#166534",marginBottom:3}}>Esta unidad ya tiene un registro</div>
                      <div style={{fontSize:12,color:"#15803d",lineHeight:1.5}}>Registrado a nombre de <strong>{rec?.nombre||"un residente"}</strong>. Para modificar, verifica tu identidad.</div>
                    </div>
                  </div>
                  <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:8}}>Correo electrónico registrado</label>
                  <input type="email" value={emailInput} onChange={e=>{setEmailInput(e.target.value);setErrors(er=>({...er,emailVerify:""}));}} placeholder="correo@ejemplo.com"
                    style={{width:"100%",padding:"12px 14px",borderRadius:10,fontSize:14,border:`1.5px solid ${errors.emailVerify?"#e53e3e":"#e2e8f0"}`,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"#f8fafc"}}/>
                  {errors.emailVerify&&<div style={{marginTop:8,padding:"10px 14px",borderRadius:8,background:"#fff5f5",border:"1px solid #fecaca",fontSize:12,color:"#dc2626"}}>⚠️ {errors.emailVerify}</div>}
                  <button onClick={handleEmailVerify} disabled={verificandoCorreo} style={{width:"100%",marginTop:14,padding:"13px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>{verificandoCorreo?"Verificando…":"Verificar y Editar →"}</button>
                  <button onClick={()=>{setStep(0);setFound(null);setIsEditing(false);}} style={{width:"100%",marginTop:8,padding:"10px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:12,cursor:"pointer"}}>← Volver</button>
                </div>
              </div>;
            })()}

            {step===1&&(
              <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                {sc&&<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:sc.bg,marginBottom:20}}>
                  <div style={{fontFamily:"monospace",fontWeight:900,fontSize:18,color:sc.accent}}>#{found.id}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{SECTOR_NAMES[found.sector]} · Torre {found.torre} · {found.depto}</div>
                </div>}
                <h2 style={{margin:"0 0 16px",fontSize:16,fontWeight:800,color:"#0f172a"}}>Bloque 1: Identificación del Residente</h2>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:8}}>3. ¿Usted es? <span style={{color:"#e53e3e"}}>*</span></label>
                    {errors.tipoResidente&&<span style={{fontSize:10,color:"#e53e3e",display:"block",marginBottom:6}}>{errors.tipoResidente}</span>}
                    {radioBtn("tipoResidente","propietario_residente","Propietario residente")}
                    {radioBtn("tipoResidente","propietario_arriendo","Propietario no residente (arrienda)")}
                    {radioBtn("tipoResidente","arrendatario","Arrendatario / Ocupante")}
                  </div>
                  {[["nombre","4. Nombre completo","Ej: Juan Pérez González","text",true],["rut","5. RUT / DNI","Ej: 12.345.678-9","text",true],["email","6. Correo electrónico","correo@ejemplo.com","email",false],["telefono","7. Teléfono","+56 9 1234 5678","tel",false]].map(([k,lbl,ph,type,req])=>(
                    <div key={k} style={{display:"flex",flexDirection:"column",gap:4}}>
                      <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5}}>{lbl}{req&&<span style={{color:"#e53e3e"}}> *</span>}</label>
                      <input type={type} value={form[k]} onChange={e=>setF(k,e.target.value)} placeholder={ph} readOnly={k==="email"&&!!acc.sesion}
                        style={{padding:"10px 12px",borderRadius:9,fontSize:13,border:`1.5px solid ${errors[k]?"#e53e3e":"#e2e8f0"}`,outline:"none",fontFamily:"inherit",background:"white"}}/>
                      {errors[k]&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors[k]}</span>}
                    </div>
                  ))}
                  {/* Carnet de identidad — verificación de identidad */}
                  <div style={{background:"#fffbeb",borderRadius:12,padding:14,border:"1.5px solid #fde68a"}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                      🪪 Verificación de identidad — Cédula de identidad <span style={{color:"#e53e3e"}}>*</span>
                    </div>
                    <div style={{fontSize:11,color:"#78350f",marginBottom:12,lineHeight:1.4}}>
                      Para confirmar que eres el titular del estacionamiento, adjunta fotos de tu cédula de identidad. Los datos serán revisados por la administración al aprobar el registro.
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:4}}>CARA FRONTAL <span style={{color:"#e53e3e"}}>*</span></label>
                        <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"12px 8px",borderRadius:8,border:`2px dashed ${errors.carnetFrontal?"#e53e3e":form.carnetFrontal?"#16a34a":"#d97706"}`,background:form.carnetFrontal?"#f0fdf4":"white",cursor:"pointer",gap:4,minHeight:70}}>
                          <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)setF("carnetFrontal",f);}}/>
                          <span style={{fontSize:18}}>{form.carnetFrontal?"✅":"📷"}</span>
                          <span style={{fontSize:10,fontWeight:600,color:form.carnetFrontal?"#16a34a":"#92400e",textAlign:"center"}}>{form.carnetFrontal?form.carnetFrontal.name.slice(0,20):"Foto frontal"}</span>
                        </label>
                        {errors.carnetFrontal&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors.carnetFrontal}</span>}
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",display:"block",marginBottom:4}}>CARA TRASERA <span style={{color:"#e53e3e"}}>*</span></label>
                        <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"12px 8px",borderRadius:8,border:`2px dashed ${errors.carnetTrasero?"#e53e3e":form.carnetTrasero?"#16a34a":"#d97706"}`,background:form.carnetTrasero?"#f0fdf4":"white",cursor:"pointer",gap:4,minHeight:70}}>
                          <input type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)setF("carnetTrasero",f);}}/>
                          <span style={{fontSize:18}}>{form.carnetTrasero?"✅":"📷"}</span>
                          <span style={{fontSize:10,fontWeight:600,color:form.carnetTrasero?"#16a34a":"#92400e",textAlign:"center"}}>{form.carnetTrasero?form.carnetTrasero.name.slice(0,20):"Foto trasera"}</span>
                        </label>
                        {errors.carnetTrasero&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors.carnetTrasero}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:10,marginTop:20}}>
                  <button onClick={()=>setStep(0)} style={{padding:"11px 20px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:13,cursor:"pointer"}}>← Atrás</button>
                  <button onClick={next} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Continuar →</button>
                </div>
              </div>
            )}

            {step===2&&(
              <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                {sc&&<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:sc.bg,marginBottom:20}}>
                  <div style={{fontFamily:"monospace",fontWeight:900,fontSize:18,color:sc.accent}}>#{found.id}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{SECTOR_NAMES[found.sector]} · Torre {found.torre} · {found.depto}</div>
                </div>}
                <h2 style={{margin:"0 0 6px",fontSize:16,fontWeight:800,color:"#0f172a"}}>Bloque 2: Uso del Espacio</h2>
                <p style={{margin:"0 0 16px",fontSize:13,color:"#64748b"}}>7. ¿Cómo será utilizado el estacionamiento?</p>
                {errors.usoEstacionamiento&&<span style={{fontSize:10,color:"#e53e3e",display:"block",marginBottom:8}}>{errors.usoEstacionamiento}</span>}
                {radioBtn("usoEstacionamiento","uso_exclusivo","Uso exclusivo para vehículo(s) del residente.")}
                {radioBtn("usoEstacionamiento","visitas","Se utilizará principalmente para visitas.")}
                {radioBtn("usoEstacionamiento","ceder_largo","Préstamo permanente a otro comunero (requiere autorización del administrador).")}
                {radioBtn("usoEstacionamiento","sin_uso","No tengo vehículo ni lo usaré por ahora.")}
                {form.usoEstacionamiento==="ceder_largo"&&(
                  <div style={{marginTop:16,padding:16,borderRadius:12,background:"#f0f9ff",border:"1.5px solid #bae6fd"}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#0369a1",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span>🤝 Datos del comunero beneficiario</span>
                      <a href="/declaracion-autorizacion.docx" download style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,background:"#0369a1",color:"white",fontSize:10,fontWeight:700,textDecoration:"none"}}>
                        📄 Descargar declaración
                      </a>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {/* Nombre */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}}>Nombre completo <span style={{color:"#e53e3e"}}>*</span></label>
                        <input value={form.nombreCedido||""} onChange={e=>setF("nombreCedido",e.target.value)} placeholder="Ej: María González"
                          style={{width:"100%",padding:"9px 12px",borderRadius:8,fontSize:13,border:`1.5px solid ${errors.nombreCedido?"#e53e3e":"#bae6fd"}`,outline:"none",fontFamily:"inherit",background:"white",boxSizing:"border-box"}}/>
                        {errors.nombreCedido&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors.nombreCedido}</span>}
                      </div>
                      {/* RUT */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}}>RUT del beneficiario <span style={{color:"#e53e3e"}}>*</span></label>
                        <input value={form.rutCedido||""} onChange={e=>setF("rutCedido",e.target.value)} placeholder="Ej: 12.345.678-9"
                          style={{width:"100%",padding:"9px 12px",borderRadius:8,fontSize:13,border:`1.5px solid ${errors.rutCedido?"#e53e3e":"#bae6fd"}`,outline:"none",fontFamily:"monospace",background:"white",boxSizing:"border-box"}}/>
                        {errors.rutCedido&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors.rutCedido}</span>}
                      </div>
                      {/* Correo */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}}>Correo electrónico <span style={{color:"#e53e3e"}}>*</span></label>
                        <input type="email" value={form.emailCedido||""} onChange={e=>setF("emailCedido",e.target.value)} placeholder="correo@ejemplo.com"
                          style={{width:"100%",padding:"9px 12px",borderRadius:8,fontSize:13,border:`1.5px solid ${errors.emailCedido?"#e53e3e":"#bae6fd"}`,outline:"none",fontFamily:"inherit",background:"white",boxSizing:"border-box"}}/>
                        {errors.emailCedido&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors.emailCedido}</span>}
                      </div>
                      {/* Teléfono */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}}>Teléfono <span style={{color:"#e53e3e"}}>*</span></label>
                        <div style={{display:"flex",alignItems:"center",border:`1.5px solid ${errors.telefonoCedido?"#e53e3e":"#bae6fd"}`,borderRadius:8,background:"white",overflow:"hidden"}}>
                          <span style={{padding:"9px 10px",fontSize:13,color:"#475569",background:"#f0f9ff",borderRight:"1px solid #bae6fd",fontWeight:600,whiteSpace:"nowrap"}}>+56</span>
                          <input value={form.telefonoCedido||""} onChange={e=>setF("telefonoCedido",e.target.value.replace(/[^0-9]/g,"").slice(0,9))} placeholder="9 1234 5678"
                            style={{flex:1,padding:"9px 12px",fontSize:13,border:"none",outline:"none",fontFamily:"inherit"}}/>
                        </div>
                        {errors.telefonoCedido&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors.telefonoCedido}</span>}
                      </div>
                      {/* Torre y Depto — selectores del sistema */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Depto / unidad del beneficiario <span style={{color:"#e53e3e"}}>*</span></label>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <div>
                            <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:4}}>Torre</label>
                            <select value={form.torreCedido||""} onChange={e=>{setF("torreCedido",e.target.value);setF("deptoCedido","");}}
                              style={{width:"100%",padding:"9px 12px",borderRadius:8,fontSize:13,border:`1.5px solid ${errors.torreCedido?"#e53e3e":"#bae6fd"}`,outline:"none",background:"white",boxSizing:"border-box"}}>
                              <option value="">Seleccionar...</option>
                              {[...new Set(SPOTS_DATA.map(s=>s.torre))].sort().map(t=>(
                                <option key={t} value={t}>Torre {t}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{fontSize:10,color:"#64748b",display:"block",marginBottom:4}}>Depto</label>
                            <select value={form.deptoCedido||""} onChange={e=>{setF("deptoCedido",e.target.value);setErrors(er=>({...er,torreCedido:""}));}}
                              disabled={!form.torreCedido}
                              style={{width:"100%",padding:"9px 12px",borderRadius:8,fontSize:13,border:`1.5px solid ${errors.torreCedido?"#e53e3e":"#bae6fd"}`,outline:"none",background:form.torreCedido?"white":"#f8fafc",boxSizing:"border-box"}}>
                              <option value="">Seleccionar...</option>
                              {[...new Set(SPOTS_DATA.filter(s=>s.torre===form.torreCedido).map(s=>s.depto))].sort().map(d=>(
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {errors.torreCedido&&<span style={{fontSize:10,color:"#e53e3e",display:"block",marginTop:2}}>{errors.torreCedido}</span>}
                      </div>
                      {/* Declaración simple generada automáticamente */}
                      {form.nombreCedido&&form.rutCedido&&form.torreCedido&&form.deptoCedido&&(
                        <div style={{background:"white",border:"1.5px solid #bae6fd",borderRadius:10,padding:16,fontSize:12,color:"#1e293b",lineHeight:1.7}}>
                          <div style={{textAlign:"center",fontWeight:800,fontSize:13,marginBottom:12,color:"#0369a1"}}>📋 Declaración simple</div>
                          <div style={{fontSize:10,color:"#64748b",textAlign:"center",marginBottom:12}}>Generada automáticamente con tus datos. Revisa antes de confirmar.</div>
                          <p style={{margin:"0 0 10px"}}>Yo, <strong>{form.nombre||"__________________"}</strong>, RUT <strong>{form.rut||"__________________"}</strong>, residente del departamento <strong>{found?.depto||"___"}</strong>, Torre <strong>{found?.torre||"___"}</strong>, declaro que cedo el uso de mi espacio de estacionamiento N° <strong>#{found?.id||"__"}</strong> al señor/señora <strong>{form.nombreCedido}</strong>, RUT <strong>{form.rutCedido}</strong>, residente del departamento <strong>{form.deptoCedido}</strong>, Torre <strong>{form.torreCedido}</strong>.</p>
                          <p style={{margin:"0 0 10px"}}>Declaro que el cedente y cesionario son residentes del Condominio 12 Norte, Viña del Mar, y que dicha cesión no implica arrendamiento ni transacción económica alguna, cumpliendo con lo establecido en el Reglamento de Copropiedad.</p>
                          <p style={{margin:"0 0 16px"}}>Ambas partes quedan exentas de responsabilidad frente a la administración por el uso del espacio cedido, asumiendo el beneficiario plena responsabilidad por el vehículo y su comportamiento en las dependencias del condominio.</p>
                          <div style={{borderTop:"1px solid #e2e8f0",paddingTop:14,marginTop:4}}>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,textAlign:"center"}}>
                              <div>
                                <div style={{borderBottom:"1px solid #94a3b8",marginBottom:6,paddingBottom:30}}></div>
                                <div style={{fontSize:10,color:"#475569",fontWeight:700}}>Firma del cedente</div>
                                <div style={{fontSize:10,color:"#94a3b8"}}>{form.nombre||"_______________"}</div>
                                <div style={{fontSize:10,color:"#94a3b8"}}>RUT: {form.rut||"_______________"}</div>
                              </div>
                              <div>
                                <div style={{borderBottom:"1px solid #94a3b8",marginBottom:6,paddingBottom:30}}></div>
                                <div style={{fontSize:10,color:"#475569",fontWeight:700}}>Firma del beneficiario</div>
                                <div style={{fontSize:10,color:"#94a3b8"}}>{form.nombreCedido}</div>
                                <div style={{fontSize:10,color:"#94a3b8"}}>RUT: {form.rutCedido}</div>
                              </div>
                            </div>
                            <div style={{textAlign:"center",marginTop:12,fontSize:10,color:"#94a3b8"}}>Fecha: {new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"})}</div>
                          </div>
                        </div>
                      )}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Documento de autorización <span style={{color:"#e53e3e"}}>*</span></label>
                        <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>Adjunta la declaración simple firmada.</div>
                        <label style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:9,border:`1.5px dashed ${errors.docCedido?"#e53e3e":form.docCedido?"#0ea5e9":"#bae6fd"}`,background:form.docCedido?"#e0f2fe":"white",cursor:"pointer"}}>
                          <span style={{fontSize:20}}>{form.docCedido?"📎":"📄"}</span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,fontWeight:700,color:form.docCedido?"#0369a1":"#475569"}}>{form.docCedido?form.docCedido.name:"Seleccionar archivo"}</div>
                            <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>PDF, JPG, PNG — máx. 5MB</div>
                          </div>
                          {form.docCedido&&<span style={{fontSize:18}}>✅</span>}
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}}
                            onChange={e=>{const f=e.target.files?.[0];if(f){setFormState(prev=>({...prev,docCedido:f}));setErrors(er=>({...er,docCedido:""}));}}}/>
                        </label>
                        {errors.docCedido&&<span style={{fontSize:10,color:"#e53e3e",marginTop:4,display:"block"}}>{errors.docCedido}</span>}
                      </div>
                    </div>
                  </div>
                )}
                <div style={{display:"flex",gap:10,marginTop:20}}>
                  <button onClick={()=>setStep(1)} style={{padding:"11px 20px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:13,cursor:"pointer"}}>← Atrás</button>
                  <button onClick={next} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Continuar →</button>
                </div>
              </div>
            )}

            {step===3&&(
              <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
                {sc&&<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:sc.bg,marginBottom:20}}>
                  <div style={{fontFamily:"monospace",fontWeight:900,fontSize:18,color:sc.accent}}>#{found.id}</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{SECTOR_NAMES[found.sector]} · Torre {found.torre} · {found.depto}</div>
                </div>}
                <h2 style={{margin:"0 0 6px",fontSize:16,fontWeight:800,color:"#0f172a"}}>Bloque 3: Registro de Vehículos</h2>
                <p style={{margin:"0 0 18px",fontSize:13,color:"#64748b"}}>Puedes registrar hasta 5 vehículos.</p>
                {form.vehiculos.map((v,i)=>(
                  <div key={i} style={{background:"#f8fafc",borderRadius:12,padding:16,marginBottom:12,border:"1.5px solid #e2e8f0"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>🚗 Vehículo {i+1}</span>
                      {form.vehiculos.length>1&&<button onClick={()=>removeVeh(i)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:12,fontWeight:600}}>✕ Quitar</button>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}}>Patente <span style={{color:"#e53e3e"}}>*</span></label>
                        <input value={v.patente} onChange={e=>updateVeh(i,"patente",e.target.value)} placeholder="Ej: ABCD12" maxLength={8}
                          style={{width:"100%",padding:"10px 12px",borderRadius:8,fontSize:15,fontWeight:800,border:`1.5px solid ${errors[`pat_${i}`]?"#e53e3e":"#e2e8f0"}`,outline:"none",fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",boxSizing:"border-box"}}/>
                        {errors[`pat_${i}`]&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors[`pat_${i}`]}</span>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        {[["marca","Marca","Toyota, Kia..."],["color","Color","Blanco, Negro..."]].map(([k,lbl,ph])=>(
                          <div key={k}>
                            <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:4}}>{lbl}</label>
                            <input value={v[k]} onChange={e=>updateVeh(i,k,e.target.value)} placeholder={ph}
                              style={{width:"100%",padding:"9px 11px",borderRadius:8,fontSize:13,border:"1.5px solid #e2e8f0",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                          </div>
                        ))}
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>¿Es de visita recurrente?</label>
                        <div style={{display:"flex",gap:8,marginBottom:v.esVisita==="si"?8:0}}>
                          {[["si","Sí, es visita"],["no","No, es propio"]].map(([val,label])=>(
                            <button key={val} onClick={()=>updateVeh(i,"esVisita",val)}
                              style={{flex:1,padding:"8px 12px",borderRadius:8,border:`1.5px solid ${v.esVisita===val?"#2563eb":"#e2e8f0"}`,background:v.esVisita===val?"#eff6ff":"white",color:v.esVisita===val?"#1d4ed8":"#475569",fontWeight:v.esVisita===val?700:400,fontSize:12,cursor:"pointer"}}>{label}</button>
                          ))}
                        </div>
                        {v.esVisita==="si"&&(
                          <div style={{display:"flex",flexDirection:"column",gap:8,padding:"10px 12px",borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe"}}>
                            <div style={{fontSize:10,fontWeight:700,color:"#1d4ed8"}}>Datos de la visita</div>
                            {[["nombreVisita","Nombre visita","Ej: María González"],["telefonoVisita","Teléfono visita","+56 9 ..."]].map(([k,lbl,ph])=>(
                              <div key={k}>
                                <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:3}}>{lbl}</label>
                                <input value={v[k]||""} onChange={e=>updateVeh(i,k,e.target.value)} placeholder={ph}
                                  style={{width:"100%",padding:"8px 10px",borderRadius:7,fontSize:12,border:"1.5px solid #bfdbfe",outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"white"}}/>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {form.vehiculos.length<5&&<button onClick={addVehiculo} style={{width:"100%",padding:"10px",borderRadius:10,border:"1.5px dashed #2563eb",background:"#eff6ff",color:"#2563eb",cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:4}}>+ Agregar otro vehículo</button>}
                <div style={{display:"flex",gap:10,marginTop:16}}>
                  <button onClick={()=>setStep(2)} style={{padding:"11px 20px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:13,cursor:"pointer"}}>← Atrás</button>
                  <button onClick={next} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:"#16a34a",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>✅ Enviar Registro</button>
                </div>
              </div>
            )}

            {step===4&&found&&(()=>{
              const sc4=SC[found.sector];
              const tipoL={propietario_residente:"Propietario residente",propietario_arriendo:"Propietario no residente",arrendatario:"Arrendatario"};
              const usoL={uso_exclusivo:"Uso exclusivo",visitas:"Para visitas",ceder_largo:"Préstamo largo plazo",sin_uso:"Sin uso"};
              return <div>
                <div style={{background:"white",borderRadius:16,overflow:"hidden",boxShadow:"0 4px 24px rgba(0,0,0,.08)",textAlign:"center",marginBottom:14}}>
                  <div style={{background:sc4.bg,padding:"32px 24px 24px"}}>
                    <div style={{fontSize:52,marginBottom:10}}>{isEditing?"✏️":"⏳"}</div>
                    <div style={{fontSize:20,fontWeight:900,color:"white",marginBottom:4}}>
                      {form.usoEstacionamiento==="ceder_largo"?"Solicitud enviada":(isEditing?"Registro modificado":"Registro recibido")}
                    </div>
                    <div style={{fontFamily:"monospace",fontSize:28,fontWeight:900,color:sc4.accent}}>#{found.id}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:4}}>{SECTOR_NAMES[found.sector]} · Torre {found.torre} · {found.depto}</div>
                  </div>
                  <div style={{padding:"14px 20px",background:form.usoEstacionamiento==="ceder_largo"?"#fffbeb":"#f0fdf4",borderBottom:`1px solid ${form.usoEstacionamiento==="ceder_largo"?"#fde68a":"#bbf7d0"}`,display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:20}}>{form.usoEstacionamiento==="ceder_largo"?"⏳":"🔍"}</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:form.usoEstacionamiento==="ceder_largo"?"#92400e":"#166534",marginBottom:2}}>
                        {form.usoEstacionamiento==="ceder_largo"?"Préstamo pendiente de autorización":"Registro pendiente de visado"}
                      </div>
                      <div style={{fontSize:11,color:form.usoEstacionamiento==="ceder_largo"?"#78350f":"#14532d",lineHeight:1.5}}>
                        {form.usoEstacionamiento==="ceder_largo"
                          ?"Tu solicitud fue recibida. La administración verificará el registro de copropietarios y te notificará por email al aprobar o rechazar el préstamo."
                          :"Tu registro fue recibido. La administración lo visará una vez verificado. Recibirás confirmación por email."}
                      </div>
                    </div>
                  </div>
                  <div style={{padding:"20px 24px"}}>
                    <div style={{background:"#f8fafc",borderRadius:10,padding:"14px 16px",textAlign:"left",marginBottom:16,display:"flex",flexDirection:"column",gap:8}}>
                      <SummaryRow label="Residente" value={form.nombre}/>
                      <SummaryRow label="Tipo" value={tipoL[form.tipoResidente]||form.tipoResidente}/>
                      <SummaryRow label="Vehículos" value={form.vehiculos.filter(v=>v.patente).map(v=>v.patente).join(", ")||"—"}/>
                      <SummaryRow label="Uso" value={usoL[form.usoEstacionamiento]||"—"}/>
                      {form.usoEstacionamiento==="ceder_largo"&&<SummaryRow label="Estado préstamo" value="⏳ Pendiente de autorización"/>}
                    </div>
                    <button onClick={resetForm} style={{width:"100%",padding:"12px",borderRadius:9,border:"1.5px solid #2563eb",background:"white",color:"#2563eb",fontWeight:700,fontSize:13,cursor:"pointer"}}>Registrar otra unidad</button>
                    <button onClick={()=>setReclamo({spot:found,record:records[found.id]})}
                      style={{width:"100%",marginTop:8,padding:"12px",borderRadius:9,border:"1.5px solid #ef4444",background:"#fff5f5",color:"#dc2626",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                      ⚠️ Reportar ocupación indebida
                    </button>
                  </div>
                </div>
                <div style={{background:"#1e293b",borderRadius:16,overflow:"hidden",border:`2px solid ${sc4.accent}40`}}>
                  <div style={{padding:"10px 16px",background:sc4.bg,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:12,fontWeight:700,color:sc4.accent}}>📐 Tu ubicación en el plano</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>{SECTOR_NAMES[found.sector]}</div>
                  </div>
                  <div style={{padding:10,overflowX:"auto"}}>
                    <SectorMap sectorId={found.sector} records={records} onSpotClick={()=>{}} highlightId={found.id}/>
                  </div>
                  <div style={{padding:"6px 14px 10px",display:"flex",gap:14,flexWrap:"wrap",background:"#162032"}}>
                    <Legend color="#facc15" label="Tu estacionamiento"/>
                    <Legend color={sc4.spotOcc} label="Ocupado"/>
                    <Legend color="#2d3f5a" label="Libre"/>
                  </div>
                </div>
              </div>;
            })()}
          </div>
        )}
        {tab==="query"&&<QueryTab records={records}/>}
      </div>
      {reclamo&&<ReclamoModal spot={reclamo.spot} record={reclamo.record} onClose={()=>setReclamo(null)} onSent={()=>showToast("Reclamo enviado a administración","info")}/>}
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
    </div>
  );
};

// ── SOLICITUDES (préstamos ceder_largo) ──
const loadSolicitudes = async () => {
  try {
    const data = await fsWhere("registros", "usoEstacionamiento", "ceder_largo");
    return data.map(({_id,...r})=>{
      const id=Number(_id),sp=SPOT_INFO[id]||{};
      const fecha=r.fechaInicioP||(r.updatedAt?String(r.updatedAt).split("T")[0]:"");
      return {id,...r,estacId:r.estacId||id,torreCedente:r.torreCedente||TORRES_LABELS[sp.torre]||sp.torre||"—",deptoCedente:r.deptoCedente||sp.depto||"—",
        torreCedido:TORRES_LABELS[r.torreCedido]||r.torreCedido||"—",deptoCedido:r.deptoCedido||"—",
        fechaSolicitud:r.fechaSolicitud||(fecha?new Date(fecha+"T12:00:00").toLocaleDateString("es-CL"):"")};
    }).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
  } catch(e){console.error("loadSolicitudes:",e);return [];}
};
const updateSolicitud = async (id, patch) => {
  try {
    await fsUpdate("registros", String(id), patch);
    if (patch.estadoRegistro) await fsUpdate("ocupacion", String(id), { estadoRegistro: patch.estadoRegistro });
    return true;
  }
  catch(e){console.error("updateSolicitud:",e); return false;}
};

// ── ADMINISTRADORES TAB ──
const AdminsTab = () => {
  const [admins,setAdmins]=useState([]);
  const [loading,setLoading]=useState(true);
  const [email,setEmail]=useState("");
  const [nombre,setNombre]=useState("");
  const [msg,setMsg]=useState(null);
  const [ocupado,setOcupado]=useState(false);
  const yo=normEmail(fbSession?.email);
  const cargar=()=>loadAdmins().then(a=>{setAdmins(a);setLoading(false);});
  useEffect(()=>{cargar();},[]);

  const agregar=async()=>{
    const e=normEmail(email);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){setMsg({t:"err",m:"Ingresa un correo válido."});return;}
    if(ADMIN_EMAILS.includes(e)||admins.some(a=>a.email===e)){setMsg({t:"err",m:"Ese correo ya es administrador."});return;}
    setOcupado(true);setMsg(null);
    try{
      await agregarAdmin(e,nombre);
      setMsg({t:"ok",m:`Listo. Se envió un correo a ${e} para que cree su contraseña. Después podrá ingresar en «Acceso Personal».`});
      setEmail("");setNombre("");cargar();
    }catch(x){
      const c=String(x.message||"");
      setMsg({t:"err",m:/TOO_MANY/.test(c)?"Demasiados intentos. Espera unos minutos.":/INVALID_EMAIL/.test(c)?"El correo no es válido.":`No se pudo agregar (${c}).`});
    }
    setOcupado(false);
  };
  const quitar=async(e)=>{
    if(!window.confirm(`¿Quitar a ${e} como administrador? Ya no podrá ver datos ni aprobar.`))return;
    setOcupado(true);
    try{await quitarAdmin(e);setMsg({t:"ok",m:`${e} ya no es administrador.`});cargar();}
    catch(x){setMsg({t:"err",m:"No se pudo quitar. Inténtalo de nuevo."});}
    setOcupado(false);
  };
  const reenviar=async(e)=>{
    try{await enviarRecuperacion(e);setMsg({t:"ok",m:`Se reenvió el correo de contraseña a ${e}.`});}
    catch(x){setMsg({t:"err",m:"No se pudo enviar el correo."});}
  };

  const fila=(e,sub,fijo)=>(
    <div key={e} style={{background:"#ffffff",borderRadius:12,padding:"12px 14px",marginBottom:8,border:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <div style={{minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:"#0f172a",wordBreak:"break-all"}}>{e}{e===yo&&<span style={{color:"#2563eb",fontWeight:600}}> (tú)</span>}</div>
        <div style={{fontSize:10,color:"#64748b"}}>{sub}</div>
      </div>
      <div style={{display:"flex",gap:6,flexShrink:0}}>
        <button onClick={()=>reenviar(e)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"transparent",color:"#64748b",fontSize:11,cursor:"pointer"}}>✉️ Contraseña</button>
        {!fijo&&e!==yo&&<button onClick={()=>quitar(e)} disabled={ocupado} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #fecaca",background:"transparent",color:"#b91c1c",fontSize:11,cursor:"pointer"}}>Quitar</button>}
      </div>
    </div>
  );

  const inp={width:"100%",padding:"11px 12px",borderRadius:9,fontSize:13,border:"1.5px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
  return (
    <div>
      <h3 style={{color:"#0f172a",fontSize:14,fontWeight:800,margin:"0 0 4px"}}>👥 Administradores</h3>
      <p style={{color:"#64748b",fontSize:12,margin:"0 0 10px"}}>Pueden ver los datos de los residentes, visar registros y aprobar préstamos.</p>
      <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 12px",fontSize:12,color:"#1e40af",margin:"0 0 16px",lineHeight:1.5}}>
        La lista principal de personal está en <b>CondoAdmin → Configuración → Usuarios</b>. Todo usuario activo con rol <b>Administrador</b> o <b>Administrador Edificio</b> entra aquí con su misma cuenta, sin agregarlo de nuevo. Usa esta lista solo para alguien que administre Parking y no esté en CondoAdmin.
      </div>

      <div style={{background:"#ffffff",borderRadius:14,padding:16,border:"1px solid #e2e8f0",marginBottom:18}}>
        <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Agregar administrador</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Nombre (opcional)" style={inp}/>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setMsg(null);}} onKeyDown={e=>e.key==="Enter"&&agregar()} placeholder="correo@ejemplo.com" style={inp}/>
          <button onClick={agregar} disabled={ocupado} style={{padding:"11px",borderRadius:9,border:"none",background:ocupado?"#374151":"#2563eb",color:"white",fontWeight:800,fontSize:13,cursor:ocupado?"not-allowed":"pointer"}}>
            {ocupado?"Procesando…":"Agregar y enviar invitación"}
          </button>
          <div style={{fontSize:10,color:"#64748b"}}>La persona recibirá un correo para crear su contraseña. Tú nunca la conoces.</div>
        </div>
      </div>

      {msg&&<div style={{padding:"10px 14px",borderRadius:8,marginBottom:14,fontSize:12,background:msg.t==="ok"?"#052e16":"#450a0a",border:`1px solid ${msg.t==="ok"?"#166534":"#7f1d1d"}`,color:msg.t==="ok"?"#86efac":"#fca5a5"}}>{msg.m}</div>}

      <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Principales</div>
      {ADMIN_EMAILS.map(e=>fila(e,"Administrador principal (fijo)",true))}
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,margin:"16px 0 8px"}}>Agregados</div>
      {loading?<div style={{color:"#64748b",fontSize:12,padding:10}}>Cargando…</div>
        :admins.filter(a=>!ADMIN_EMAILS.includes(a.email)).length===0
          ?<div style={{color:"#4b5563",fontSize:12,padding:10}}>Aún no hay administradores agregados.</div>
          :admins.filter(a=>!ADMIN_EMAILS.includes(a.email)).map(a=>fila(a.email,`${a.nombre?a.nombre+" · ":""}agregado por ${a.agregadoPor||"—"}${a.agregadoAt?" · "+new Date(a.agregadoAt).toLocaleDateString("es-CL"):""}`,false))}
    </div>
  );
};

// Abre en Drive las fotos de cédula guardadas para ese estacionamiento
// (se ven con la cuenta dueña de la carpeta, com12norte@gmail.com)
const VerCedula = ({id}) => (
  <a href={`https://drive.google.com/drive/search?q=${encodeURIComponent(`Estac_${id}_`)}`} target="_blank" rel="noreferrer"
    style={{display:"inline-block",marginTop:6,padding:"5px 10px",borderRadius:8,border:"1px solid #334155",color:"#93c5fd",fontSize:11,textDecoration:"none"}}>
    📎 Ver documentos (cédula y autorización)
  </a>
);

// ── SOLICITUDES TAB ──
const SolicitudesTab = ({records={},setRecords=()=>{}}) => {
  const [solis,setSolis] = useState([]);
  const [loading,setLoading] = useState(true);
  const [rechazarId,setRechazarId] = useState(null);
  const [motivo,setMotivo] = useState("");
  const [toast,setToast] = useState(null);
  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  useEffect(()=>{loadSolicitudes().then(d=>{setSolis(d);setLoading(false);});},[]);

  const aprobar = async (s) => {
    const hoy=new Date();
    const dias=Number(s.diasPrestamo)||180;
    const fechaVencP=s.fechaVencP||new Date(hoy.getTime()+dias*24*60*60*1000).toISOString().split("T")[0];
    const patch={estadoPrestamo:"activo",aprobadoAt:hoy.toISOString(),fechaInicioP:s.fechaInicioP||hoy.toISOString().split("T")[0],fechaVencP};
    const ok=await updateSolicitud(s.id,patch);
    if(!ok){showToast("⚠️ No se pudo guardar la aprobación. Revisa tu conexión e inténtalo de nuevo.","info");return;}
    setSolis(prev=>prev.map(x=>x.id===s.id?{...x,...patch}:x));
    setRecords(prev=>prev[s.id]?({...prev,[s.id]:{...prev[s.id],...patch}}):prev);
    // Notificar via GAS
    const p=new URLSearchParams({tipo:"aprobar_prestamo",idToken:(await getIdToken())||"",estac_id:String(s.estacId||s.id),
      nombre:s.nombre||"",email:s.email||"",nombreCedido:s.nombreCedido||"",emailCedido:s.emailCedido||"",
      fechaVenc:fechaVencP});
    new Image().src=GAS_URL+"?"+p.toString();
    showToast("✅ Préstamo aprobado — notificación enviada");
  };

  const rechazar = async () => {
    if(!rechazarId||!motivo.trim())return;
    const s=solis.find(x=>x.id===rechazarId);
    const patch={estadoPrestamo:"rechazado",motivoRechazo:motivo,rechazadoAt:new Date().toISOString()};
    const ok=await updateSolicitud(rechazarId,patch);
    if(!ok){showToast("⚠️ No se pudo guardar el rechazo. Revisa tu conexión e inténtalo de nuevo.","info");return;}
    setSolis(prev=>prev.map(x=>x.id===rechazarId?{...x,...patch}:x));
    setRecords(prev=>prev[rechazarId]?({...prev,[rechazarId]:{...prev[rechazarId],...patch}}):prev);
    const p=new URLSearchParams({tipo:"rechazar_prestamo",idToken:(await getIdToken())||"",estac_id:String(s?.estacId||rechazarId||""),
      nombre:s?.nombre||"",email:s?.email||"",motivo});
    new Image().src=GAS_URL+"?"+p.toString();
    setRechazarId(null);setMotivo("");
    showToast("Solicitud rechazada — residente notificado","info");
  };

  const estadoBadge=(e)=>{
    const cfg={pendiente:{bg:"#fffbeb",color:"#92400e",label:"⏳ Pendiente"},activo:{bg:"#f0fdf4",color:"#166534",label:"✅ Aprobado"},rechazado:{bg:"#fff1f2",color:"#9f1239",label:"✕ Rechazado"}};
    const c=cfg[e]||cfg.pendiente;
    return <span style={{padding:"3px 10px",borderRadius:20,background:c.bg,color:c.color,fontSize:10,fontWeight:700}}>{c.label}</span>;
  };

  if(loading)return <div style={{textAlign:"center",padding:40,color:"#64748b"}}>Cargando solicitudes...</div>;

  // Los préstamos guardados con la versión anterior no tienen estadoPrestamo: se tratan como pendientes
  const estadoDe=(s)=>s.estadoPrestamo||"pendiente";
  const pendientes=solis.filter(s=>estadoDe(s)==="pendiente");
  const resto=solis.filter(s=>estadoDe(s)!=="pendiente");

  return (
    <div>
      {toast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",padding:"10px 20px",borderRadius:10,background:toast.type==="info"?"#1e40af":"#166534",color:"white",fontWeight:700,fontSize:13,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}>{toast.msg}</div>}
      <h3 style={{color:"#0f172a",fontSize:14,fontWeight:800,margin:"0 0 4px"}}>🤝 Solicitudes de préstamo permanente</h3>
      <p style={{color:"#64748b",fontSize:12,margin:"0 0 16px"}}>Verifica que ambos comuneros estén al día en el registro antes de aprobar.</p>

      {/* Registros pendientes de visado */}
      {(()=>{
        const pendVisado=Object.entries(records).filter(([,r])=>r.estadoRegistro==="pendiente");
        if(pendVisado.length===0)return null;
        return (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:"#fb923c",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>📋 Registros pendientes de visado ({pendVisado.length})</div>
            {pendVisado.map(([id,r])=>(
              <div key={id} style={{background:"#ffffff",borderRadius:12,padding:14,marginBottom:8,border:"1.5px solid #fb923c40",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Estac. #{id} — {r.nombre||"—"}</div>
                  <div style={{fontSize:10,color:"#64748b",marginTop:2}}>Torre {TORRES_LABELS[SPOT_INFO[id]?.torre]||SPOT_INFO[id]?.torre||"—"} · {SPOT_INFO[id]?.depto||"—"} · {r.fechaRegistro||"—"}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>Patentes: {(r.patentes||[]).join(", ")||"—"}</div>
                  <VerCedula id={id}/>
                </div>
                <button onClick={async()=>{
                  await updateSolicitud(id,{estadoRegistro:"visado",fechaVisado:new Date().toISOString()});
                  setRecords(prev=>({...prev,[id]:{...prev[id],estadoRegistro:"visado",fechaVisado:new Date().toISOString()}}));
                  // Email de confirmación al residente
                  if(r.email) sendEmail({
                    to_email:r.email,
                    nombre:r.nombre||"Residente",
                    estac_id:id,
                    torre:r.torre||"—",
                    depto:r.depto||"—",
                    patentes:(r.patentes||[]).join(", ")||"—",
                    fecha:new Date().toLocaleString("es-CL"),
                    estado:"✅ REGISTRO APROBADO — Tu estacionamiento ha sido visado por la administración.",
                    resumen_registro:`Tu registro del estacionamiento #${id} fue aprobado el ${new Date().toLocaleString("es-CL")}. Patentes autorizadas: ${(r.patentes||[]).join(", ")||"—"}.`,
                    asunto_extra:`[APROBADO] Tu estacionamiento #${id} fue visado`,
                  });
                }} style={{padding:"8px 14px",borderRadius:8,border:"none",background:"#16a34a",color:"white",fontWeight:700,fontSize:11,cursor:"pointer",flexShrink:0,marginLeft:10}}>✅ Visar</button>
              </div>
            ))}
          </div>
        );
      })()}

      {pendientes.length===0&&resto.length===0&&Object.keys(records).filter(id=>records[id]?.estadoRegistro==="pendiente").length===0&&(
        <div style={{textAlign:"center",padding:40,color:"#4b5563",fontSize:13}}>No hay solicitudes registradas aún.</div>
      )}

      {pendientes.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>⏳ Pendientes de autorización ({pendientes.length})</div>
          {pendientes.map(s=>(
            <div key={s.id} style={{background:"#ffffff",borderRadius:12,padding:16,marginBottom:10,border:"1.5px solid #f59e0b40"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#0f172a"}}>Estac. #{s.estacId} — Torre {s.torreCedente} · {s.deptoCedente}</div>
                  <div style={{fontSize:10,color:"#64748b",marginTop:2}}>Solicitado: {s.fechaSolicitud||"—"}</div>
                  <VerCedula id={s.id}/>
                </div>
                {estadoBadge(s.estadoPrestamo)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div style={{background:"#f1f5f9",borderRadius:8,padding:10}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#2563eb",textTransform:"uppercase",marginBottom:6}}>Cedente</div>
                  <div style={{fontSize:12,color:"#0f172a",fontWeight:600}}>{s.nombre||"—"}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{s.email||"—"}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>Torre {s.torreCedente} · {s.deptoCedente}</div>
                </div>
                <div style={{background:"#f1f5f9",borderRadius:8,padding:10}}>
                  <div style={{fontSize:9,fontWeight:700,color:"#34d399",textTransform:"uppercase",marginBottom:6}}>Beneficiario</div>
                  <div style={{fontSize:12,color:"#0f172a",fontWeight:600}}>{s.nombreCedido||"—"}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{s.emailCedido||"—"}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>Torre {s.torreCedido} · {s.deptoCedido}</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>aprobar(s)} style={{padding:"9px",borderRadius:8,border:"none",background:"#16a34a",color:"white",fontWeight:700,fontSize:12,cursor:"pointer"}}>✅ Aprobar</button>
                <button onClick={()=>{setRechazarId(s.id);setMotivo("");}} style={{padding:"9px",borderRadius:8,border:"none",background:"#dc2626",color:"white",fontWeight:700,fontSize:12,cursor:"pointer"}}>✕ Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resto.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"#4b5563",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Historial</div>
          {resto.map(s=>(
            <div key={s.id} style={{background:"#ffffff",borderRadius:12,padding:14,marginBottom:8,border:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>Estac. #{s.estacId} — {s.nombre} → {s.nombreCedido}</div>
                <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>{s.fechaSolicitud||"—"} · Vence: {s.fechaVencP||"—"}</div>
                {s.motivoRechazo&&<div style={{fontSize:10,color:"#dc2626",marginTop:2}}>Motivo: {s.motivoRechazo}</div>}
              </div>
              {estadoBadge(s.estadoPrestamo)}
            </div>
          ))}
        </div>
      )}

      {/* Modal rechazar */}
      {rechazarId&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:20}}>
          <div style={{background:"#ffffff",borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1.5px solid #dc2626"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:12}}>✕ Rechazar solicitud</div>
            <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:6}}>Motivo del rechazo <span style={{color:"#e53e3e"}}>*</span></label>
            <textarea value={motivo} onChange={e=>setMotivo(e.target.value)} rows={3} placeholder="Ej: El beneficiario no está al día en el registro de copropietarios."
              style={{width:"100%",padding:"10px 12px",borderRadius:8,fontSize:12,border:"1.5px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
              <button onClick={()=>{setRechazarId(null);setMotivo("");}} style={{padding:"10px",borderRadius:8,border:"1.5px solid #e2e8f0",background:"transparent",color:"#64748b",fontWeight:700,fontSize:12,cursor:"pointer"}}>Cancelar</button>
              <button onClick={rechazar} disabled={!motivo.trim()} style={{padding:"10px",borderRadius:8,border:"none",background:motivo.trim()?"#dc2626":"#374151",color:"white",fontWeight:700,fontSize:12,cursor:motivo.trim()?"pointer":"not-allowed"}}>Confirmar rechazo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── STAFF ──
const StaffScreen = ({records,setRecords,onBack,integrado=false}) => {
  const [tab,setTab]=useState("verify");
  const [query,setQuery]=useState("");
  const [result,setResult]=useState(null);
  const [selectedSpot,setSelectedSpot]=useState(null);
  const [toast,setToast]=useState(null);
  const [searchList,setSearchList]=useState("");
  const [filterSector,setFilterSector]=useState("all");
  const [sortBy,setSortBy]=useState("id");
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [warningVisible,setWarningVisible]=useState(false);
  const warningTimer=useRef(null);

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),2600);};

  // Cierre por inactividad
  const handleTimeout=useCallback(()=>{
    if(integrado)return;
    showToast("Sesión cerrada por inactividad","info");
    setTimeout(()=>onBack(),1500);
  },[onBack]);

  // Aviso 2 min antes
  const handleWarning=useCallback(()=>{
    if(integrado)return;
    setWarningVisible(true);
    warningTimer.current=setTimeout(()=>setWarningVisible(false),10000);
  },[]);

  useInactivity(handleTimeout);

  // Aviso a los 13 minutos
  useEffect(()=>{
    const t=setTimeout(handleWarning,(INACTIVITY_MINUTES-2)*60*1000);
    return()=>clearTimeout(t);
  },[handleWarning]);;

  const verify=()=>{
    if(!query.trim())return;
    const q=query.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    let found=null;
    for(const s of SPOTS_DATA){const rec=records[s.id];if(rec?.patentes?.some(p=>p.toUpperCase().replace(/[^A-Z0-9]/g,"")===q)){found={spot:s,record:rec};break;}}
    setResult(found||"not_found");
  };

  const deleteRecord=spot=>{
    setRecords(r=>{const n={...r};delete n[spot.id];return n;});
    setConfirmDelete(null);
    showToast(`Estacionamiento #${spot.id} liberado`,"info");
  };

  const listedSpots=SPOTS_DATA.filter(s=>{
    if(!records[s.id])return false;
    if(filterSector!=="all"&&s.sector!==Number(filterSector))return false;
    if(searchList){const q=searchList.toLowerCase(),rec=records[s.id];return String(s.id).includes(q)||s.torre.includes(q)||s.depto.toLowerCase().includes(q)||rec.patentes?.some(p=>p.toLowerCase().includes(q))||(rec.propietario||rec.nombre||"").toLowerCase().includes(q);}
    return true;
  }).sort((a,b)=>{
    if(sortBy==="id")return a.id-b.id;
    if(sortBy==="torre")return a.torre.localeCompare(b.torre)||a.depto.localeCompare(b.depto);
    if(sortBy==="sector")return a.sector-b.sector;
    if(sortBy==="depto")return a.depto.localeCompare(b.depto);
    return 0;
  });

  const sc=result&&result!=="not_found"?SC[result.spot.sector]:null;
  const totalOcc=Object.keys(records).length,total=SPOTS_DATA.length;

  return (
    <div style={{minHeight:integrado?0:"100vh",background:"#f1f5f9",fontFamily:"system-ui,sans-serif",color:"#0f172a",border:integrado?"1px solid #e2e8f0":"none",borderRadius:integrado?12:0}}>
      {/* Aviso inactividad */}
      {warningVisible&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,background:"#854d0e",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <span style={{fontSize:13,fontWeight:700,color:"#a16207"}}>⚠️ Tu sesión se cerrará en 2 minutos por inactividad</span>
          <button onClick={()=>{setWarningVisible(false);if(warningTimer.current)clearTimeout(warningTimer.current);}}
            style={{padding:"4px 12px",borderRadius:6,border:"1px solid #fef08a",background:"transparent",color:"#a16207",fontSize:12,cursor:"pointer",fontWeight:700}}>
            Continuar sesión
          </button>
        </div>
      )}
      <div style={{background:"#ffffff",borderBottom:"1px solid #e2e8f0",padding:"14px 20px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:760,margin:"0 auto",display:"flex",alignItems:"center",gap:12}}>
          {!integrado&&<button onClick={onBack} style={{background:"#f1f5f9",border:"none",color:"#64748b",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:16}}>←</button>}
          <div style={{flex:1}}>
            {!integrado&&<div style={{fontSize:10,fontWeight:600,color:"#374151",textTransform:"uppercase",letterSpacing:1}}>Acceso Personal</div>}
            <div style={{fontSize:18,fontWeight:800}}>🔑 Panel de Control</div>
          </div>
          <div style={{display:"flex",gap:14,textAlign:"right"}}>
            <div><div style={{fontSize:17,fontWeight:900,color:"#22c55e",fontFamily:"monospace"}}>{total-totalOcc}</div><div style={{fontSize:9,color:"#374151"}}>LIBRES</div></div>
            <div><div style={{fontSize:17,fontWeight:900,color:"#f59e0b",fontFamily:"monospace"}}>{totalOcc}</div><div style={{fontSize:9,color:"#374151"}}>OCUP.</div></div>
            <div><div style={{fontSize:17,fontWeight:900,color:"#2563eb",fontFamily:"monospace"}}>{total}</div><div style={{fontSize:9,color:"#374151"}}>TOTAL</div></div>
          </div>
        </div>
        <div style={{maxWidth:760,margin:"10px auto 0",display:"flex",gap:2,background:"#f1f5f9",borderRadius:10,padding:3}}>
          {[["verify","🔍","Verificar"],["list","📋","Listado"],["map","🗺️","Plano"],["dashboard","📊","Dashboard"],["reclamos","⚠️","Reclamos"],["solicitudes","🤝","Solicitudes"],["admins","👥","Admins"]].map(([k,icon,label])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===k?"#2563eb":"transparent",color:tab===k?"white":"#4b5563",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:760,margin:"0 auto",padding:"16px"}}>
        {tab==="verify"&&(
          <div>
            <div style={{background:"#ffffff",borderRadius:16,padding:22,marginBottom:18,border:"1px solid #e2e8f0"}}>
              <p style={{margin:"0 0 13px",fontSize:13,color:"#64748b",lineHeight:1.6}}>Ingresa la patente para verificar su registro.</p>
              <div style={{display:"flex",gap:10}}>
                <input value={query} onChange={e=>{setQuery(e.target.value);setResult(null);}} onKeyDown={e=>e.key==="Enter"&&verify()} placeholder="ABCD12" maxLength={8}
                  style={{flex:1,padding:"14px 16px",borderRadius:10,fontSize:20,fontWeight:900,border:"2px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",outline:"none",fontFamily:"monospace",textTransform:"uppercase",letterSpacing:4}}/>
                <button onClick={verify} style={{padding:"14px 24px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Verificar</button>
              </div>
            </div>
            {result==="not_found"&&(
              <div style={{background:"#fef2f2",border:"1.5px solid #fecaca",borderRadius:16,padding:28,textAlign:"center"}}>
                <div style={{fontSize:44,marginBottom:10}}>❌</div>
                <div style={{fontSize:17,fontWeight:800,color:"#b91c1c",marginBottom:8}}>Patente no registrada</div>
                <div style={{fontFamily:"monospace",fontSize:20,fontWeight:900,letterSpacing:4,color:"#dc2626",marginBottom:12}}>{query.toUpperCase()}</div>
                <button onClick={()=>{setQuery("");setResult(null);}} style={{padding:"9px 24px",borderRadius:8,border:"1.5px solid #fecaca",background:"transparent",color:"#dc2626",cursor:"pointer",fontWeight:700}}>Nueva búsqueda</button>
              </div>
            )}
            {result&&result!=="not_found"&&sc&&(
              <div style={{background:sc.bg,borderRadius:16,overflow:"hidden"}}>
                <div style={{padding:"18px 22px",background:"rgba(15,23,42,.05)",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:38}}>✅</div>
                    <div>
                      <div style={{fontSize:11,color:sc.accent,fontWeight:700,marginBottom:2}}>Patente verificada</div>
                      <div style={{fontSize:24,fontWeight:900,fontFamily:"monospace",letterSpacing:4,color:"#0f172a"}}>{query.toUpperCase()}</div>
                    </div>
                  </div>
                  <button onClick={()=>setSelectedSpot(result.spot)} style={{padding:"8px 14px",borderRadius:8,border:`1.5px solid ${sc.accent}60`,background:"rgba(255,255,255,.08)",color:sc.accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>✏️ Editar</button>
                </div>
                <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:12}}>
                  <RowItem icon="🅿" label="Estacionamiento" value={`#${result.spot.id}`} mono/>
                  <RowItem icon="📍" label="Sector" value={SECTOR_NAMES[result.spot.sector]}/>
                  <RowItem icon="🏢" label="Torre" value={result.spot.torre}/>
                  <RowItem icon="🏠" label="Departamento" value={result.spot.depto}/>
                  {result.record.patentes?.length>0&&<RowItem icon="🚗" label="Patentes" value={result.record.patentes.join(" · ")}/>}
                  {(result.record.propietario||result.record.nombre)&&<RowItem icon="👤" label="Residente" value={result.record.propietario||result.record.nombre}/>}
                </div>
                <div style={{padding:"0 22px 18px",display:"flex",gap:8}}>
                  <button onClick={()=>setConfirmDelete(result.spot)} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid #fecaca",background:"rgba(239,68,68,.1)",color:"#dc2626",fontWeight:700,fontSize:13,cursor:"pointer"}}>🗑 Eliminar</button>
                  <button onClick={()=>{setQuery("");setResult(null);}} style={{flex:1,padding:"10px",borderRadius:9,border:"2px solid #e2e8f0",background:"rgba(15,23,42,.05)",color:"#0f172a",fontWeight:700,fontSize:13,cursor:"pointer"}}>Nueva búsqueda</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab==="list"&&(
          <div>
            <div style={{background:"#ffffff",borderRadius:13,padding:12,marginBottom:12,border:"1px solid #e2e8f0",display:"flex",gap:8,flexWrap:"wrap"}}>
              <input value={searchList} onChange={e=>setSearchList(e.target.value)} placeholder="Buscar patente, torre, depto..."
                style={{flex:1,minWidth:150,padding:"8px 12px",borderRadius:8,fontSize:12,border:"1.5px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",outline:"none",fontFamily:"inherit"}}/>
              <select value={filterSector} onChange={e=>setFilterSector(e.target.value)}
                style={{padding:"8px 10px",borderRadius:8,fontSize:12,border:"1.5px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",cursor:"pointer"}}>
                <option value="all">Todos los sectores</option>
                {[1,2,3].map(s=><option key={s} value={s}>{SECTOR_NAMES[s]}</option>)}
              </select>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
                style={{padding:"8px 10px",borderRadius:8,fontSize:12,border:"1.5px solid #e2e8f0",background:"#f1f5f9",color:"#0f172a",cursor:"pointer"}}>
                <option value="id">N° Estac.</option><option value="torre">Torre</option>
                <option value="depto">Depto</option><option value="sector">Sector</option>
              </select>
              <button onClick={()=>{
                const usoL={uso_exclusivo:"Uso exclusivo",visitas:"Para visitas",ceder_largo:"Préstamo largo plazo",sin_uso:"Sin uso"};
                const tipoL={propietario_residente:"Prop. residente",propietario_arriendo:"Prop. no residente",arrendatario:"Arrendatario"};
                const rows=[["Estac.","Torre","Depto","Sector","Nombre","Email","Teléfono","Tipo","Uso","Patentes","Actualizado"]];
                listedSpots.forEach(s=>{
                  const r=records[s.id];
                  rows.push([
                    `#${s.id}`,
                    TORRES_LABELS[s.torre]||s.torre,
                    s.depto,
                    SECTOR_NAMES[s.sector],
                    r.nombre||"",
                    r.email||"",
                    r.telefono||"",
                    tipoL[r.tipoResidente]||r.tipoResidente||"",
                    usoL[r.usoEstacionamiento]||r.usoEstacionamiento||"",
                    (r.patentes||[]).join(", "),
                    r.updatedAt?new Date(r.updatedAt).toLocaleDateString("es-CL"):"",
                  ]);
                });
                const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
                const url=URL.createObjectURL(blob);
                const a=document.createElement("a");
                a.href=url;a.download=`estacionamientos_${new Date().toLocaleDateString("es-CL").replace(/\//g,"-")}.csv`;
                a.click();URL.revokeObjectURL(url);
              }} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #22c55e",background:"rgba(34,197,94,.1)",color:"#22c55e",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                📥 Exportar CSV
              </button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {Object.entries(SC).map(([sid,sc2])=>{
                const ss=SPOTS_DATA.filter(s=>s.sector===Number(sid)),occ=ss.filter(s=>records[s.id]).length;
                return <div key={sid} style={{flex:1,background:"#ffffff",borderRadius:10,padding:"9px 11px",border:`1px solid ${sc2.accent}30`,borderLeft:`3px solid ${sc2.accent}`}}>
                  <div style={{fontSize:8,color:sc2.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>S{sid}</div>
                  <div style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:"#0f172a"}}>{occ}<span style={{fontSize:10,color:"#374151"}}>/{ss.length}</span></div>
                  <div style={{height:3,background:"#f1f5f9",borderRadius:2,marginTop:4}}><div style={{height:"100%",width:`${occ/ss.length*100}%`,background:sc2.accent,borderRadius:2}}/></div>
                </div>;
              })}
            </div>
            <div style={{background:"#ffffff",borderRadius:14,overflow:"hidden",border:"1px solid #e2e8f0"}}>
              <div style={{display:"grid",gridTemplateColumns:"50px 62px 60px 1fr 68px 80px 84px",padding:"8px 14px",background:"#f1f5f9",borderBottom:"1px solid #e2e8f0",fontSize:10,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:0.5}}>
                <span>Estac.</span><span>Torre</span><span>Depto</span><span>Patente(s)</span><span>Sector</span><span>Fecha</span><span>Acciones</span>
              </div>
              {listedSpots.length===0&&<div style={{padding:32,textAlign:"center",color:"#374151",fontSize:13}}>{totalOcc===0?"No hay registros aún.":"Sin resultados."}</div>}
              {listedSpots.map((s,i)=>{
                const rec=records[s.id],sc2=SC[s.sector];
                const fechaReg=rec.createdAt?.toDate?.()?.toLocaleDateString("es-CL")||rec.fechaRegistro||rec.updatedAt?(new Date(rec.updatedAt)).toLocaleDateString("es-CL"):"—";
                const esPendiente=rec.estadoRegistro==="pendiente";
                return <div key={s.id} style={{display:"grid",gridTemplateColumns:"50px 62px 60px 1fr 68px 80px 84px",padding:"10px 14px",borderBottom:i<listedSpots.length-1?"1px solid #f1f5f9":"none",alignItems:"center",fontSize:12,background:esPendiente?"rgba(245,158,11,.04)":"transparent"}}>
                  <div style={{width:34,height:34,borderRadius:8,background:sc2.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:900,fontSize:11,color:sc2.accent,position:"relative"}}>
                    #{s.id}
                    {esPendiente&&<div style={{position:"absolute",top:-4,right:-4,width:8,height:8,borderRadius:"50%",background:"#f59e0b",border:"1.5px solid #ffffff"}}/>}
                  </div>
                  <span style={{color:"#64748b",fontFamily:"monospace",fontSize:11}}>{s.torre}</span>
                  <span style={{color:"#64748b",fontFamily:"monospace",fontWeight:700}}>{s.depto}</span>
                  <div>
                    {rec.patentes?.map((p,pi)=><span key={pi} style={{display:"inline-block",marginRight:4,marginBottom:2,padding:"2px 6px",borderRadius:5,background:sc2.bg,color:sc2.accent,fontFamily:"monospace",fontSize:11,fontWeight:700}}>{p}</span>)}
                    {(rec.propietario||rec.nombre)&&<div style={{fontSize:10,color:"#374151",marginTop:2}}>{rec.propietario||rec.nombre}</div>}
                    {esPendiente&&<span style={{fontSize:9,background:"#fffbeb",color:"#92400e",padding:"1px 5px",borderRadius:4,fontWeight:700}}>⏳ Pendiente visado</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:1,background:sc2.accent}}/><span style={{fontSize:10,color:"#374151"}}>S{s.sector}</span></div>
                  <span style={{fontSize:9,color:"#4b5563",fontFamily:"monospace"}}>{fechaReg}</span>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {esPendiente&&<button onClick={async()=>{
                      await updateSolicitud(s.id,{estadoRegistro:"visado"});
                      setRecords(r=>({...r,[s.id]:{...r[s.id],estadoRegistro:"visado"}}));
                    }} style={{padding:"4px 7px",borderRadius:6,border:"1.5px solid #166534",background:"rgba(22,163,74,.15)",color:"#16a34a",cursor:"pointer",fontSize:11,fontWeight:700}} title="Visar registro">✅</button>}
                    <button onClick={()=>setSelectedSpot(s)} style={{padding:"5px 8px",borderRadius:6,border:"1.5px solid #1e3a5f",background:"rgba(37,99,235,.12)",color:"#2563eb",cursor:"pointer",fontSize:13}}>✏️</button>
                    <button onClick={()=>setConfirmDelete(s)} style={{padding:"5px 8px",borderRadius:6,border:"1.5px solid #fecaca",background:"rgba(239,68,68,.1)",color:"#dc2626",cursor:"pointer",fontSize:13}}>🗑</button>
                  </div>
                </div>;
              })}
              {listedSpots.length>0&&<div style={{padding:"9px 14px",borderTop:"1px solid #e2e8f0",fontSize:11,color:"#374151",display:"flex",justifyContent:"space-between"}}><span>{listedSpots.length} de {totalOcc} registros</span><span>{total-totalOcc} espacios libres</span></div>}
            </div>
          </div>
        )}

        {tab==="reclamos"&&<ReclamosTab/>}
        {tab==="admins"&&<AdminsTab/>}
        {tab==="solicitudes"&&<SolicitudesTab records={records} setRecords={setRecords}/>}
        {tab==="dashboard"&&(()=>{
          const totalSpots=SPOTS_DATA.length;
          const totalOcc2=Object.keys(records).length;
          const totalFree=totalSpots-totalOcc2;
          const pctOcc=Math.round(totalOcc2/totalSpots*100);

          // Por sector
          const bySector=[1,2,3].map(sid=>{
            const spots=SPOTS_DATA.filter(s=>s.sector===sid);
            const occ=spots.filter(s=>records[s.id]).length;
            return {sid,name:SECTOR_NAMES[sid],total:spots.length,occ,free:spots.length-occ,pct:Math.round(occ/spots.length*100)};
          });

          // Por tipo residente
          const byTipo={propietario_residente:0,propietario_arriendo:0,arrendatario:0,sin_tipo:0};
          Object.values(records).forEach(r=>{
            if(r.tipoResidente&&byTipo[r.tipoResidente]!==undefined) byTipo[r.tipoResidente]++;
            else if(r.tipoResidente) byTipo.sin_tipo++;
            else byTipo.sin_tipo++;
          });

          // Por uso
          const byUso={uso_exclusivo:0,visitas:0,ceder_largo:0,sin_uso:0,otro:0};
          Object.values(records).forEach(r=>{
            if(r.usoEstacionamiento&&byUso[r.usoEstacionamiento]!==undefined) byUso[r.usoEstacionamiento]++;
            else byUso.otro++;
          });

          // Registros recientes (últimos 5)
          const recientes=Object.entries(records)
            .filter(([,r])=>r.updatedAt)
            .sort(([,a],[,b])=>new Date(b.updatedAt)-new Date(a.updatedAt))
            .slice(0,5);

          const StatCard=({label,value,sub,color})=>(
            <div style={{background:"#ffffff",borderRadius:12,padding:"14px 16px",border:`1px solid ${color}30`,borderLeft:`3px solid ${color}`,flex:1,minWidth:120}}>
              <div style={{fontSize:28,fontWeight:900,color,fontFamily:"monospace"}}>{value}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginTop:2}}>{label}</div>
              {sub&&<div style={{fontSize:10,color:"#4b5563",marginTop:2}}>{sub}</div>}
            </div>
          );

          const tipoL={propietario_residente:"Propietario residente",propietario_arriendo:"Propietario no residente",arrendatario:"Arrendatario",sin_tipo:"Sin especificar"};
          const usoL={uso_exclusivo:"Uso exclusivo",visitas:"Para visitas",ceder_largo:"Préstamo largo plazo",sin_uso:"Sin uso",otro:"Otro"};
          const usoColors={uso_exclusivo:"#22c55e",visitas:"#3b82f6",ceder_largo:"#a855f7",sin_uso:"#6b7280",otro:"#f59e0b"};
          const tipoColors={propietario_residente:"#22c55e",propietario_arriendo:"#3b82f6",arrendatario:"#f59e0b",sin_tipo:"#6b7280"};

          return <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Stats principales */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <StatCard label="Total espacios" value={totalSpots} color="#60a5fa"/>
              <StatCard label="Ocupados" value={totalOcc2} sub={`${pctOcc}% del total`} color="#f59e0b"/>
              <StatCard label="Disponibles" value={totalFree} sub={`${100-pctOcc}% del total`} color="#22c55e"/>
            </div>

            {/* Barra ocupación total */}
            <div style={{background:"#ffffff",borderRadius:12,padding:16,border:"1px solid #e2e8f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>Ocupación total</span>
                <span style={{fontSize:12,fontWeight:900,color:"#f59e0b",fontFamily:"monospace"}}>{pctOcc}%</span>
              </div>
              <div style={{height:10,background:"#f1f5f9",borderRadius:5,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pctOcc}%`,background:"linear-gradient(90deg,#f59e0b,#ef4444)",borderRadius:5,transition:"width .5s"}}/>
              </div>
            </div>

            {/* Por sector */}
            <div style={{background:"#ffffff",borderRadius:12,padding:16,border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:12}}>📍 Ocupación por sector</div>
              {bySector.map(s=>(
                <div key={s.sid} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:11,color:SC[s.sid].accent,fontWeight:600}}>{s.name}</span>
                    <span style={{fontSize:11,color:"#64748b",fontFamily:"monospace"}}>{s.occ}/{s.total} — {s.pct}%</span>
                  </div>
                  <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${s.pct}%`,background:SC[s.sid].accent,borderRadius:4,transition:"width .5s"}}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Por tipo residente */}
            <div style={{background:"#ffffff",borderRadius:12,padding:16,border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:12}}>👤 Por tipo de residente</div>
              {Object.entries(byTipo).filter(([,v])=>v>0).map(([k,v])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:tipoColors[k],flexShrink:0}}/>
                  <span style={{fontSize:11,color:"#64748b",flex:1}}>{tipoL[k]}</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#0f172a",fontFamily:"monospace"}}>{v}</span>
                  <div style={{width:60,height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(v/totalOcc2*100)}%`,background:tipoColors[k],borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Por uso */}
            <div style={{background:"#ffffff",borderRadius:12,padding:16,border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:12}}>🚗 Por uso del estacionamiento</div>
              {Object.entries(byUso).filter(([,v])=>v>0).map(([k,v])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:usoColors[k],flexShrink:0}}/>
                  <span style={{fontSize:11,color:"#64748b",flex:1}}>{usoL[k]}</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#0f172a",fontFamily:"monospace"}}>{v}</span>
                  <div style={{width:60,height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(v/totalOcc2*100)}%`,background:usoColors[k],borderRadius:3}}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Registros recientes */}
            {recientes.length>0&&<div style={{background:"#ffffff",borderRadius:12,padding:16,border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#0f172a",marginBottom:12}}>🕐 Últimos registros</div>
              {recientes.map(([id,rec])=>{
                const spot=SPOTS_DATA.find(s=>s.id===Number(id));
                const sc2=SC[spot?.sector||1];
                return <div key={id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,paddingBottom:10,borderBottom:"1px solid #e2e8f0"}}>
                  <div style={{width:36,height:36,borderRadius:8,background:sc2.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:900,fontSize:11,color:sc2.accent,flexShrink:0}}>#{id}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{rec.nombre||"Sin nombre"}</div>
                    <div style={{fontSize:10,color:"#4b5563"}}>{TORRES_LABELS[spot?.torre]||spot?.torre} · {spot?.depto}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:"#4b5563"}}>{rec.updatedAt?new Date(rec.updatedAt).toLocaleDateString("es-CL"):""}</div>
                    <div style={{fontSize:10,color:sc2.accent,fontWeight:600}}>{rec.patentes?.join(", ")||"—"}</div>
                  </div>
                </div>;
              })}
            </div>}
          </div>;
        })()}
        {tab==="map"&&(
          <div>
            {[1,2,3].map(sid=>{
              const sc2=SC[sid],sSpots=SPOTS_DATA.filter(s=>s.sector===sid),occ=sSpots.filter(s=>records[s.id]).length;
              return <div key={sid} style={{background:"#ffffff",borderRadius:16,overflow:"hidden",marginBottom:14,border:`1px solid ${sc2.accent}30`}}>
                <div style={{padding:"12px 16px",background:sc2.bg,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:800,fontSize:13,color:sc2.accent}}>📍 {SECTOR_NAMES[sid]}</div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:sc2.accent}}>{occ}<span style={{fontSize:10,color:"#64748b"}}>/{sSpots.length}</span></div>
                    <div style={{fontSize:9,color:"#64748b",textTransform:"uppercase"}}>ocupados</div>
                  </div>
                </div>
                <div style={{padding:10,overflowX:"auto"}}>
                  <SectorMap sectorId={sid} records={records} onSpotClick={s=>setSelectedSpot(s)} highlightId={null}/>
                </div>
                <div style={{padding:"8px 14px 10px",display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",background:"#ffffff"}}>
                  <Legend color="#22c55e" label="Uso exclusivo"/>
                  <Legend color="#3b82f6" label="Visitas"/>
                  <Legend color="#a855f7" label="Cedido"/>
                  <Legend color="#78716c" label="Sin uso"/>
                  <Legend color="#2d3f5a" label="Libre"/>
                  <span style={{fontSize:10,color:"#374151",marginLeft:"auto"}}>Toca un espacio para editar</span>
                </div>
              </div>;
            })}
          </div>
        )}
      </div>

      {selectedSpot&&<SpotModal spot={selectedSpot} record={records[selectedSpot.id]} onClose={()=>setSelectedSpot(null)}
        onSave={data=>{setRecords(r=>({...r,[selectedSpot.id]:data}));setSelectedSpot(null);showToast(`Estacionamiento #${selectedSpot.id} actualizado`);}}
        onDelete={()=>{setRecords(r=>{const n={...r};delete n[selectedSpot.id];return n;});setSelectedSpot(null);showToast(`#${selectedSpot.id} liberado`,"info");}}/>}
      {confirmDelete&&<ConfirmDialog msg={`Se eliminará el registro del estacionamiento #${confirmDelete.id} (Torre ${confirmDelete.torre} · Depto ${confirmDelete.depto}).`} onConfirm={()=>deleteRecord(confirmDelete)} onCancel={()=>setConfirmDelete(null)}/>}
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
    </div>
  );
};

// ── Parking dentro de CondoAdmin (panel de administración) ──
export function ParkingAdmin({obtenerToken,email}){
  const [records,setRecords]=useState(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    conectarCondoAdmin(obtenerToken,email);
    loadRegistros().then(full=>{setRecords(full);sincronizarPublico(JSON.parse(JSON.stringify(full)));}).catch(e=>setError(e.message||"No se pudo cargar Parking"));
  },[]);
  const setRecordsAndSync=useCallback((updater)=>{
    setRecords(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      Object.entries(next).forEach(([id,rec])=>{if(JSON.stringify(prev[id])!==JSON.stringify(rec))upsertRegistro(Number(id),rec);});
      Object.keys(prev).forEach(id=>{if(!next[id])deleteRegistro(Number(id));});
      return next;
    });
  },[]);
  if(error)return <div style={{padding:20,color:"#dc2626",fontSize:14}}>{error}</div>;
  if(!records)return <div style={{padding:20,color:"#64748b",fontSize:14}}>Cargando Parking…</div>;
  return <StaffScreen records={records} setRecords={setRecordsAndSync} onBack={()=>{}} integrado/>;
}
