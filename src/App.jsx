import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, deleteField, query, orderBy, where } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

// ── Firebase config ─────────────────────────────────────────────────────────
// Reemplaza estos valores con los de tu proyecto Firebase
// Firebase Console → Project Settings → Your apps → Config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const fbDb  = getFirestore(fbApp);
const fbAuth = getAuth(fbApp);
const fbStorage = getStorage(fbApp);

// ── DB helpers (mantienen la misma interfaz que antes) ──────────────────────
// Los documentos siguen la estructura {id, data:{...}} igual que en Supabase
const dbGet = async (table, _filter="") => {
  const snap = await getDocs(collection(fbDb, table));
  return snap.docs.map(d => d.data());
};
const dbUpsert = async (table, item) => {
  const id = String(item.id || item.key || "");
  if (!id) return;
  await setDoc(doc(fbDb, table, id), item, { merge: true });
};
const dbDelete = async (table, idVal) => {
  // idVal puede ser "id=eq.XXX" (compat Supabase) o directo
  const id = String(idVal).replace(/^id=eq\./, "");
  await deleteDoc(doc(fbDb, table, id));
};
const dbPost = dbUpsert; // alias — en Firebase upsert y post son lo mismo
const dbPatch = async (table, filter, data) => {
  const id = String(filter).replace(/^id=eq\./, "");
  await setDoc(doc(fbDb, table, id), data, { merge: true });
};
const dbGetOne = async (table, id) => {
  const snap = await getDoc(doc(fbDb, table, String(id)));
  return snap.exists() ? snap.data() : null;
};

const signIn = async (email, pass) => {
  const cred = await signInWithEmailAndPassword(fbAuth, email, pass);
  return { access_token: await cred.user.getIdToken(), user: cred.user };
};

// Crea la cuenta de acceso (correo + contraseña) sin salir de la app.
// Se usa una conexión aparte para que el administrador no pierda su propia sesión.
// Devuelve "creada" o "existia" (si ese correo ya tenía cuenta).
const crearCuenta = async (email, pass) => {
  const app2 = initializeApp(firebaseConfig, "alta-" + Date.now());
  try {
    const a2 = getAuth(app2);
    await createUserWithEmailAndPassword(a2, email, pass);
    try { await signOut(a2); } catch (_) {}
    return "creada";
  } catch (ex) {
    if (ex && ex.code === "auth/email-already-in-use") return "existia";
    throw ex;
  } finally {
    try { await deleteApp(app2); } catch (_) {}
  }
};
const claveAzar = () => { const a = new Uint32Array(4); crypto.getRandomValues(a); return Array.from(a, n => n.toString(36)).join("") + "aA1"; };
const errCuenta = ex => ({
  "auth/invalid-email": "El correo no es válido.",
  "auth/weak-password": "La contraseña es muy corta (mínimo 6 caracteres).",
  "auth/operation-not-allowed": "El ingreso con correo y contraseña está desactivado en Firebase (Authentication → Sign-in method).",
  "auth/admin-restricted-operation": "Firebase tiene bloqueada la creación de cuentas desde la app (Authentication → Settings → User actions → permitir creación de cuentas).",
  "auth/network-request-failed": "Sin conexión. Revisa internet e intenta de nuevo.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
}[ex && ex.code] || ("No se pudo crear la cuenta: " + ((ex && ex.message) || ex)));

const uploadImg = async (file, path) => {
  const r = storageRef(fbStorage, "imagenes/" + path);
  await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(r);
};

const SITE_URL = "https://condoadmin-rouge.vercel.app";
const sendMail = async (to, subject, body) => {
  if (!to || !to.includes("@")) return;
  try {
    await fetch(SITE_URL + "/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
    });
  } catch (ex) {
    console.warn("sendMail error", ex);
  }
};

const ROLES = ["Administrador","Administrador Edificio","Conserjeria","Residente","Comite","Proveedor"];
const STATUSES = ["Ingresada","En revision","Asignada","En proceso","Resuelta","Cerrada","Rechazada"];
const PRIORITIES = ["Emergencia","Alta","Media","Baja"];
const SC = {Ingresada:"#6366f1","En revision":"#f59e0b",Asignada:"#3b82f6","En proceso":"#8b5cf6",Resuelta:"#10b981",Cerrada:"#6b7280",Rechazada:"#ef4444"};
const PC = {Emergencia:"#ef4444",Alta:"#f97316",Media:"#f59e0b",Baja:"#6b7280"};
const PB = {Emergencia:"#fef2f2",Alta:"#fff7ed",Media:"#fffbeb",Baja:"#f9fafb"};
const MANT_SC = {Vigente:"#10b981","Por vencer":"#f59e0b",Vencida:"#ef4444","En ejecucion":"#6366f1",Completada:"#6b7280"};
const MANT_SB = {Vigente:"#f0fdf4","Por vencer":"#fffbeb",Vencida:"#fef2f2","En ejecucion":"#eef2ff",Completada:"#f9fafb"};
const MANT_CATS = ["Equipos/Maquinaria","Infraestructura","Sistemas"];
const MANT_SUBCATS = {"Equipos/Maquinaria":["Ascensor","Motor porton","Bomba agua","Bomba calor","Generador","Otro"],"Infraestructura":["Techumbres","Fachadas","Piscina","Quincho","Sala eventos","Otro"],"Sistemas":["Electrico","Gas","Agua potable","Citofonia","Camaras","Otro"]};
const MANT_TIPOS = ["Preventiva","Correctiva","Certificacion","Revision tecnica"];
const MANT_ESTADOS = ["Vigente","Por vencer","Vencida","En ejecucion","Completada"];
const INV_CATS = ["Herramientas","Electrico","Plomeria","Pintura","Limpieza","Jardines","Perimetral","Motor","Otros"];
const INV_UNITS = ["unidad","caja","kg","litro","metro","rollo","par","juego"];
const MAT_STATUS = ["Por adquirir","Adquirido","Entregado"];
const MAT_COLOR = {"Por adquirir":"#f59e0b",Adquirido:"#6366f1",Entregado:"#10b981"};
const ITEM_STATES = ["Bueno","Regular","Malo","No aplica"];
const ITEM_COLOR = {Bueno:"#10b981",Regular:"#f59e0b",Malo:"#ef4444","No aplica":"#94a3b8","":"#d1d5db"};
const URGENCY_LEVELS = ["Baja","Media","Alta","Critica"];
const ESTADOS_INFORME = ["Resuelto","Resuelto parcialmente","Requiere revisión"];
const ADMIN_CATS = {
  "Gestión":["Circular informativa","Acta de reunión","Carta a residente","Aviso general","Otro"],
  "Finanzas":["Pago de gastos comunes","Deuda morosa","Cotización","Factura proveedor","Fondo de reserva","Otro"],
  "Documentos":["Solicitud de certificado","Reglamento interno","Contrato proveedor","Permiso municipal","Otro"],
  "Comité":["Convocatoria reunión","Acuerdo de comité","Votación","Otro"],
  "Legal":["Reclamo residente","Infracción reglamento","Denuncia","Mediación","Otro"],
  "Proveedores":["Solicitud de cotización","Evaluación proveedor","Término de contrato","Otro"]
};
const DEF_CATS = {
  Electricidad:["Corte de luz","Falla de circuito","Luminaria","Tablero electrico","Otro"],
  Gas:["Olor a gas","Corte suministro","Fuga","Otro"],
  Agua:["Corte de agua","Presion baja","Fuga","Medidor","Otro"],
  Filtraciones:["Techo","Muro","Piso","Ventana","Otro"],
  Ascensores:["Parada emergencia","Ruido anormal","Puerta defectuosa","Otro"],
  Citofonia:["Citofono sin senal","Puerta danada","Control acceso","Otro"],
  "Espacios comunes":["Sala eventos","Quincho","Piscina","Gimnasio","Estacionamiento","Otro"],
  Perimetral:["Reja perimetral","Porton peatonal","Porton vehicular","Muro","Cerco electrico","Otro"],
  Motor:["Motor porton vehicular","Motor porton peatonal","Automatismo danado","Barrera vehicular","Otro"],
  Seguridad:["Incidente","Camara danada","Acceso no autorizado","Alarma","Otro"],
  Aseo:["Pasillo sucio","Retiro basura","Area comun","Otro"],
  Jardines:["Poda","Riego","Dano en plantas","Sistema riego","Otro"],
  Otros:["Ruidos molestos","Mascotas","Dano propiedad comun","Otro"]
};
const CL_SECTIONS = [
  {id:"s1",label:"Cierres perimetrales",items:["Reja perimetral","Porton peatonal","Porton vehicular","Cerraduras","Bisagras","Automatizacion","Citofonia","Senaletica"]},
  {id:"s2",label:"Jardines",items:["Cesped","Arboles","Arbustos","Macizos","Sistema riego","Podas","Maleza","Estado general"]},
  {id:"s3",label:"Iluminacion",items:["Luminarias ext","Luminarias pasillos","Luces acceso","Luces estacionamiento","Alumbrado perimetral","Cableado visible","Interruptores"]},
  {id:"s4",label:"Mobiliario",items:["Bancas","Basureros","Juegos infantiles","Bicicleteros","Senaletica interior","Barandas","Rejas interiores"]},
  {id:"s5",label:"Canerias",items:["Canerias visibles","Filtraciones","Goteras","Llaves de paso","Sumideros","Canaletas","Bajadas de agua","Acumulacion agua"]},
  {id:"s6",label:"Techumbres",items:["Techo principal","Cubiertas","Tejas","Sellos","Senales humedad","Riesgo desprendimiento"]},
  {id:"s7",label:"Muros",items:["Muros perimetrales","Fachadas","Grietas","Humedad","Pintura deteriorada","Revestimientos","Vandalismo"]},
  {id:"s8",label:"Circulaciones",items:["Veredas","Pavimentos","Escaleras","Rampas","Pasamanos","Estacionamientos","Senalizacion","Obstaculos"]},
  {id:"s9",label:"Aseo",items:["Limpieza areas comunes","Basura","Escombros","Graffitis","Olores"]}
];
const EQUIP_TIPOS = [
  {id:"e1",nombre:"Extintores",icono:"🧯",frecuencia:"Anual"},
  {id:"e2",nombre:"Red húmeda/seca",icono:"🚒",frecuencia:"Anual"},
  {id:"e3",nombre:"Tableros eléctricos",icono:"⚡",frecuencia:"Anual"},
  {id:"e4",nombre:"Ascensores",icono:"🛗",frecuencia:"Semestral"},
  {id:"e5",nombre:"Calderas/Calefactores",icono:"🔥",frecuencia:"Anual"},
  {id:"e6",nombre:"Estanques de agua",icono:"💧",frecuencia:"Semestral"},
  {id:"e7",nombre:"Cámaras CCTV",icono:"🎥",frecuencia:"Anual"},
  {id:"e8",nombre:"Puertas cortafuego",icono:"🚪",frecuencia:"Anual"},
  {id:"e9",nombre:"Piscina",icono:"🏊",frecuencia:"Mensual"},
  {id:"e10",nombre:"Ventilación",icono:"🌬️",frecuencia:"Semestral"},
  {id:"e11",nombre:"Generador",icono:"⚙️",frecuencia:"Anual"},
  {id:"e12",nombre:"Bomba de agua",icono:"🔧",frecuencia:"Anual"},
  {id:"e13",nombre:"Motor portón",icono:"🚗",frecuencia:"Anual"},
  {id:"e14",nombre:"Citófonos",icono:"📞",frecuencia:"Anual"},
  {id:"e15",nombre:"Alarmas",icono:"🔔",frecuencia:"Anual"}
];
const PERMS = {
  Administrador:["create","viewAll","assign","changeStatus","closeCases","createTask","viewReports","viewEmails","manageConfig","comment","inspection","inventory","viewAs","manageWork","mantencion","mantRead"],
  "Administrador Edificio":["create","viewAll","assign","changeStatus","closeCases","createTask","viewReports","viewEmails","comment","inspection","inventory","manageWork","mantencion","mantRead"],
  Conserjeria:["create","viewOps","changeStatusLimited","comment","inspection","inventory","manageWork","mantencion","mantRead"],
  Residente:["create","viewOwn"],
  Comite:["viewAll","viewReports","inspectionRead","inventoryRead","mantRead"],
  Proveedor:["viewAssigned","recordProgress","uploadEvidence","resolveTask","comment","providerDash"]
};
const can = (role,action) => (PERMS[role]||[]).includes(action);
const fmt = d => { try { return new Date(d).toLocaleString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); } catch(_){ return ""; }};
// Las fechas sin hora ("2026-11-05") se interpretan como día local; si no, en Chile se mostraban un día antes
const parseF = d => { const m=typeof d==="string"&&/^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m?new Date(+m[1],+m[2]-1,+m[3]):new Date(d); };
const fmtD = d => { try { return parseF(d).toLocaleDateString("es-CL"); } catch(_){ return ""; }};
const uid = () => Math.random().toString(36).slice(2,9);
const genCode = (arr,pfx) => {
  const nums = (arr||[]).map(r => { const n = parseInt((r.id||r.code||"").replace(pfx,"").replace(/\D/g,""),10); return isNaN(n)?0:n; });
  return pfx+String((nums.length?Math.max(0,...nums):0)+1).padStart(3,"0");
};
const getMantStatus = m => {
  if(!m) return "Vigente";
  if(m.status==="En ejecucion"||m.status==="Completada") return m.status;
  if(!m.nextDate) return "Vigente";
  const d = (new Date(m.nextDate)-new Date())/86400000;
  return d<0?"Vencida":d<=30?"Por vencer":"Vigente";
};
const mkItems = ov => {
  const o=ov||{}, items={};
  CL_SECTIONS.forEach(s => s.items.forEach(n => {
    const k=s.id+"_"+n;
    items[k]={state:"",obs:"",urgency:"",images:[],reqId:null,...(o[k]||{})};
  }));
  return items;
};
const normReq = r => ({comments:[],history:[],attachmentsInitial:[],assignedTo:"Sin asignar",dueDate:null,isUrgent:false,...(r||{})});
const normTask = t => ({comments:[],attachments:[],materials:[],status:"Ingresada",informe:"",tiempoUsado:"",...(t||{})});
const normMant = m => ({history:[],comments:[],documents:[],...(m||{})});
const normInsp = i => { const b=i||{}; return {...b,items:mkItems(b.items)}; };
// ── Helpers de análisis (compartidos por Dashboard y Reportes) ──────────────
const esAbierta = r => !["Cerrada","Rechazada"].includes(r.status);
const fechaCierre = r => { const h=[...(r.history||[])].reverse().find(x=>x.to==="Cerrada"); return h&&h.date?h.date:null; };
const diasCierre = r => { const f=fechaCierre(r); if(!f||!r.createdAt) return null; const d=(new Date(f)-new Date(r.createdAt))/86400000; return isNaN(d)||d<0?null:d; };
// Promedio solo sobre las solicitudes que tienen fecha de cierre registrada
const promDias = list => { const ds=list.map(diasCierre).filter(d=>d!==null); return ds.length?Math.round(ds.reduce((a,b)=>a+b,0)/ds.length*10)/10:null; };
const fmtDias = d => d===null?"---":(d<10?String(d).replace(".",","):String(Math.round(d)))+(d===1?" día":" días");
const diasAbierta = r => { const d=Math.floor((Date.now()-new Date(r.createdAt))/86400000); return isNaN(d)||d<0?0:d; };
const mesKey = d => { const x=new Date(d); return isNaN(x)?"":x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0"); };
const ultMeses = n => { const b=new Date(), out=[]; for(let i=n-1;i>=0;i--){ const d=new Date(b.getFullYear(),b.getMonth()-i,1); out.push({key:mesKey(d),label:d.toLocaleString("es-CL",{month:"short",year:"2-digit"})}); } return out; };
const tareaPend = t => !!t.dueDate&&!(t.informe||"").trim()&&t.status!=="Completada"&&t.status!=="Cancelada";
const diffDue = t => { const h=new Date(); h.setHours(0,0,0,0); return Math.ceil((parseF(t.dueDate)-h)/86400000); };
const ordPrioridad = (a,b) => (PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority))||(new Date(a.createdAt)-new Date(b.createdAt));
// ── Plazos (SLA), asignación, cierre y evaluación ───────────────────────────
const SLA_H = {Emergencia:4,Alta:24,Media:72,Baja:168};   // horas para resolver según prioridad
const slaTxt = p => { const h=SLA_H[p]; return h==null?"—":h<48?h+" h":(h/24)+" días"; };
const venceSLA = r => { const h=SLA_H[r.priority], c=new Date(r.createdAt); return h==null||isNaN(c)?null:new Date(c.getTime()+h*3600000); };
// Cerradas: true/false según si se cerró dentro del plazo (null si no hay fecha de cierre)
const enPlazo = r => { const v=venceSLA(r), f=fechaCierre(r); return r.status!=="Cerrada"||!v||!f?null:new Date(f)<=v; };
// Abiertas que ya pasaron su plazo
const fueraPlazo = r => { const v=venceSLA(r); return esAbierta(r)&&!!v&&Date.now()>v.getTime(); };
const fechaAsig = r => { const h=(r.history||[]).find(x=>x.to==="Asignada"||/^Asignada a /.test(x.action||"")); return h&&h.date?h.date:null; };
const horasAsignar = r => { const f=fechaAsig(r); if(!f||!r.createdAt) return null; const h=(new Date(f)-new Date(r.createdAt))/3600000; return isNaN(h)||h<0?null:h; };
const promNum = a => { const x=a.filter(v=>v!==null&&v!==undefined); return x.length?x.reduce((s,v)=>s+v,0)/x.length:null; };
const num1 = n => String(Math.round(n*10)/10).replace(".",",");
const fmtHoras = h => h===null?"---":h<1?Math.max(1,Math.round(h*60))+" min":h<48?num1(h)+" h":num1(h/24)+" días";
const atrasoTxt = r => { const v=venceSLA(r); return v?fmtHoras((Date.now()-v.getTime())/3600000):""; };
const pct = (a,b) => b?Math.round(a/b*100):null;
// Regla única de cierre: siempre con nota; la foto es opcional. Se usa desde Inicio y desde el detalle.
const cerrarReq = (r,nota,usuario) => { const now=new Date().toISOString(); return {...r,status:"Cerrada",closedAt:now,closeNote:nota,evalToken:uid()+uid()+uid(),history:[...(r.history||[]),{date:now,user:usuario,action:"Solicitud cerrada",from:r.status,to:"Cerrada",note:nota}]}; };
const reabrirReq = (r,usuario,motivo) => { const now=new Date().toISOString(); return {...r,status:"En proceso",closedAt:null,history:[...(r.history||[]),{date:now,user:usuario,action:"Solicitud reabierta",from:r.status,to:"En proceso",note:motivo||""}]}; };
// Correo de cierre al residente, con los enlaces para que confirme si quedó resuelto
const mailCierre = (r,nota) => {
  const base=SITE_URL+"/api/evaluar?id="+encodeURIComponent(r.id)+"&t="+encodeURIComponent(r.evalToken||"");
  return {requestId:r.id,date:new Date().toISOString(),to:r.requesterEmail,subject:"[CondoAdmin] Solicitud "+r.code+" cerrada",type:"Cierre",status:"Enviado",
    body:"Hola "+(r.requesterName||"")+",\n\nTu solicitud "+r.code+(r.category?" ("+r.category+")":"")+" fue cerrada.\n\nComentario de cierre: "+nota+"\n\n¿Quedó resuelto el problema? Cuéntanos con un clic:\n\n  Sí, quedó resuelto:  "+base+"&r=si\n\n  No quedó resuelto:  "+base+"&r=no\n\nTu respuesta nos ayuda a mejorar.\n\n— CondoAdmin"};
};
// La respuesta del residente vale solo para el cierre actual (si se reabre y se vuelve a cerrar, se pregunta de nuevo)
const evalDe = r => { const e=r&&r.evaluacion; return e&&typeof e.resuelto==="boolean"&&(!e.token||e.token===r.evalToken)?e:null; };
const tieneCorreo = r => !!r.requesterEmail&&r.requesterEmail.includes("@");
// Documentos antiguos guardados como {id, data:{...}}: se aplanan al leer (lo que hay en data es lo más reciente)
const aplanar = d => { if(!d||!d.data||typeof d.data!=="object"||Array.isArray(d.data)) return d; const {data,...rest}=d; return {...rest,...data}; };
// Acceso del residente verificado con código por correo (se recuerda 30 días en el dispositivo)
const ACC_LS="ca_acceso";
const getAcceso = () => { try{ const a=JSON.parse(localStorage.getItem(ACC_LS)||"null"); return a&&a.email&&a.hasta>Date.now()?a:null; }catch(_){ return null; } };
const setAcceso = a => { try{ a?localStorage.setItem(ACC_LS,JSON.stringify(a)):localStorage.removeItem(ACC_LS); }catch(_){} };

// ── Styles ─────────────────────────────────────────────────────────────────
const bdg = (c,bg) => ({display:"inline-flex",alignItems:"center",padding:"2px 6px",borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,whiteSpace:"nowrap"});
const mkBtn = (v,sm) => {
  const base={display:"inline-flex",alignItems:"center",gap:4,padding:sm?"4px 8px":"7px 12px",borderRadius:6,fontSize:sm?11:13,fontWeight:600,cursor:"pointer",border:"none",lineHeight:1.2};
  const vs={primary:{background:"#3b82f6",color:"#fff"},secondary:{background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0"},danger:{background:"#ef4444",color:"#fff"},success:{background:"#10b981",color:"#fff"},ghost:{background:"transparent",color:"#6b7280"},warning:{background:"#f59e0b",color:"#fff"},purple:{background:"#8b5cf6",color:"#fff"}};
  return {...base,...(vs[v||"primary"])};
};
const BP=(sm)=>mkBtn("primary",sm), BS=(sm)=>mkBtn("secondary",sm), BD=(sm)=>mkBtn("danger",sm),
      BG=(sm)=>mkBtn("ghost",sm), BSu=(sm)=>mkBtn("success",sm), BW=(sm)=>mkBtn("warning",sm), BPu=(sm)=>mkBtn("purple",sm);
const card={background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px",marginBottom:12};
const inp={width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box"};
const sel={width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box"};
const lbl={fontSize:12,fontWeight:600,color:"#374151",marginBottom:3,display:"block"};
const fg={marginBottom:10};
const thS={textAlign:"left",padding:"6px 8px",borderBottom:"2px solid #e2e8f0",fontWeight:600,fontSize:10,color:"#6b7280",textTransform:"uppercase",whiteSpace:"nowrap"};
const tdS={padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",fontSize:12};
const tbl={width:"100%",borderCollapse:"collapse",fontSize:12};
const kpi={background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px"};
const alrt = t => ({padding:"8px 12px",borderRadius:6,fontSize:12,marginBottom:10,
  background:t==="error"?"#fef2f2":t==="success"?"#f0fdf4":t==="warning"?"#fffbeb":"#eff6ff",
  color:t==="error"?"#dc2626":t==="success"?"#16a34a":t==="warning"?"#92400e":"#1d4ed8",
  border:"1px solid "+(t==="error"?"#fca5a5":t==="success"?"#86efac":t==="warning"?"#fde68a":"#bfdbfe")});
const MSt={position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"8px",overflowY:"auto"};
const thumb={width:64,height:48,objectFit:"cover",borderRadius:6,border:"1px solid #e2e8f0"};

// ── Helpers ────────────────────────────────────────────────────────────────
function useMob(){
  const [m,setM]=useState(window.innerWidth<768);
  useEffect(()=>{const h=()=>setM(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return m;
}
function SBadge({s}){const c=SC[s]||"#64748b";return <span style={bdg(c,c+"22")}>{s}</span>;}
function PBadge({p}){return <span style={{...bdg(PC[p]||"#64748b",PB[p]||"#f9fafb"),fontWeight:700}}>{p==="Emergencia"?"⚠ ":""}{p}</span>;}
function MBadge({m}){const st=getMantStatus(m);const dot=st==="Vigente"?"✓":st==="Por vencer"?"!":st==="Vencida"?"✗":"~";return <span style={bdg(MANT_SC[st]||"#64748b",MANT_SB[st]||"#f9fafb")}>{dot} {st}</span>;}
function IR({l,v}){return <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600}}>{v==null?"---":String(v)}</span></div>;}
function Empty({msg}){return <div style={{textAlign:"center",padding:"40px 20px",color:"#94a3b8",fontSize:13}}>{msg}</div>;}
function Kpi({value,label,color,mob,onClick}){return <div onClick={onClick} title={onClick?"Ver detalle":undefined} style={{...kpi,borderTop:"3px solid "+color,cursor:onClick?"pointer":"default"}}><div style={{fontSize:mob?18:24,fontWeight:700,color}}>{value}</div><div style={{fontSize:11,color:"#64748b",marginTop:3}}>{label}{onClick?" ›":""}</div></div>;}
function Grid({cols,mob,children}){return <div style={{display:"grid",gridTemplateColumns:"repeat("+(mob?2:cols)+",1fr)",gap:12,marginBottom:16}}>{children}</div>;}
function Tabs({tabs,active,onChange,accent}){
  const ac=accent||"#3b82f6";
  return (
    <div style={{display:"flex",borderBottom:"2px solid #e2e8f0",marginBottom:12,overflowX:"auto"}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)} style={{...BG(false),borderRadius:0,padding:"8px 12px",whiteSpace:"nowrap",borderBottom:active===t.id?"2px solid "+ac:"2px solid transparent",marginBottom:-2,color:active===t.id?ac:"#64748b",fontWeight:active===t.id?700:400}}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
function Loader(){return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16,background:"#f1f5f9"}}><div style={{width:40,height:40,border:"4px solid #e2e8f0",borderTop:"4px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{color:"#64748b",fontSize:14}}>Cargando...</div><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style></div>;}

// ── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar({navItems,view,session,viewAs,setViewAs,setView,setNavOpen,handleLogout,er,mob}){
  const navTo = id => { setView(id); setNavOpen(false); };
  const isAct = id => view===id||(view==="detail"&&id==="requests");
  return (
    <div style={{width:mob?260:220,background:"#0f172a",display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto",position:mob?"fixed":"relative",top:0,left:0,bottom:0,height:mob?"100vh":"auto",zIndex:50}}>
      {!mob&&(
        <div onClick={()=>navTo(er==="Proveedor"?"provider":"dashboard")} style={{padding:"18px 14px 14px",borderBottom:"1px solid #1e293b",cursor:"pointer"}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:15}}>CondoAdmin</div>
          <div style={{color:"#64748b",fontSize:11,marginTop:2}}>Sistema de Gestion</div>
        </div>
      )}
      <nav style={{padding:"6px 0",flex:1}}>
        {navItems.map(n=>(
          <button key={n.id} onClick={()=>navTo(n.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:mob?"12px 14px":"10px 14px",cursor:"pointer",fontSize:13,color:isAct(n.id)?"#fff":"#94a3b8",background:isAct(n.id)?"#1e3a5f":"transparent",borderLeft:isAct(n.id)?"3px solid #3b82f6":"3px solid transparent",borderTop:"none",borderRight:"none",borderBottom:"none",fontWeight:isAct(n.id)?600:400,outline:"none"}}>
            <span style={{width:20,textAlign:"center",fontSize:15}}>{n.icon}</span>
            <span style={{flex:1}}>{n.label}</span>
            {n.badge>0&&<span title={n.badgeTitle} style={{background:n.badgeRed?"#ef4444":"#334155",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{n.badge}</span>}
          </button>
        ))}
      </nav>
      <div style={{padding:"10px 14px",borderTop:"1px solid #1e293b"}}>
        <div style={{marginBottom:10}}>
          <div style={{color:"#fff",fontSize:12,fontWeight:600,marginBottom:2}}>{session.nombre}</div>
          <div style={{color:"#64748b",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{session.email}</div>
          <span style={bdg("#93c5fd","#1e3a5f")}>{session.rol}</span>
        </div>
        {can(session.rol,"viewAs")&&!viewAs&&(
          <div style={{marginBottom:8}}>
            <div style={{color:"#64748b",fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Ver como</div>
            <select style={{width:"100%",background:"#1e293b",color:"#a78bfa",border:"1px solid #4c1d95",borderRadius:6,padding:"6px 8px",fontSize:12}} defaultValue="" onChange={ev=>{if(ev.target.value){setViewAs(ev.target.value);setView(ev.target.value==="Proveedor"?"provider":"dashboard");}}}>
              <option value="">Seleccionar perfil...</option>
              {ROLES.filter(r=>r!==session.rol).map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        )}
        {viewAs&&<button style={{...BS(true),width:"100%",justifyContent:"center",marginBottom:8}} onClick={()=>{setViewAs(null);setView("dashboard");}}>Salir de vista</button>}
        <button style={{...BD(true),width:"100%",justifyContent:"center"}} onClick={handleLogout}>Cerrar sesion</button>
      </div>
    </div>
  );
}

// ── Login ──────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [mode,setMode]=useState(null);
  const [email,setEmail]=useState(""); const [pass,setPass]=useState("");
  const [load,setLoad]=useState(false); const [err,setErr]=useState("");
  const [resEmail,setResEmail]=useState(""); const [resErr,setResErr]=useState("");
  const [loggedUser,setLoggedUser]=useState(null); // usuario autenticado esperando elegir módulo

  const doLogin=async()=>{
    if(!email||!pass){setErr("Ingrese correo y contraseña");return;}
    if(load) return;
    setLoad(true);setErr("");
    try{
      const correo=email.trim();
      const auth=await signIn(correo,pass);
      // Se busca el usuario tal como se escribió y también en minúsculas
      let users=[];
      for(const e of [...new Set([correo,correo.toLowerCase()])]){
        const snap=await getDocs(query(collection(fbDb,"usuarios"),where("email","==",e),where("active","==",true)));
        users=snap.docs.map(d=>d.data());
        if(users.length) break;
      }
      if(!users||users.length===0) throw new Error("Usuario no encontrado o inactivo");
      setLoggedUser({...users[0],token:auth.access_token});
      setMode("menu_personal"); // mostrar menú de módulos
    }catch(ex){
      const c=ex&&ex.code||"";
      if(c==="auth/invalid-credential"||c==="auth/wrong-password"||c==="auth/user-not-found"||c==="auth/invalid-email"){
        setErr("Correo o contraseña incorrectos. Si es tu primer ingreso o la olvidaste, toca «¿Olvidaste tu contraseña?» y te llegará un correo para crearla.");
      } else if(c==="auth/too-many-requests"||ex.message?.includes("rate limit")||ex.message?.includes("429")){
        setErr("Demasiados intentos. Espera unos minutos e intenta de nuevo.");
      } else if(c==="auth/network-request-failed"){
        setErr("Sin conexión. Revisa internet e intenta de nuevo.");
      } else if(c==="auth/user-disabled"){
        setErr("Esta cuenta está deshabilitada. Contacta a la administración.");
      } else {
        setErr(ex.message||"Credenciales incorrectas");
      }
    }
    setLoad(false);
  };

  const doResidente=()=>{
    if(!resEmail||!/\S+@\S+\.\S+/.test(resEmail)){setResErr("Ingrese un correo válido");return;}
    onLogin({id:"guest",nombre:"Residente",email:resEmail,rol:"Residente",token:null,openNewReq:true});
  };

  if(!mode) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{background:"#0f172a",borderRadius:16,width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:28}}>🏢</div>
          <div style={{fontWeight:700,fontSize:24,color:"#0f172a"}}>CondoAdmin</div>
          <div style={{color:"#64748b",fontSize:14,marginTop:4}}>Sistema de Gestión de Condominios</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={()=>setMode("residente")} style={{background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(59,130,246,.35)"}}>
            <div style={{fontSize:36}}>🏠</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Soy Residente</div><div style={{color:"#bfdbfe",fontSize:12,marginTop:2}}>Parking o incidencias</div></div>
            <div style={{marginLeft:"auto",color:"#bfdbfe",fontSize:20}}>→</div>
          </button>
          <button onClick={()=>setMode("personal")} style={{background:"linear-gradient(135deg,#0f172a,#1e3a5f)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(0,0,0,.25)"}}>
            <div style={{fontSize:36}}>🔑</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Acceso Personal</div><div style={{color:"#94a3b8",fontSize:12,marginTop:2}}>Administración, Conserjería, Comité</div></div>
            <div style={{marginLeft:"auto",color:"#94a3b8",fontSize:20}}>→</div>
          </button>
        </div>
      </div>
    </div>
  );

  if(mode==="residente") return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"linear-gradient(160deg,#1d4ed8,#3b82f6)",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>{setMode(null);setResErr("");setResEmail("");}} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",marginBottom:24}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}><div style={{fontSize:48,marginBottom:12}}>🏠</div><div style={{fontWeight:700,fontSize:22,color:"#fff"}}>Soy Residente</div><div style={{color:"#bfdbfe",fontSize:14,marginTop:6}}>¿Qué deseas hacer?</div></div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={()=>window.open("https://parkadmin-ashy.vercel.app/","_blank")} style={{background:"linear-gradient(135deg,#059669,#047857)",border:"none",borderRadius:14,padding:"20px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(5,150,105,.4)"}}>
            <div style={{fontSize:36}}>🅿️</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Condo Parking</div><div style={{color:"#a7f3d0",fontSize:12,marginTop:2}}>Reserva y gestión de estacionamientos</div></div>
            <div style={{marginLeft:"auto",color:"#a7f3d0",fontSize:20}}>→</div>
          </button>
          <button onClick={()=>onLogin({id:"guest",nombre:"Residente",email:"",rol:"Residente",token:null,openNewReq:true})} style={{background:"linear-gradient(135deg,#dc2626,#991b1b)",border:"none",borderRadius:14,padding:"20px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(220,38,38,.4)"}}>
            <div style={{fontSize:36}}>🚨</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Reportar Incidencia</div><div style={{color:"#fca5a5",fontSize:12,marginTop:2}}>Ingresa y reporta tu solicitud</div></div>
            <div style={{marginLeft:"auto",color:"#fca5a5",fontSize:20}}>→</div>
          </button>
        </div>
      </div>
    </div>
  );

  if(mode==="menu_personal"&&loggedUser) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:8}}>👋</div>
          <div style={{fontWeight:700,fontSize:20,color:"#fff"}}>Hola, {loggedUser.nombre}</div>
          <div style={{color:"#94a3b8",fontSize:13,marginTop:4}}>¿A qué módulo deseas acceder?</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={()=>onLogin(loggedUser)} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",border:"none",borderRadius:14,padding:"18px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,boxShadow:"0 4px 14px rgba(99,102,241,.4)"}}>
            <div style={{fontSize:32}}>🚨</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:16}}>Incidencias</div><div style={{color:"#c7d2fe",fontSize:12,marginTop:2}}>Gestión de solicitudes y órdenes</div></div>
            <div style={{marginLeft:"auto",color:"#c7d2fe",fontSize:18}}>→</div>
          </button>
          <button onClick={()=>window.open("https://parkadmin-ashy.vercel.app/","_blank")} style={{background:"linear-gradient(135deg,#059669,#047857)",border:"none",borderRadius:14,padding:"18px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,boxShadow:"0 4px 14px rgba(5,150,105,.4)"}}>
            <div style={{fontSize:32}}>🅿️</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:16}}>Parking</div><div style={{color:"#a7f3d0",fontSize:12,marginTop:2}}>Gestión de estacionamientos</div></div>
            <div style={{marginLeft:"auto",color:"#a7f3d0",fontSize:18}}>→</div>
          </button>
          <button onClick={()=>window.open("https://com12norte.github.io/administracion-edificio/","_blank")} style={{background:"linear-gradient(135deg,#b45309,#92400e)",border:"none",borderRadius:14,padding:"18px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,boxShadow:"0 4px 14px rgba(180,83,9,.4)"}}>
            <div style={{fontSize:32}}>🧾</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:16}}>Comprobante y Controles</div><div style={{color:"#fde68a",fontSize:12,marginTop:2}}>Comprobantes de entrega y listado de controles</div></div>
            <div style={{marginLeft:"auto",color:"#fde68a",fontSize:18}}>→</div>
          </button>
        </div>
      </div>
    </div>
  );

  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>{setMode(null);setErr("");}} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#94a3b8",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",marginBottom:24}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}><div style={{fontSize:48,marginBottom:12}}>🔑</div><div style={{fontWeight:700,fontSize:22,color:"#fff"}}>Acceso Personal</div></div>
        {err&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",color:"#dc2626",padding:"8px 12px",borderRadius:8,fontSize:13,marginBottom:16}}>{err}</div>}
        <div style={{marginBottom:14}}><label style={{...lbl,color:"#94a3b8"}}>Correo</label><input style={{...inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="email" value={email} onChange={ev=>setEmail(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&doLogin()}/></div>
        <div style={{marginBottom:8}}><label style={{...lbl,color:"#94a3b8"}}>Contraseña</label><input style={{...inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="password" value={pass} onChange={ev=>setPass(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&doLogin()}/></div>
        <div style={{textAlign:"right",marginBottom:20}}>
          <button onClick={async()=>{
            if(!email||!email.includes("@")){setErr("Ingrese su correo primero");return;}
            try{await sendPasswordResetEmail(fbAuth,email);setErr("✓ Mail enviado a "+email);}catch(_){setErr("Error al enviar.");}
          }} style={{background:"none",border:"none",color:"#6366f1",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>¿Olvidaste tu contraseña?</button>
        </div>
        <button style={{width:"100%",padding:"13px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer"}} onClick={doLogin} disabled={load}>{load?"Ingresando...":"Ingresar"}</button>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App(){
  const mob=useMob();
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [viewAs,setViewAs]=useState(null);
  const [view,setView]=useState("dashboard");
  const [reqs,setReqs]=useState([]);
  const [tasks,setTasks]=useState([]);
  const [atts,setAtts]=useState([]);
  const [emails,setEmails]=useState([]);
  const [inspections,setInsp]=useState([]);
  const [inventory,setInv]=useState([]);
  const [mant,setMant]=useState([]);
  const [cats,setCats]=useState(Object.entries(DEF_CATS).map(([name,subs],i)=>({id:"cat"+i,name,subs,active:true,order:i})));
  const [towers,setTowers]=useState([{id:"t1",name:"A",label:"Torre A",active:true},{id:"t2",name:"B",label:"Torre B",active:true},{id:"t3",name:"C",label:"Torre C",active:true},{id:"t4",name:"Comun",label:"Area Comun",active:true}]);
  const [equipos,setEquipos]=useState(EQUIP_TIPOS.map(eq=>({...eq,active:false})));
  const [certs,setCerts]=useState([]);
  const [usuarios,setUsuarios]=useState([]);
  const [selReq,setSelReq]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [toast,setToast]=useState(null);
  const [navOpen,setNavOpen]=useState(false);

  const er=session?(viewAs||session.rol):"Residente";
  const toastT=useRef(null);
  const showToast=(msg,type)=>{clearTimeout(toastT.current);setToast({msg,type:type||"success"});toastT.current=setTimeout(()=>setToast(null),type==="error"?6000:3200);};
  const [dataLoading,setDataLoading]=useState(false);
  const [listTab,setListTab]=useState("abiertas");
  const goList=t=>{setListTab(t);setView("requests");};

  const handleLogin=user=>{
    setSession(user);
    if(user.token) _tok=user.token;
    if(user.openNewReq) setShowNew(true);
    if(user.rol==="Residente") setView("mis_reqs");
  };
  const handleLogout=()=>{setAcceso(null);setSession(null);setViewAs(null);setView("dashboard");_tok=null;};

  useEffect(()=>{setLoading(false);},[]);

  useEffect(()=>{
    if(!session) return;
    (async()=>{
      setDataLoading(true);
      try{
        const [rR,rT,rI,rM,rIn,rE,rCfg,rU]=await Promise.all([
          dbGet("solicitudes"),
          dbGet("tareas"),
          dbGet("inventario"),
          dbGet("mantenciones"),
          dbGet("inspecciones"),
          dbGet("correos"),
          dbGet("config"),
          dbGet("usuarios"),
        ]);
        if(Array.isArray(rR)) setReqs(rR.filter(Boolean).map(r=>normReq(aplanar(r))));
        if(Array.isArray(rT)) setTasks(rT.filter(Boolean).map(r=>normTask(aplanar(r))));
        if(Array.isArray(rI)) setInv(rI.filter(Boolean).map(aplanar));
        if(Array.isArray(rM)) setMant(rM.filter(Boolean).map(r=>normMant(aplanar(r))));
        if(Array.isArray(rIn)) setInsp(rIn.filter(Boolean).map(r=>normInsp(aplanar(r))));
        if(Array.isArray(rE)) setEmails(rE.filter(Boolean).map(aplanar).sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)));
        if(Array.isArray(rU)) setUsuarios(rU);
        // config guardado como doc "main" con campos directos
        if(Array.isArray(rCfg)) {
          const cfg = rCfg.find(c=>c && (c.towers||c.cats||c.resps||c.equipos)) || rCfg[0];
          // Los cambios hechos en Configuración se guardan en documentos propios {key,data}; tienen prioridad
          const propio=k=>{const d=rCfg.find(c=>c&&c.key===k&&Array.isArray(c.data));return d?d.data:null;};
          const val=k=>propio(k)||(cfg&&Array.isArray(cfg[k])?cfg[k]:null);
          if(val("cats")) setCats(val("cats"));
          if(val("towers")) setTowers(val("towers"));
          if(val("equipos")) setEquipos(val("equipos"));
          if(val("certs")) setCerts(val("certs"));
        }
      }catch(ex){console.error("load error",ex);showToast("No se pudieron cargar los datos. Revisa tu conexión y vuelve a entrar.","error");}
      finally{setDataLoading(false);}
    })();
  },[session]);

  // Los recordatorios diarios los maneja el cron de GitHub Actions (api/cron-recordatorios.js)
  // No se envían correos desde el frontend para evitar duplicados al abrir la app.

  // Se guarda con los campos directos en el documento (igual que se leen) y se elimina el antiguo campo "data"
  const persist=async(table,item)=>{if(!item||item.id==null||item.id==="")return;try{await setDoc(doc(fbDb,table,String(item.id)),{...JSON.parse(JSON.stringify(item)),data:deleteField()},{merge:true});}catch(ex){console.error("persist error",table,ex);showToast("No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.","error");}};
  const persistCfg=async(key,data)=>{try{await dbUpsert("config",{key,data});}catch(_){}};

  const mkDB=(setter,table)=>updater=>setter(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old||JSON.stringify(old)!==JSON.stringify(item))persist(table,item);});
    return next;
  });
  const mkDBDel=(setter,table)=>{
    const set=mkDB(setter,table);
    const del=async id=>{setter(prev=>prev.filter(x=>x.id!==id));try{await dbDelete(table,"id=eq."+id);}catch(_){}};
    return {set,del};
  };

  const reqsDB=mkDBDel(setReqs,"solicitudes");
  const tasksDB=mkDBDel(setTasks,"tareas");
  const setReqsDB=reqsDB.set;
  const deleteReq=async(id)=>{
    const related=tasks.filter(t=>t.requestId===id).map(t=>t.id);
    setReqs(prev=>prev.filter(x=>x.id!==id));
    try{await dbDelete("solicitudes","id=eq."+id);}catch(_){}
    setTasks(prev=>prev.filter(x=>!related.includes(x.id)));
    for(const tid of related){try{await dbDelete("tareas","id=eq."+tid);}catch(_){}}
  };
  const setTasksDB=tasksDB.set;
  const deleteTask=tasksDB.del;
  const setInvDB=mkDB(setInv,"inventario");
  const setMantDB=mkDB(setMant,"mantenciones");
  const setInspDB=mkDB(setInsp,"inspecciones");
  const setCatsDB=updater=>setCats(prev=>{const next=typeof updater==="function"?updater(prev):updater;persistCfg("cats",next);return next;});
  const setTowersDB=updater=>setTowers(prev=>{const next=typeof updater==="function"?updater(prev):updater;persistCfg("towers",next);return next;});
  const setEquiposDB=updater=>setEquipos(prev=>{const next=typeof updater==="function"?updater(prev):updater;persistCfg("equipos",next);return next;});
  const setCertsDB=updater=>setCerts(prev=>{const next=typeof updater==="function"?updater(prev):updater;persistCfg("certs",next);return next;});

  const addEmail=async log=>{
    const item={id:"e"+uid(),...log};
    setEmails(p=>[item,...p]);
    try{await setDoc(doc(fbDb,"correos",String(item.id)),{...JSON.parse(JSON.stringify(item)),request_id:item.requestId||""},{merge:true});}catch(_){}
    // Enviar mail en background sin bloquear
    sendMail(log.to, log.subject, log.body).catch(ex=>console.warn("addEmail sendMail",ex));
  };

  const openReq=r=>{setSelReq(r);setView("detail");setNavOpen(false);};

  const respList=usuarios.length?[...usuarios.filter(u=>u.active&&u.rol!=="Residente").map(u=>u.nombre),"Sin asignar"]:["Sin asignar"];
  const respAssign=usuarios.length?usuarios.filter(u=>u.active&&u.rol!=="Residente").map(u=>u.nombre):[];

  const _reqIds=new Set(reqs.map(r=>r.id));
  const nAbiertas=reqs.filter(esAbierta).length;
  const nOrdVenc=tasks.filter(t=>_reqIds.has(t.requestId)&&tareaPend(t)&&diffDue(t)<0).length;
  const nMantVenc=mant.filter(m=>getMantStatus(m)==="Vencida").length;
  const navItems=[
    {id:"dashboard",label:"Inicio",icon:"🏠"},
    {id:"mis_reqs",label:"Mis Solicitudes",icon:"📋"},
    {id:"requests",label:"Solicitudes",icon:"📋",badge:nAbiertas,badgeTitle:"Solicitudes abiertas"},
    {id:"tasks",label:"Órdenes de trabajo",icon:"🛠️",badge:nOrdVenc,badgeRed:true,badgeTitle:"Órdenes vencidas sin informe"},
    {id:"misolicitudes",label:"Mis Órdenes",icon:"✅"},{id:"inspections",label:"Novedades",icon:"📝"},{id:"inventory",label:"Inventario",icon:"📦"},
    {id:"mantencion",label:"Mantención",icon:"🔧",badge:nMantVenc,badgeRed:true,badgeTitle:"Mantenciones vencidas"},
    {id:"emails",label:"Correos enviados",icon:"✉️"},{id:"reports",label:"Reportes",icon:"📊"},{id:"config",label:"Configuración",icon:"⚙️"},
  ].filter(n=>{
    if(n.id==="config"&&!can(er,"manageConfig")) return false;
    if(n.id==="emails"&&!can(er,"viewEmails")) return false;
    if(n.id==="reports"&&!can(er,"viewReports")&&er!=="Comite") return false;
    if(n.id==="inspections"&&!can(er,"inspection")&&!can(er,"inspectionRead")) return false;
    if(n.id==="inventory"&&!can(er,"inventory")&&!can(er,"inventoryRead")) return false;
    if(n.id==="mantencion"&&!can(er,"mantencion")&&!can(er,"mantRead")) return false;
    if(n.id==="misolicitudes"&&er==="Residente") return false;
    if(n.id==="mis_reqs"&&er!=="Residente") return false;
    if(n.id==="tasks"&&er==="Proveedor") return false;
    if(n.id==="dashboard"&&(er==="Proveedor"||er==="Residente")) return false;
    if(n.id==="requests"&&er==="Residente") return false;
    if(n.id==="tasks"&&er==="Residente") return false;
    return true;
  });

  // Interceptar botón atrás del navegador
  useEffect(()=>{
    if(!session) return;
    const onPop=ev=>{
      ev.preventDefault();
      if(view==="detail"){ setView(er==="Residente"?"mis_reqs":"requests"); setSelReq(null); }
      else if(view!=="dashboard"){ setView("dashboard"); }
      // Siempre empujar estado para evitar salir
      window.history.pushState(null,"",window.location.href);
    };
    window.history.pushState(null,"",window.location.href);
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[session,view]);

  if(loading) return <Loader/>;
  if(!session) return <LoginScreen onLogin={handleLogin}/>;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",fontFamily:"system-ui,sans-serif",background:"#f1f5f9",color:"#1e293b",overflow:"hidden"}}>
      {viewAs&&<div style={{background:"#7c3aed",color:"#fff",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:100,fontSize:13}}><span>Visualizando como: <strong>{viewAs}</strong></span><button style={{...BG(true),color:"#fff"}} onClick={()=>{setViewAs(null);setView("dashboard");}}>Salir</button></div>}
      {mob&&<div style={{background:"#0f172a",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:60}}><div onClick={()=>{setView(er==="Proveedor"?"provider":"dashboard");setNavOpen(false);}} style={{color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer"}}>CondoAdmin</div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={bdg("#fff","#1e3a5f")}>{er}</span><button style={{background:"none",border:"none",color:"#fff",fontSize:22,cursor:"pointer"}} onClick={()=>setNavOpen(p=>!p)}>{navOpen?"✕":"☰"}</button></div></div>}
      <div style={{display:"flex",flex:1,overflow:"hidden",position:"relative"}}>
        {mob&&navOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:49}} onClick={()=>setNavOpen(false)}/>}
        {(!mob||navOpen)&&(
          <Sidebar navItems={navItems} view={view} session={session} viewAs={viewAs} setViewAs={setViewAs} setView={setView} setNavOpen={setNavOpen} handleLogout={handleLogout} er={er} mob={mob}/>
        )}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:mob?15:17,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{view==="detail"?(selReq?"Solicitud "+selReq.code:"Detalle"):(navItems.find(n=>n.id===view)||{label:view}).label}</div>
              {!mob&&<div style={{color:"#64748b",fontSize:11,marginTop:1}}>{new Date().toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
              {can(er,"create")&&!viewAs&&<button style={BP(mob)} onClick={()=>setShowNew(true)}>{mob?"+ Sol.":"+ Nueva Solicitud"}</button>}
              {!mob&&<span style={{...bdg("#fff",viewAs?"#7c3aed":"#1e3a5f"),fontSize:12,padding:"5px 10px"}}>{er}</span>}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:mob?"12px":"16px"}}>
            {dataLoading&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",marginBottom:12,background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,fontSize:13,color:"#1d4ed8"}}><div style={{width:16,height:16,border:"3px solid #bfdbfe",borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>Cargando información...<style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style></div>}
            {view==="dashboard"&&er==="Residente"&&<ResidenteReqs reqs={reqs} tasks={tasks} session={session} onOpen={openReq} onNew={()=>setShowNew(true)} mob={mob}/>}
            {view==="dashboard"&&er!=="Residente"&&<Dashboard reqs={reqs} tasks={tasks} mant={mant} role={er} onOpen={openReq} onNew={()=>setShowNew(true)} mob={mob} deleteTask={deleteTask} deleteReq={deleteReq} setReqs={setReqsDB} showToast={showToast} goList={goList} addEmail={addEmail} session={session}/>}
            {view==="requests"&&<ReqList reqs={reqs} role={er} onOpen={openReq} setReqs={setReqsDB} deleteReq={deleteReq} showToast={showToast} addEmail={addEmail} mob={mob} towers={towers} respList={respList} session={session} tab={listTab} setTab={setListTab}/>}
            {view==="detail"&&selReq&&<ReqDetail req={selReq} reqs={reqs} tasks={tasks} atts={atts} emails={emails} role={er} setReqs={setReqsDB} setTasks={setTasksDB} deleteTask={deleteTask} setAtts={setAtts} addEmail={addEmail} showToast={showToast} onBack={()=>setView(er==="Residente"?"mis_reqs":"requests")} setSelReq={setSelReq} mob={mob} respList={respList} respAssign={respAssign} usuarios={usuarios} session={session}/>}
            {view==="tasks"&&<TasksView tasks={tasks} reqs={reqs} role={er} setTasks={setTasksDB} deleteTask={deleteTask} showToast={showToast} mob={mob} respAssign={respAssign} onOpen={openReq}/>}
            {view==="misolicitudes"&&<MisSolicitudes tasks={tasks} reqs={reqs} session={session} role={er} onOpen={openReq} mob={mob}/>}
            {view==="mis_reqs"&&<ResidenteReqs reqs={reqs} tasks={tasks} session={session} onOpen={openReq} onNew={()=>setShowNew(true)} mob={mob}/>}
            {view==="provider"&&<ProviderDash role={er} mob={mob} reqs={reqs} session={session}/>}
            {view==="inspections"&&<Inspections inspections={inspections} setInsp={setInspDB} reqs={reqs} setReqs={setReqsDB} showToast={showToast} role={er} mob={mob} towers={towers}/>}
            {view==="inventory"&&<InvView inventory={inventory} setInv={setInvDB} reqs={reqs} role={er} showToast={showToast} mob={mob}/>}
            {view==="mantencion"&&<MantView mant={mant} setMant={setMantDB} role={er} showToast={showToast} mob={mob} respList={respList} towers={towers} equipos={equipos} setEquipos={setEquiposDB} certs={certs} setCerts={setCertsDB}/>}
            {view==="emails"&&<EmailsView logs={emails} setEmails={setEmails} role={er}/>}
            {view==="reports"&&<Reports reqs={reqs} tasks={tasks} inventory={inventory} mob={mob}/>}
            {view==="config"&&<ConfigView cats={cats} setCats={setCatsDB} towers={towers} setTowers={setTowersDB} equipos={equipos} setEquipos={setEquiposDB} showToast={showToast} session={session} setUsuarios={setUsuarios}/>}
          </div>
        </div>
      </div>
      {showNew&&<NewReqModal role={er} reqs={reqs} setReqs={setReqsDB} addEmail={addEmail} showToast={showToast} onClose={()=>setShowNew(false)} onOpen={openReq} cats={cats} towers={towers} session={session} usuarios={usuarios}/>}
      {toast&&<div role="status" onClick={()=>setToast(null)} style={{...alrt(toast.type),position:"fixed",bottom:20,right:16,left:mob?16:"auto",zIndex:2000,boxShadow:"0 4px 12px rgba(0,0,0,.15)",minWidth:mob?undefined:260,cursor:"pointer",fontSize:13,marginBottom:0}}>{toast.type==="error"?"⚠ ":"✓ "}{toast.msg}</div>}
    </div>
  );
}

// ── Ayudas visuales de estado ──────────────────────────────────────────────
const PASOS=["Ingresada","En revision","Asignada","En proceso","Resuelta","Cerrada"];
const PASO_LBL={Ingresada:"Ingresada","En revision":"En revisión",Asignada:"Asignada","En proceso":"En proceso",Resuelta:"Resuelta",Cerrada:"Cerrada"};
// Barra de avance: muestra de un vistazo en qué etapa va la solicitud
function Pasos({status,mob}){
  if(status==="Rechazada") return <div style={{...alrt("error"),marginBottom:12}}>Esta solicitud fue <strong>rechazada</strong>.</div>;
  const idx=Math.max(0,PASOS.indexOf(status));
  return(
    <div style={{...card,padding:mob?"10px 8px":"12px 16px",display:"flex",alignItems:"flex-start"}}>
      {PASOS.map((p,i)=>{
        const hecho=i<idx||status==="Cerrada", actual=i===idx&&status!=="Cerrada";
        const col=hecho?"#10b981":actual?"#3b82f6":"#cbd5e1";
        return(
          <div key={p} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative",minWidth:0}}>
            {i>0&&<div style={{position:"absolute",top:mob?9:11,right:"50%",width:"100%",height:2,background:i<=idx?"#10b981":"#e2e8f0"}}/>}
            <div style={{width:mob?20:24,height:mob?20:24,borderRadius:"50%",background:hecho||actual?col:"#fff",border:"2px solid "+col,color:"#fff",fontSize:mob?10:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",zIndex:1,boxShadow:actual?"0 0 0 4px #dbeafe":"none"}}>{hecho?"✓":actual?i+1:""}</div>
            <div style={{fontSize:mob?9:11,marginTop:4,textAlign:"center",color:actual?"#1d4ed8":hecho?"#475569":"#94a3b8",fontWeight:actual?700:400,lineHeight:1.2}}>{PASO_LBL[p]}</div>
          </div>
        );
      })}
    </div>
  );
}
// Explica en palabras simples qué pasa con la solicitud y qué viene ahora
const sigPaso=(r,role,nPend)=>{
  const sinAs=!r.assignedTo||r.assignedTo==="Sin asignar";
  if(role==="Residente") return ({
    Ingresada:"Recibimos tu solicitud. La administración la revisará pronto.",
    "En revision":"La administración está revisando tu solicitud.",
    Asignada:"Tu solicitud ya tiene un responsable"+(sinAs?"":": "+r.assignedTo)+".",
    "En proceso":"Se está trabajando en la solución.",
    Resuelta:"El trabajo fue realizado. Falta la revisión final de la administración.",
    Cerrada:"Solicitud cerrada.",
    Rechazada:"La solicitud fue rechazada. Revisa los comentarios para conocer el motivo.",
  })[r.status]||null;
  if(!esAbierta(r)) return null;
  if(can(role,"assign")&&sinAs) return "Siguiente paso: asigna un responsable.";
  if(can(role,"closeCases")&&r.status==="Resuelta") return "Siguiente paso: revisa el trabajo y cierra la solicitud.";
  if(nPend>0) return "Hay "+nPend+" orden"+(nPend>1?"es":"")+" de trabajo sin informe de cierre.";
  if(can(role,"createTask")&&r.status==="Asignada") return "Siguiente paso: crea una orden de trabajo para "+r.assignedTo+".";
  return null;
};

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({reqs,tasks,mant,role,onOpen,onNew,setReqs,showToast,mob,deleteTask,deleteReq,goList,addEmail,session}){
  const abiertas=reqs.filter(esAbierta).sort(ordPrioridad);
  const emerg=abiertas.filter(r=>r.priority==="Emergencia");
  const sinAsignar=abiertas.filter(r=>!r.assignedTo||r.assignedTo==="Sin asignar");
  const recent=[...reqs].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
  const byCat=Object.keys(DEF_CATS).map(c=>({c,n:reqs.filter(r=>r.category===c).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,6);
  const mv=mant.filter(m=>getMantStatus(m)==="Vencida").length;
  const mp=mant.filter(m=>getMantStatus(m)==="Por vencer").length;
  const isAnalyst=role==="Administrador"||role==="Administrador Edificio"||role==="Comite";
  const puedeCerrar=can(role,"closeCases")&&!!setReqs;
  const [closingId,setClosingId]=useState(null);
  const [closeNote,setCloseNote]=useState("");
  const [verTodas,setVerTodas]=useState(false);
  const [verVenc,setVerVenc]=useState(false);

  const quickClose=(r)=>{
    if(!closeNote.trim()){showToast("Escribe una nota de cierre","error");return;}
    const upd=cerrarReq(r,closeNote.trim(),session?.nombre||role);
    setReqs(p=>p.map(x=>x.id===r.id?upd:x));
    if(tieneCorreo(upd)&&addEmail) addEmail(mailCierre(upd,closeNote.trim()));
    showToast("Solicitud "+r.code+" cerrada"+(tieneCorreo(upd)?" · se avisó al residente":""));
    setClosingId(null); setCloseNote("");
  };

  const nFuera=abiertas.filter(fueraPlazo).length;
  // Cerradas que el residente marcó como NO resueltas
  const noResueltas=reqs.filter(r=>r.status==="Cerrada"&&evalDe(r)&&evalDe(r).resuelto===false);
  const reabrir=r=>{ setReqs(p=>p.map(x=>x.id===r.id?reabrirReq(r,session?.nombre||role,"El residente indicó que no quedó resuelto"):x)); showToast("Solicitud "+r.code+" reabierta"); };
  const tareasVencidas=tasks.filter(t=>tareaPend(t)&&diffDue(t)<0).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const tareasPorVencer=tasks.filter(t=>tareaPend(t)&&diffDue(t)>=0&&diffDue(t)<=3).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const listaVenc=verVenc?tareasVencidas:tareasVencidas.slice(0,5);
  const listaAb=verTodas?abiertas:abiertas.slice(0,8);

  const filaOrden=(t,borde,badge)=>{
    const req=reqs.find(r=>r.id===t.requestId);
    return(
      <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid "+borde,flexWrap:"wrap",gap:8}}>
        <div style={{cursor:req?"pointer":"default",minWidth:0,flex:1}} onClick={()=>req&&onOpen(req)} title={req?"Abrir solicitud "+req.code:""}>
          <div style={{fontSize:12,fontWeight:600}}>{t.title}</div>
          <div style={{fontSize:11,color:"#64748b"}}>{req?<span style={{color:"#3b82f6",fontWeight:600}}>{req.code}</span>:"—"} · 👤 {t.responsible||"Sin responsable"} · 📅 {fmtD(t.dueDate)}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {badge}
          {can(role,"manageConfig")&&deleteTask&&<button style={BD(true)} onClick={()=>{if(window.confirm("¿Eliminar orden?"))deleteTask(t.id);}}>🗑</button>}
        </div>
      </div>
    );
  };

  return(
    <div>
      {emerg.map(em=>(
        <div key={em.id} style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",cursor:"pointer",display:"flex",alignItems:"center",gap:10}} onClick={()=>onOpen(em)}>
          <span style={{fontWeight:700,color:"#dc2626"}}>⚠</span>
          <div style={{flex:1}}><strong style={{color:"#dc2626"}}>EMERGENCIA: {em.code}</strong><div style={{fontSize:12,color:"#ef4444"}}>{em.category} · abierta hace {diasAbierta(em)} día(s)</div></div>
        </div>
      ))}
      {(mv>0||mp>0)&&<div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,color:"#92400e"}}>!</span><strong style={{color:"#92400e"}}>Mantenciones: {mv>0?mv+" vencida(s)":""}{mv>0&&mp>0?" / ":""}{mp>0?mp+" por vencer":""}</strong></div>}

      {/* KPIs unificados */}
      <Grid cols={4} mob={mob}>
        <Kpi value={abiertas.length} label="Solicitudes abiertas" color="#3b82f6" mob={mob} onClick={goList&&(()=>goList("abiertas"))}/>
        <Kpi value={emerg.length} label="Emergencias activas" color="#ef4444" mob={mob} onClick={goList&&(()=>goList("emergencias"))}/>
        <Kpi value={sinAsignar.length} label="Sin asignar" color="#f59e0b" mob={mob} onClick={goList&&(()=>goList("sinasignar"))}/>
        <Kpi value={nFuera} label="Fuera de plazo" color="#f97316" mob={mob} onClick={goList&&(()=>goList("fueraplazo"))}/>
      </Grid>

      {/* El residente dice que no quedó resuelto */}
      {isAnalyst&&noResueltas.length>0&&(
        <div style={{...card,background:"#fff7ed",border:"1px solid #fdba74",marginBottom:12}}>
          <div style={{fontWeight:700,color:"#c2410c",fontSize:13,marginBottom:8}}>👎 El residente indicó que NO quedó resuelto ({noResueltas.length})</div>
          {noResueltas.map(r=>(
            <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #fed7aa",flexWrap:"wrap"}}>
              <div style={{cursor:"pointer",minWidth:0,flex:1}} onClick={()=>onOpen(r)}>
                <span style={{fontWeight:600,color:"#3b82f6",fontSize:12}}>{r.code}</span><span style={{fontSize:11,color:"#64748b",marginLeft:6}}>{r.category} · {r.requesterName}</span>
                {r.closeNote&&<div style={{fontSize:11,color:"#94a3b8"}}>Cierre: {r.closeNote}</div>}
              </div>
              {puedeCerrar&&<button style={BW(true)} onClick={()=>reabrir(r)}>↺ Reabrir</button>}
            </div>
          ))}
        </div>
      )}

      {/* Órdenes vencidas sin informe */}
      {tareasVencidas.length>0&&(
        <div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",marginBottom:12}}>
          <div style={{fontWeight:700,color:"#dc2626",fontSize:13,marginBottom:8}}>⚠ Órdenes vencidas sin informe ({tareasVencidas.length})</div>
          {listaVenc.map(t=>filaOrden(t,"#fca5a5",<span style={bdg("#ef4444","#fff")}>{Math.abs(diffDue(t))} día(s) vencida</span>))}
          {tareasVencidas.length>5&&<button style={{...BS(true),marginTop:8,fontSize:11}} onClick={()=>setVerVenc(v=>!v)}>{verVenc?"Ver menos":"Ver las "+tareasVencidas.length}</button>}
        </div>
      )}

      {/* Órdenes por vencer */}
      {tareasPorVencer.length>0&&(
        <div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",marginBottom:12}}>
          <div style={{fontWeight:700,color:"#92400e",fontSize:13,marginBottom:8}}>⏰ Órdenes por vencer en 3 días ({tareasPorVencer.length})</div>
          {tareasPorVencer.map(t=>filaOrden(t,"#fde68a",<span style={bdg("#92400e","#fff")}>{diffDue(t)===0?"Vence hoy":diffDue(t)+" día(s)"}</span>))}
        </div>
      )}

      {/* Solicitudes abiertas: lo que hay que resolver, ordenado por prioridad y antigüedad */}
      {isAnalyst&&(
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontWeight:700,fontSize:13}}>📋 Solicitudes abiertas ({abiertas.length})</div>
            {can(role,"create")&&<button style={BP(true)} onClick={onNew}>+ Nueva</button>}
          </div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:8}}>Ordenadas por prioridad y antigüedad. Los gráficos y tendencias están en Reportes.</div>
          {abiertas.length===0?<Empty msg="No hay solicitudes abiertas 🎉"/>:listaAb.map(r=>{
            const da=diasAbierta(r);
            const sinAs=!r.assignedTo||r.assignedTo==="Sin asignar";
            return(
              <div key={r.id} style={{padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,cursor:"pointer"}} onClick={()=>onOpen(r)}>
                  <div style={{minWidth:0}}>
                    <span style={{fontWeight:600,color:"#3b82f6",fontSize:12}}>{r.code}</span>
                    <span style={{fontSize:11,color:"#64748b",marginLeft:6}}>{r.category}</span>
                    <div style={{fontSize:11,color:sinAs?"#d97706":"#94a3b8",fontWeight:sinAs?600:400}}>👤 {sinAs?"Sin asignar":r.assignedTo} · <span style={{color:da>30?"#ef4444":da>7?"#d97706":"#94a3b8",fontWeight:da>7?600:400}}>{da===0?"hoy":"hace "+da+" día"+(da===1?"":"s")}</span>{fueraPlazo(r)&&<span style={{...bdg("#c2410c","#fff7ed"),marginLeft:6}}>Fuera de plazo ({slaTxt(r.priority)})</span>}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end",flexShrink:0}}>
                    <PBadge p={r.priority}/><SBadge s={r.status}/>
                  </div>
                </div>
                {puedeCerrar&&(
                  closingId===r.id?(
                    <div style={{marginTop:6,display:"flex",gap:6}}>
                      <input style={{...inp,flex:1,fontSize:12,padding:"5px 8px"}} placeholder="Nota de cierre (obligatoria)..." value={closeNote} onChange={ev=>setCloseNote(ev.target.value)} onKeyDown={ev=>{if(ev.key==="Enter")quickClose(r);if(ev.key==="Escape"){setClosingId(null);setCloseNote("");}}} autoFocus/>
                      <button style={BP(true)} onClick={()=>quickClose(r)}>✓ Cerrar</button>
                      <button style={BS(true)} onClick={()=>{setClosingId(null);setCloseNote("");}}>✕</button>
                    </div>
                  ):(
                    <button style={{...BS(true),marginTop:4,fontSize:11}} onClick={()=>{setClosingId(r.id);setCloseNote("");}}>✓ Cerrar</button>
                  )
                )}
              </div>
            );
          })}
          {abiertas.length>8&&<button style={{...BS(true),marginTop:10,fontSize:11}} onClick={()=>setVerTodas(v=>!v)}>{verTodas?"Ver menos":"Ver las "+abiertas.length}</button>}
        </div>
      )}

      {/* Dashboard básico para otros roles */}
      {!isAnalyst&&(
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"2fr 1fr",gap:14}}>
          <div style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontWeight:600,fontSize:13}}>Solicitudes recientes</div>
              {can(role,"create")&&<button style={BP(true)} onClick={onNew}>+ Nueva</button>}
            </div>
            {recent.length===0?<Empty msg="Sin solicitudes"/>:recent.map(r=>(
              <div key={r.id} style={{padding:"8px 0",borderBottom:"1px solid #f1f5f9",cursor:"pointer",display:"flex",justifyContent:"space-between"}} onClick={()=>onOpen(r)}>
                <div><span style={{fontWeight:600,color:"#3b82f6",fontSize:12}}>{r.code}</span><div style={{fontSize:11,color:"#64748b"}}>{r.category}</div></div>
                <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}><PBadge p={r.priority}/><SBadge s={r.status}/></div>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Por categoria</div>
            {byCat.length===0?<Empty msg="Sin datos"/>:byCat.map(x=>(
              <div key={x.c} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{x.c}</span><span style={{fontWeight:600}}>{x.n}</span></div>
                <div style={{height:5,background:"#f1f5f9",borderRadius:99}}><div style={{height:5,background:"#3b82f6",borderRadius:99,width:(x.n/Math.max(reqs.length,1)*100)+"%"}}/></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ReqList ────────────────────────────────────────────────────────────────
function ReqList({reqs,role,onOpen,setReqs,deleteReq,showToast,addEmail,mob,towers,respList,session,tab,setTab}){
  const FI0={status:"",priority:"",tower:"",responsible:"",proveedor:"",q:""};
  const [fi,setFi]=useState(FI0);
  const [sort,setSort]=useState("date");
  const [tabLocal,setTabLocal]=useState("abiertas");
  const tabAct=tab||tabLocal;
  const cambiarTab=t=>{(setTab||setTabLocal)(t);};
  const actTowers=(towers||[]).filter(t=>t.active).map(t=>t.name);
  const base=role==="Residente"?reqs.filter(r=>r.requesterEmail===session?.email):reqs;
  const sinAsig=r=>!r.assignedTo||r.assignedTo==="Sin asignar";
  // Pestañas rápidas: lo normal es trabajar sobre lo que sigue abierto
  const TABS=[
    {id:"abiertas",label:"Abiertas",f:esAbierta},
    {id:"sinasignar",label:"Sin asignar",f:r=>esAbierta(r)&&sinAsig(r)},
    {id:"emergencias",label:"Emergencias",f:r=>esAbierta(r)&&r.priority==="Emergencia"},
    {id:"fueraplazo",label:"Fuera de plazo",f:fueraPlazo},
    {id:"cerradas",label:"Cerradas",f:r=>!esAbierta(r)},
    {id:"todas",label:"Todas",f:()=>true},
  ];
  const tabDef=TABS.find(t=>t.id===tabAct)||TABS[0];

  // Listas únicas para filtros
  const respOptions=[...new Set(base.map(r=>r.assignedTo).filter(x=>x&&x!=="Sin asignar"))].sort();
  const provOptions=[...new Set(base.map(r=>r.proveedor).filter(Boolean))].sort();
  const hayFiltros=Object.values(fi).some(Boolean);
  const q=fi.q.trim().toLowerCase();

  const visible=base.filter(r=>{
    if(!tabDef.f(r)) return false;
    if(fi.status&&r.status!==fi.status) return false;
    if(fi.priority&&r.priority!==fi.priority) return false;
    if(fi.tower&&r.tower!==fi.tower) return false;
    if(fi.responsible&&r.assignedTo!==fi.responsible) return false;
    if(fi.proveedor&&r.proveedor!==fi.proveedor) return false;
    if(q&&![r.code,r.requesterName,r.category,r.subcategory,r.description,r.unit,r.assignedTo,r.proveedor].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=>sort==="priority"?ordPrioridad(a,b):new Date(b.createdAt)-new Date(a.createdAt));

  const antig=r=>{const d=diasAbierta(r);return d===0?"hoy":"hace "+d+" día"+(d===1?"":"s");};
  const corta=(t,n)=>!t?"":t.length>n?t.slice(0,n)+"…":t;

  return(
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {TABS.map(t=>{
          const n=base.filter(t.f).length, on=tabAct===t.id;
          const rojo=t.id==="emergencias"&&n>0, amar=(t.id==="sinasignar"||t.id==="fueraplazo")&&n>0;
          const col=rojo?"#dc2626":amar?"#d97706":"#3b82f6";
          return <button key={t.id} onClick={()=>cambiarTab(t.id)} style={{padding:mob?"8px 12px":"6px 12px",borderRadius:99,fontSize:12,cursor:"pointer",border:"1px solid "+(on?col:"#e2e8f0"),background:on?col:"#fff",color:on?"#fff":(rojo||amar?col:"#475569"),fontWeight:on||rojo||amar?600:400}}>{t.label} <span style={{opacity:.85}}>({n})</span></button>;
        })}
      </div>
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <input style={{...inp,flex:"2 1 180px",minWidth:140}} placeholder="🔍 Buscar por código, nombre, depto o descripción..." value={fi.q} onChange={ev=>setFi(p=>({...p,q:ev.target.value}))}/>
          {[["status","Estado",STATUSES],["priority","Prioridad",PRIORITIES],["tower","Torre",actTowers]].map(([k,l,opts])=>(
            <select key={k} style={{...sel,flex:"1 1 110px",color:fi[k]?"#1e293b":"#94a3b8"}} value={fi[k]} onChange={ev=>{const v=ev.target.value;setFi(p=>({...p,[k]:v}));if(k==="status"&&v)cambiarTab("todas");}}>
              <option value="">{l}: todos</option>
              {opts.map(o=><option key={o}>{o}</option>)}
            </select>
          ))}
          <select style={{...sel,flex:"1 1 110px",color:fi.responsible?"#1e293b":"#94a3b8"}} value={fi.responsible} onChange={ev=>setFi(p=>({...p,responsible:ev.target.value}))}>
            <option value="">Responsable: todos</option>
            {respOptions.map(o=><option key={o}>{o}</option>)}
          </select>
          {provOptions.length>0&&(
            <select style={{...sel,flex:"1 1 110px",color:fi.proveedor?"#1e293b":"#94a3b8"}} value={fi.proveedor} onChange={ev=>setFi(p=>({...p,proveedor:ev.target.value}))}>
              <option value="">Proveedor: todos</option>
              {provOptions.map(o=><option key={o}>{o}</option>)}
            </select>
          )}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#94a3b8"}}>Ordenar:</span>
          <button style={sort==="date"?BP(true):BS(true)} onClick={()=>setSort("date")}>Más recientes</button>
          <button style={sort==="priority"?BP(true):BS(true)} onClick={()=>setSort("priority")}>Más urgentes</button>
          {hayFiltros&&<button style={BG(true)} onClick={()=>setFi(FI0)}>✕ Limpiar filtros</button>}
          <span style={{marginLeft:"auto",fontSize:11,color:"#64748b"}}>{visible.length} solicitud{visible.length===1?"":"es"}</span>
        </div>
      </div>
      {visible.length===0?(
        <div style={{...card,textAlign:"center",padding:"32px 16px"}}>
          <div style={{fontSize:13,color:"#64748b",marginBottom:hayFiltros?10:0}}>{hayFiltros?"Ninguna solicitud coincide con la búsqueda o los filtros.":tabAct==="abiertas"?"No hay solicitudes abiertas 🎉":tabAct==="sinasignar"?"Todas las solicitudes abiertas tienen responsable ✓":tabAct==="emergencias"?"No hay emergencias activas ✓":tabAct==="fueraplazo"?"Ninguna solicitud abierta está fuera de plazo ✓":"Sin solicitudes"}</div>
          {hayFiltros&&<button style={BS(true)} onClick={()=>setFi(FI0)}>Limpiar filtros</button>}
        </div>
      ):mob?(
        <div>{visible.map(r=>(
          <div key={r.id} style={{...card,padding:12,marginBottom:8,cursor:"pointer",borderLeft:"4px solid "+(PC[r.priority]||"#e2e8f0")}} onClick={()=>onOpen(r)}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <div style={{minWidth:0}}>
                <span style={{fontWeight:700,color:"#3b82f6",fontSize:13}}>{r.code}</span><span style={{fontSize:11,color:"#64748b",marginLeft:6}}>{r.category}</span>
                {r.description&&<div style={{fontSize:12,color:"#334155",marginTop:2}}>{corta(r.description,70)}</div>}
                <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{r.requesterName||"—"}{r.unit?" · "+(r.tower&&r.tower!=="Comun"?r.tower+"/":"")+r.unit:""} · {antig(r)}</div>
                <div style={{fontSize:11,color:sinAsig(r)&&esAbierta(r)?"#d97706":"#94a3b8",fontWeight:sinAsig(r)&&esAbierta(r)?600:400}}>👤 {sinAsig(r)?"Sin asignar":r.assignedTo}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}><PBadge p={r.priority}/><SBadge s={r.status}/>{fueraPlazo(r)&&<span style={bdg("#c2410c","#fff7ed")}>Fuera de plazo</span>}{(r.status==="Cerrada"&&evalDe(r))&&<span style={bdg(evalDe(r).resuelto?"#16a34a":"#c2410c",evalDe(r).resuelto?"#f0fdf4":"#fff7ed")}>{evalDe(r).resuelto?"👍":"👎 No resuelta"}</span>}</div>
            </div>
          </div>
        ))}</div>
      ):(
        <div style={{...card,overflowX:"auto"}}>
          <table style={tbl}>
            <thead><tr>{["","Código","Solicitante","Solicitud","Ubicación","Prioridad","Estado","Responsable","Proveedor","Ingreso",""].map((h,i)=><th key={i} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{visible.map(r=>(
              <tr key={r.id} style={{background:r.priority==="Emergencia"&&esAbierta(r)?"#fef2f2":"",cursor:"pointer"}} onClick={()=>onOpen(r)} title="Abrir solicitud">
                <td style={tdS}>{r.priority==="Emergencia"?"⚠":""}</td>
                <td style={tdS}><span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span></td>
                <td style={tdS}><div>{r.requesterName}</div><div style={{fontSize:10,color:"#94a3b8"}}>{r.requesterEmail}</div></td>
                <td style={{...tdS,maxWidth:240}}><div>{r.category}</div>{r.description&&<div style={{fontSize:10,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.description}>{corta(r.description,60)}</div>}</td>
                <td style={tdS}>{r.tower}{r.unit?"/"+r.unit:""}</td>
                <td style={tdS}><PBadge p={r.priority}/></td>
                <td style={tdS}><SBadge s={r.status}/></td>
                <td style={{...tdS,color:sinAsig(r)&&esAbierta(r)?"#d97706":undefined,fontWeight:sinAsig(r)&&esAbierta(r)?600:400}}>{r.assignedTo}</td>
                <td style={tdS}>{r.proveedor||"—"}</td>
                <td style={tdS}><div style={{fontSize:11,color:"#64748b"}}>{fmtD(r.createdAt)}</div>{esAbierta(r)&&<div style={{fontSize:10,color:diasAbierta(r)>30?"#ef4444":diasAbierta(r)>7?"#d97706":"#94a3b8"}}>{antig(r)}</div>}{fueraPlazo(r)&&<div style={{fontSize:10,color:"#c2410c",fontWeight:600}}>Fuera de plazo</div>}{(r.status==="Cerrada"&&evalDe(r))&&<div style={{fontSize:10,color:evalDe(r).resuelto?"#16a34a":"#c2410c",fontWeight:600}}>{evalDe(r).resuelto?"👍 Confirmada":"👎 No resuelta"}</div>}</td>
                <td style={tdS} onClick={ev=>ev.stopPropagation()}>
                  <div style={{display:"flex",gap:4}}>
                    {can(role,"manageConfig")&&(
                      <button style={BD(true)} title="Eliminar solicitud" onClick={ev=>{ev.stopPropagation();if(window.confirm("¿Eliminar "+r.code+"? Esta acción no se puede deshacer."))deleteReq(r.id);}}>🗑</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ReqDetail ──────────────────────────────────────────────────────────────
function ReqDetail({req,reqs,tasks,atts,emails,role,setReqs,setTasks,deleteTask,setAtts,addEmail,showToast,onBack,setSelReq,mob,respList,respAssign,usuarios,session}){
  const r=reqs.find(x=>x.id===req.id)||req;
  const safeHistory=r.history||[];
  const safeComments=r.comments||[];
  const myTasks=tasks.filter(t=>t.requestId===r.id);
  const myEmails=emails.filter(em=>em.requestId===r.id);
  const [comment,setComment]=useState("");
  const [ns,setNs]=useState(r.status);
  const [asgn,setAsgn]=useState(r.assignedTo||"Sin asignar");
  const [showTF,setShowTF]=useState(false);
  const [showEv,setShowEv]=useState(null);
  const [showCl,setShowCl]=useState(false);
  const [tab,setTab]=useState("info");

  const upd=(ch,he)=>{
    const updated={...r,...ch,history:he?[...safeHistory,{date:new Date().toISOString(),user:role,...he}]:safeHistory};
    setReqs(p=>p.map(x=>x.id===r.id?updated:x));
    setSelReq(prev=>({...prev,...ch}));
  };
  const applyStatus=()=>{
    if(ns===r.status) return;
    if(ns==="Cerrada"){ if(!can(role,"closeCases")){showToast("Solo la administración puede cerrar solicitudes","error");setNs(r.status);return;} setShowCl(true);return; }
    upd({status:ns},{action:"Estado cambiado",from:r.status,to:ns});
    addEmail({requestId:r.id,date:new Date().toISOString(),to:r.requesterEmail,subject:r.code+" Estado: "+ns,type:"Cambio de estado",status:"Enviado",body:"Cambio a: "+ns});
    showToast("Estado actualizado");
  };
  const applyAsgn=async()=>{
    if(!asgn||asgn==="Sin asignar"){showToast("Seleccione responsable","error");return;}
    upd({assignedTo:asgn,status:"Asignada"},{action:"Asignada a "+asgn,from:r.status,to:"Asignada"});
    showToast("Responsable asignado");
    try{
      const _usSnap=await getDocs(query(collection(fbDb,"usuarios"),where("nombre","==",asgn),where("active","==",true)));
      const res={json:()=>_usSnap.docs.map(d=>d.data())};
      const users=await res.json(); const u=users&&users[0];
      if(u?.email) addEmail({requestId:r.id,date:new Date().toISOString(),to:u.email,subject:"[CondoAdmin] Solicitud "+r.code+" asignada",type:"Asignacion",status:"Enviado",body:"Hola "+u.nombre+", se te asignó: "+r.code});
    }catch(_){}
  };
  const addCmt=()=>{
    if(!comment.trim()) return;
    upd({comments:[...safeComments,{id:"c"+uid(),user:session?.nombre&&session.nombre!==role?session.nombre+" ("+role+")":role,date:new Date().toISOString(),text:comment.trim()}]});
    setComment(""); showToast("Comentario agregado");
  };
  const usuario=session?.nombre&&session.nombre!==role?session.nombre:role;
  const closeFinal=(nota)=>{
    const c=cerrarReq(r,nota,usuario);
    setReqs(p=>p.map(x=>x.id===r.id?c:x)); setSelReq(c); setNs("Cerrada");
    if(tieneCorreo(c)) addEmail(mailCierre(c,nota));
    showToast("Solicitud cerrada"+(tieneCorreo(c)?" · se avisó al residente":"")); setShowCl(false); return true;
  };
  const reabrir=()=>{
    const c=reabrirReq(r,usuario,evalDe(r)&&evalDe(r).resuelto===false?"El residente indicó que no quedó resuelto":"");
    setReqs(p=>p.map(x=>x.id===r.id?c:x)); setSelReq(c); setNs(c.status); showToast("Solicitud reabierta");
  };
  const evaluar=ok=>{
    upd({evaluacion:{resuelto:ok,date:new Date().toISOString(),via:"app",token:r.evalToken||""}},{action:ok?"El residente confirmó que quedó resuelto":"El residente indicó que NO quedó resuelto",from:null,to:null});
    showToast(ok?"¡Gracias por confirmar!":"Gracias. Avisamos a la administración.");
  };

  const isProv=role==="Proveedor";
  const tabs=[
    ...(isProv?[]:[{id:"info",label:"Información"}]),
    ...(isProv?[]:[{id:"history",label:"Historial ("+safeHistory.length+")"}]),
    {id:"tasks",label:"Orden de Trabajo ("+myTasks.length+")"},
    {id:"informe",label:"Informe OT"},
    ...(isProv||role==="Residente"?[]:[{id:"emails",label:"Correos ("+myEmails.length+")"}]),
  ];

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <button style={BS(true)} onClick={onBack}>← Volver</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:mob?16:20}}>{r.code}</span><PBadge p={r.priority}/><SBadge s={r.status}/></div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{r.category} - Torre {r.tower}/{r.unit}</div>
        </div>
      </div>
      {(can(role,"changeStatus")||can(role,"assign"))&&r.status!=="Cerrada"&&r.status!=="Rechazada"&&(
        <div style={{...card,padding:12,marginBottom:12}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            {can(role,"changeStatus")&&(
              <div><label style={lbl}>Estado</label>
              <div style={{display:"flex",gap:6}}>
                <select style={{...sel,width:140}} value={ns} onChange={ev=>setNs(ev.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
                <button style={BP(true)} onClick={applyStatus} disabled={ns===r.status} title={ns===r.status?"Elige un estado distinto":""}>Cambiar</button>
              </div></div>
            )}
            {can(role,"assign")&&(
              <div><label style={lbl}>Prioridad{r.prioAuto?" (automática)":""}</label>
                <select style={{...sel,width:130}} value={r.priority} onChange={ev=>{const p=ev.target.value;if(p===r.priority)return;upd({priority:p,isUrgent:p==="Emergencia",prioAuto:false},{action:"Prioridad cambiada",from:null,to:null,note:r.priority+" → "+p});showToast("Prioridad: "+p);}}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
              </div>
            )}
            {can(role,"assign")&&(
              <div><label style={lbl}>Responsable</label>
              <div style={{display:"flex",gap:6}}>
                <select style={{...sel,width:150}} value={asgn} onChange={ev=>setAsgn(ev.target.value)}>{respList.map(s=><option key={s}>{s}</option>)}</select>
                <button style={BS(true)} onClick={applyAsgn}>Asignar</button>
              </div></div>
            )}
            {can(role,"assign")&&(
              <div><label style={lbl}>Proveedor</label>
              <div style={{display:"flex",gap:6}}>
                <input style={{...inp,width:150}} placeholder="Nombre proveedor..." defaultValue={r.proveedor||""} id="prov-input"/>
                <button style={BS(true)} onClick={()=>{
                  const val=document.getElementById("prov-input").value.trim();
                  upd({proveedor:val||null});
                  showToast("Proveedor actualizado");
                }}>Guardar</button>
              </div></div>
            )}
            {can(role,"createTask")&&<button style={BS(true)} onClick={()=>setShowTF(true)}>+ Orden de trabajo</button>}
            {can(role,"closeCases")&&<button style={BSu(true)} onClick={()=>setShowCl(true)}>✓ Cerrar solicitud</button>}
            <button style={BS(true)} onClick={()=>setShowEv("avance")}>📷 Subir evidencia</button>
          </div>
        </div>
      )}
      {!isProv&&<Pasos status={r.status} mob={mob}/>}
      {r.status==="Cerrada"&&!isProv&&(
        <div style={{...card,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:evalDe(r)?(evalDe(r).resuelto?"#f0fdf4":"#fff7ed"):"#fff",borderColor:evalDe(r)?(evalDe(r).resuelto?"#86efac":"#fdba74"):"#e2e8f0"}}>
          <div style={{flex:1,minWidth:180,fontSize:13}}>
            {r.closeNote&&<div style={{marginBottom:4}}><strong>Cierre:</strong> {r.closeNote}</div>}
            {evalDe(r)
              ? <div style={{fontWeight:600,color:evalDe(r).resuelto?"#16a34a":"#c2410c"}}>{evalDe(r).resuelto?"👍 El residente confirmó que quedó resuelto":"👎 El residente indicó que NO quedó resuelto"} <span style={{fontWeight:400,color:"#94a3b8",fontSize:11}}>· {fmtD(evalDe(r).date)}</span></div>
              : role==="Residente"
                ? <div style={{fontWeight:600}}>¿Quedó resuelto tu problema?</div>
                : <div style={{color:"#94a3b8",fontSize:12}}>{!r.evalToken?"Cerrada antes de que existiera la confirmación del residente.":tieneCorreo(r)?"Esperando que el residente confirme si quedó resuelto.":"Sin correo de contacto: no se pidió confirmación al residente."}</div>}
          </div>
          {role==="Residente"&&!(r.status==="Cerrada"&&evalDe(r))&&<><button style={BSu(false)} onClick={()=>evaluar(true)}>👍 Sí</button><button style={BW(false)} onClick={()=>evaluar(false)}>👎 No</button></>}
          {can(role,"closeCases")&&<button style={BS(true)} onClick={reabrir}>↺ Reabrir</button>}
        </div>
      )}
      {(()=>{const msg=sigPaso(r,role,myTasks.filter(t=>t.status!=="Completada"&&t.status!=="Cancelada"&&!(t.informe||"").trim()).length);return msg?<div style={{...alrt("info"),marginBottom:12,fontSize:13}}>💡 {msg}</div>:null;})()}
      <Tabs tabs={tabs} active={tab} onChange={setTab}/>
      {tab==="info"&&(
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
          <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Solicitante</div><IR l="Nombre" v={r.requesterName}/><IR l="Correo" v={r.requesterEmail}/><IR l="Telefono" v={r.requesterPhone}/><IR l="Torre" v={r.tower}/><IR l="Unidad" v={r.unit}/>{r.affectedTowers&&<IR l="Torres afectadas" v={r.affectedTowers}/>}</div>
          <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Caso</div><IR l="Categoria" v={(r.category||"")+" / "+(r.subcategory||"")}/><IR l="Responsable" v={r.assignedTo}/><IR l="Proveedor" v={r.proveedor||"—"}/><IR l="Creacion" v={fmt(r.createdAt)}/><IR l={"Plazo ("+slaTxt(r.priority)+")"} v={(()=>{const v=venceSLA(r);if(!v)return "—";if(r.status==="Cerrada"){const e=enPlazo(r);return e===null?"—":e?"✓ Cerrada dentro de plazo":"Cerrada fuera de plazo";}if(r.status==="Rechazada")return "—";return fueraPlazo(r)?"⚠ Vencido hace "+atrasoTxt(r):"Vence "+fmt(v);})()}/>{fechaAsig(r)&&<IR l="Tiempo hasta asignar" v={fmtHoras(horasAsignar(r))}/>}</div>
          <div style={{...card,gridColumn:"1/-1"}}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Descripcion</div><p style={{fontSize:13,color:"#374151",lineHeight:1.6,margin:0}}>{r.description||"Sin descripcion."}</p></div>
          <div style={{...card,gridColumn:"1/-1"}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Comentarios ({safeComments.length})</div>
            {safeComments.map((c,i)=>(
              <div key={c.id||i} style={{borderLeft:"3px solid #e2e8f0",paddingLeft:10,marginBottom:10}}>
                <div style={{display:"flex",gap:6,marginBottom:3,flexWrap:"wrap"}}><strong style={{fontSize:12}}>{c.user}</strong><span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{fmt(c.date)}</span></div>
                <p style={{margin:0,fontSize:13}}>{c.text}</p>
              </div>
            ))}
            {can(role,"comment")&&(
              <div style={{marginTop:10,display:"flex",gap:8}}>
                <input style={{...inp,flex:1}} placeholder="Comentario..." value={comment} onChange={ev=>setComment(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&addCmt()}/>
                <button style={BP(true)} onClick={addCmt}>Enviar</button>
              </div>
            )}
          </div>
        </div>
      )}
      {tab==="history"&&(
        <div style={card}>
          {safeHistory.length===0?<Empty msg="Sin historial"/>:(
            <div>{[...safeHistory].reverse().map((h,i)=>(
              <div key={i} style={{paddingLeft:16,paddingBottom:14,borderLeft:"2px solid #e2e8f0",marginLeft:4}}>
                <div style={{fontSize:13,fontWeight:600}}>{h.action}</div>
                {h.from&&h.to&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}><SBadge s={h.from}/> → <SBadge s={h.to}/></div>}
                {h.note&&<div style={{fontSize:12,color:"#374151",marginTop:3,fontStyle:"italic"}}>“{h.note}”</div>}
                <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{fmt(h.date)} - {h.user}</div>
              </div>
            ))}</div>
          )}
        </div>
      )}
      {tab==="tasks"&&(
        <div>
          {!isProv&&(()=>{
            const allAtts=[...(r.attachmentsInitial||[]),...atts.filter(a=>a.requestId===r.id)];
            return ["inicial","avance","cierre"].map(type=>{
              const myAtt=allAtts.filter(a=>a.type===type);
              return(
                <div key={type} style={card}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontWeight:600,fontSize:13}}>📎 {type==="inicial"?"Fotos iniciales":type==="avance"?"Fotos de avance":"Fotos de cierre"}</div>
                    {r.status!=="Cerrada"&&<button style={BS(true)} onClick={()=>setShowEv(type)}>+ Agregar</button>}
                  </div>
                  {myAtt.length===0?<div style={{color:"#94a3b8",fontSize:13}}>Sin imágenes.</div>:<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{myAtt.map((a,i)=><img key={a.id||i} src={a.preview} alt={a.name||""} style={thumb} onError={ev=>ev.target.style.display="none"}/>)}</div>}
                </div>
              );
            });
          })()}
          {can(role,"createTask")&&<TaskForm requestId={r.id} setTasks={setTasks} showToast={showToast} onClose={()=>{}} respAssign={respAssign} usuarios={usuarios} req={r} inline={true}/>}
          {myTasks.length===0&&!can(role,"createTask")&&<Empty msg="Sin órdenes de trabajo"/>}
          {myTasks.length>0&&(
            <div style={{marginTop:8}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:10,color:"#374151"}}>Órdenes ({myTasks.length})</div>
              {myTasks.map(t=><TaskCard key={t.id} task={t} role={role} setTasks={setTasks} deleteTask={deleteTask} showToast={showToast} atts={atts} setAtts={setAtts}/>)}
            </div>
          )}
        </div>
      )}
      {tab==="informe"&&(
        myTasks.length===0?<Empty msg="No hay órdenes de trabajo para reportar."/>:myTasks.map(t=>{
          const allAtts=[...(r.attachmentsInitial||[]),...atts.filter(a=>a.requestId===r.id)];
          // Mostrar solo la orden correspondiente si soy ejecutor
          const miOrden=isEjecutor&&(t.ejecutor===nombre||t.ejecutor===email);
          if(isEjecutor&&!miOrden) return null;
          return(
            <div key={t.id}>
              {/* Resumen de la orden siempre visible en modo ejecutor */}
              {isEjecutor&&(
                <div style={{...card,background:"#eef2ff",border:"2px solid #6366f1",marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:14,color:"#4338ca",marginBottom:6}}>📋 Mi Orden de Trabajo</div>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>{t.title}</div>
                      <div style={{fontSize:12,color:"#64748b",marginTop:2}}>👤 Responsable: {t.responsible}</div>
                      <div style={{fontSize:12,color:"#6366f1"}}>🔧 Ejecutor: {t.ejecutor}</div>
                      {t.desc&&<div style={{fontSize:12,color:"#374151",marginTop:4}}>{t.desc}</div>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                      <PBadge p={t.priority}/>
                      <SBadge s={t.status}/>
                      {t.dueDate&&<span style={{fontSize:11,color:"#64748b"}}>📅 {fmtD(t.dueDate)}</span>}
                    </div>
                  </div>
                  {/* Info solicitud */}
                  <div style={{marginTop:10,padding:"8px 10px",background:"#fff",borderRadius:8,border:"1px solid #c7d2fe"}}>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Solicitud relacionada</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontWeight:700,color:"#6366f1"}}>{r.code}</span>
                      <span style={{fontSize:12}}>{r.category} — {r.subcategory}</span>
                      <SBadge s={r.status}/>
                    </div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:4}}>{r.description?.slice(0,100)}{r.description?.length>100?"...":""}</div>
                  </div>
                </div>
              )}
              {["avance","cierre"].map(type=>{
                const myAtt=allAtts.filter(a=>a.type===type);
                return(
                  <div key={type} style={card}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div style={{fontWeight:600,fontSize:13}}>📎 {type==="avance"?"Fotos de avance":"Fotos de cierre"}</div>
                      {r.status!=="Cerrada"&&<button style={BS(true)} onClick={()=>setShowEv(type)}>+ Agregar</button>}
                    </div>
                    {myAtt.length===0
                      ?<div style={{color:"#94a3b8",fontSize:13}}>Sin imágenes.</div>
                      :<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{myAtt.map((a,i)=><img key={a.id||i} src={a.preview} alt={a.name||""} style={thumb} onError={ev=>ev.target.style.display="none"}/>)}</div>
                    }
                  </div>
                );
              })}
              <InformeInline task={t} setTasks={setTasks} showToast={showToast}/>
            </div>
          );
        })
      )}
      {!isProv&&tab==="emails"&&(
        <div style={card}>
          {myEmails.length===0?<Empty msg="Sin correos"/>:myEmails.map((em,i)=>(
            <div key={em.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0"}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}><span style={{fontWeight:600,fontSize:12,flex:1}}>{em.subject}</span><span style={bdg("#6366f1","#eef2ff")}>{em.type}</span></div>
              <div style={{fontSize:10,color:"#64748b"}}>{em.to} - {fmt(em.date)}</div>
              <div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4,marginTop:4}}>{em.body}</div>
            </div>
          ))}
        </div>
      )}
      {showTF&&<TaskForm requestId={r.id} setTasks={setTasks} showToast={showToast} onClose={()=>setShowTF(false)} respAssign={respAssign} usuarios={usuarios} req={r} inline={false}/>}
      {showEv&&<EvidModal type={showEv} requestId={r.id} role={role} atts={atts} setAtts={setAtts} showToast={showToast} onClose={()=>setShowEv(null)}/>}
      {showCl&&<CloseModal req={r} atts={atts} setAtts={setAtts} role={role} onClose={()=>setShowCl(false)} onConfirm={closeFinal} showToast={showToast}/>}
    </div>
  );
}

// ── TaskForm ───────────────────────────────────────────────────────────────
function TaskForm({requestId,setTasks,showToast,onClose,respAssign,usuarios,req,inline}){
  const todos=(usuarios||[]).filter(u=>u.active).map(u=>u.nombre);
  const respAuto=req?.assignedTo&&req.assignedTo!=="Sin asignar"?req.assignedTo:((respAssign&&respAssign[0])||"");
  const initF=()=>({title:"",desc:"",responsible:respAuto,ejecutor:todos[0]||"",dueDate:"",priority:"Media"});
  const [f,setF]=useState(initF());
  const submit=async()=>{
    if(!f.title){showToast("Ingrese titulo","error");return;}
    const newTask={id:"t"+uid(),requestId,comments:[],attachments:[],materials:[],status:"Ingresada",informe:"",tiempoUsado:"",...f};
    setTasks(p=>[...p,newTask]); showToast("Orden creada");
    if(inline) setF(initF()); else onClose();
    if(f.ejecutor){
      try{
        const _exSnap=await getDocs(query(collection(fbDb,"usuarios"),where("nombre","==",f.ejecutor),where("active","==",true)));
        const res={json:()=>_exSnap.docs.map(d=>d.data())};
        const users=await res.json(); const u=users&&users[0];
        if(u?.email) await sendMail(u.email,"[CondoAdmin] Nueva orden asignada","Hola "+u.nombre+", orden: "+f.title+(req?"\nSolicitud: "+req.code:""));
      }catch(_){}
    }
  };
  return(
    <div style={{...card,border:"2px solid #3b82f6",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Nueva Orden de Trabajo</div>{!inline&&<button style={BG(true)} onClick={onClose}>✕</button>}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Trabajo *</label><input style={inp} placeholder="Describe el trabajo..." value={f.title} onChange={ev=>setF(p=>({...p,title:ev.target.value}))}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Descripción</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.desc} onChange={ev=>setF(p=>({...p,desc:ev.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Responsable</label><select style={sel} value={f.responsible} onChange={ev=>setF(p=>({...p,responsible:ev.target.value}))}>{(respAssign||[]).map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Ejecutor</label><select style={sel} value={f.ejecutor} onChange={ev=>setF(p=>({...p,ejecutor:ev.target.value}))}><option value="">Sin asignar</option>{todos.map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Fecha límite</label><input type="date" style={inp} value={f.dueDate} onChange={ev=>setF(p=>({...p,dueDate:ev.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Prioridad</label><select style={sel} value={f.priority} onChange={ev=>setF(p=>({...p,priority:ev.target.value}))}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
      </div>
      <button style={BP(true)} onClick={submit}>+ Crear Orden</button>
    </div>
  );
}

// ── TaskCard ───────────────────────────────────────────────────────────────
function TaskCard({task,role,setTasks,deleteTask,showToast,atts,setAtts}){
  const [cmt,setCmt]=useState("");
  const [showEv,setShowEv]=useState(false);
  const safeComments=task.comments||[];
  const safeMaterials=task.materials||[];
  const safeAtts=task.attachments||[];
  const upd=ch=>setTasks(p=>p.map(t=>t.id===task.id?{...t,...ch}:t));
  const addC=()=>{if(!cmt.trim()) return;upd({comments:[...safeComments,{user:role,date:new Date().toISOString(),text:cmt}]});setCmt("");};
  const resolve=()=>{if(!safeAtts.some(a=>a.type==="cierre")){showToast("Cargue imagen de cierre","error");return;}upd({status:"Completada"});showToast("Orden completada");};
  return(
    <div style={{...card,marginBottom:10,borderLeft:"4px solid "+(PC[task.priority]||"#e2e8f0")}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
        <div style={{minWidth:0}}>
          <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>👤 {task.responsible}{task.ejecutor&&" · 🔧 "+task.ejecutor} · {task.dueDate?fmtD(task.dueDate):"Sin fecha"}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}><PBadge p={task.priority}/><SBadge s={task.status}/></div>
      </div>
      {task.desc&&<p style={{fontSize:12,color:"#374151",marginBottom:10}}>{task.desc}</p>}
      {safeComments.map((c,i)=>(
        <div key={i} style={{fontSize:11,marginBottom:6,paddingLeft:8,borderLeft:"2px solid #e2e8f0"}}>
          <strong>{c.user}</strong> <span style={{color:"#94a3b8"}}>{fmt(c.date)}</span><br/>{c.text}
        </div>
      ))}
      <MatPanel materials={safeMaterials} setMaterials={ms=>upd({materials:ms})} readOnly={!can(role,"changeStatus")&&!can(role,"resolveTask")}/>
      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
        <input style={{...inp,flex:1,minWidth:100,fontSize:12}} placeholder="Comentario..." value={cmt} onChange={ev=>setCmt(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&addC()}/>
        <button style={BS(true)} onClick={addC}>Enviar</button>
        <button style={BS(true)} onClick={()=>setShowEv(true)}>📷</button>
        {task.status!=="Completada"&&(can(role,"resolveTask")||can(role,"changeStatus"))&&<button style={BSu(true)} onClick={resolve}>✓ Completar</button>}
        {can(role,"manageConfig")&&deleteTask&&<button style={BD(true)} onClick={()=>{if(window.confirm("¿Eliminar esta orden?"))deleteTask(task.id);}}>🗑 Eliminar</button>}
      </div>
      {showEv&&<EvidModal type="cierre" requestId={task.requestId} role={role} atts={atts} setAtts={setAtts} showToast={showToast} onClose={()=>setShowEv(false)} taskId={task.id} setTasks={setTasks}/>}
    </div>
  );
}

// ── InformeInline ──────────────────────────────────────────────────────────
function InformeInline({task,setTasks,showToast}){
  const [f,setF]=useState({
    texto:task.informe||"",
    fechaEjecucion:task.fechaEjecucion||new Date().toISOString().slice(0,10),
    horaInicio:task.horaInicio||"",horaTermino:task.horaTermino||"",
    herramientas:task.herramientas||"",estadoFinal:task.estadoFinal||"Resuelto",
    requiereSeguimiento:task.requiereSeguimiento||false,observaciones:task.observaciones||"",
    nombreEjecutor:task.nombreEjecutor||task.ejecutor||"",vistoBueno:task.vistoBueno||false
  });
  const setFld=(k,v)=>setF(p=>({...p,[k]:v}));
  const [esc,setEsc]=useState(false);
  const recRef=useRef(null);
  const iniciarVoz=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Usa Chrome");return;}
    const rec=new SR(); rec.lang="es-CL"; rec.continuous=true; rec.interimResults=false;
    rec.onresult=ev=>{const t=Array.from(ev.results).map(x=>x[0].transcript).join(" ");setFld("texto",(f.texto?f.texto+" ":"")+t);};
    rec.onerror=()=>setEsc(false); rec.onend=()=>setEsc(false);
    recRef.current=rec; rec.start(); setEsc(true);
  };
  const detenerVoz=()=>{if(recRef.current)recRef.current.stop();setEsc(false);};
  const guardar=()=>{
    if(!f.texto.trim()){showToast("Ingrese la descripción","error");return;}
    if(!f.vistoBueno){showToast("Debe confirmar el trabajo realizado","error");return;}
    setTasks(p=>p.map(t=>t.id===task.id?{...t,...f,informe:f.texto}:t));
    showToast("Informe guardado");
  };
  return(
    <div style={{...card,marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{task.title}</div>
      <div style={{fontSize:11,color:"#64748b",marginBottom:12}}>👤 {task.responsible}{task.ejecutor&&" · 🔧 "+task.ejecutor} · <SBadge s={task.status}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        <div style={fg}><label style={lbl}>Fecha</label><input type="date" style={inp} value={f.fechaEjecucion} onChange={ev=>setFld("fechaEjecucion",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Hora inicio</label><input type="time" style={inp} value={f.horaInicio} onChange={ev=>setFld("horaInicio",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Hora término</label><input type="time" style={inp} value={f.horaTermino} onChange={ev=>setFld("horaTermino",ev.target.value)}/></div>
      </div>
      <div style={fg}><label style={lbl}>Descripción *</label><textarea style={{...inp,height:100,resize:"vertical"}} placeholder="Describe lo que se realizó..." value={f.texto} onChange={ev=>setFld("texto",ev.target.value)}/></div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {esc?<button style={{...BD(false),flex:1,justifyContent:"center"}} onClick={detenerVoz}>⏹ Detener</button>:<button style={{...BPu(false),flex:1,justifyContent:"center"}} onClick={iniciarVoz}>🎤 Dictar por voz</button>}
        {esc&&<div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#ef4444"}}>⏺ Escuchando...</div>}
      </div>
      <div style={fg}><label style={lbl}>Herramientas</label><input style={inp} placeholder="ej: Taladro, Multímetro..." value={f.herramientas} onChange={ev=>setFld("herramientas",ev.target.value)}/></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {ESTADOS_INFORME.map(est=>{
          const isSel=f.estadoFinal===est;
          const color=est==="Resuelto"?"#10b981":est==="Resuelto parcialmente"?"#f59e0b":"#ef4444";
          const bg=est==="Resuelto"?"#f0fdf4":est==="Resuelto parcialmente"?"#fffbeb":"#fef2f2";
          return <button key={est} onClick={()=>setFld("estadoFinal",est)} style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:"2px solid "+(isSel?color:"#e2e8f0"),background:isSel?bg:"#f9fafb",color:isSel?color:"#6b7280"}}>{est==="Resuelto"?"✅":est==="Resuelto parcialmente"?"⚠️":"🔄"} {est}</button>;
        })}
      </div>
      <div style={fg}><label style={lbl}>Observaciones</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.observaciones} onChange={ev=>setFld("observaciones",ev.target.value)}/></div>
      <div style={{...fg,display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" id={"seg"+task.id} checked={f.requiereSeguimiento} onChange={ev=>setFld("requiereSeguimiento",ev.target.checked)}/><label htmlFor={"seg"+task.id} style={{fontSize:13,cursor:"pointer"}}>⚠️ Requiere seguimiento posterior</label></div>
      <div style={fg}><label style={lbl}>Nombre del ejecutor</label><input style={inp} value={f.nombreEjecutor} onChange={ev=>setFld("nombreEjecutor",ev.target.value)}/></div>
      <div style={{...fg,display:"flex",gap:8,alignItems:"center",background:"#f0fdf4",padding:"10px 12px",borderRadius:8,border:"1px solid #86efac"}}><input type="checkbox" id={"vb"+task.id} checked={f.vistoBueno} onChange={ev=>setFld("vistoBueno",ev.target.checked)}/><label htmlFor={"vb"+task.id} style={{fontSize:13,cursor:"pointer",color:"#16a34a"}}>✓ Confirmo que el trabajo fue realizado</label></div>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}><button style={BSu(true)} onClick={guardar}>💾 Guardar informe</button></div>
    </div>
  );
}

// ── MatPanel ───────────────────────────────────────────────────────────────
function MatPanel({materials,setMaterials,readOnly}){
  const [showAdd,setShowAdd]=useState(false);
  const [nm,setNm]=useState({name:"",qty:1,unit:INV_UNITS[0],cost:0,status:"Por adquirir"});
  const addMat=()=>{if(!nm.name) return;setMaterials(p=>[...p,{id:"m"+uid(),...nm}]);setNm({name:"",qty:1,unit:INV_UNITS[0],cost:0,status:"Por adquirir"});setShowAdd(false);};
  const safeMat=materials||[];
  return(
    <div style={{marginTop:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontWeight:600,fontSize:12}}>Materiales ({safeMat.length})</span>
        {!readOnly&&<button style={BS(true)} onClick={()=>setShowAdd(p=>!p)}>+ Agregar</button>}
      </div>
      {showAdd&&!readOnly&&(
        <div style={{background:"#f8fafc",borderRadius:8,padding:10,marginBottom:10,border:"1px solid #e2e8f0"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
            <input style={inp} placeholder="Material *" value={nm.name} onChange={ev=>setNm(p=>({...p,name:ev.target.value}))}/>
            <input type="number" style={inp} value={nm.qty} min="1" onChange={ev=>setNm(p=>({...p,qty:Math.max(1,+ev.target.value)}))}/>
            <select style={sel} value={nm.unit} onChange={ev=>setNm(p=>({...p,unit:ev.target.value}))}>{INV_UNITS.map(u=><option key={u}>{u}</option>)}</select>
          </div>
          <div style={{display:"flex",gap:8}}><button style={BP(true)} onClick={addMat}>Agregar</button><button style={BG(true)} onClick={()=>setShowAdd(false)}>✕</button></div>
        </div>
      )}
      {safeMat.length===0&&!showAdd&&<div style={{fontSize:12,color:"#94a3b8"}}>Sin materiales.</div>}
      {safeMat.map(m=>(
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9",flexWrap:"wrap"}}>
          <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{m.name}</div><div style={{fontSize:11,color:"#64748b"}}>{m.qty} {m.unit}</div></div>
          {readOnly
            ?<span style={{...bdg(MAT_COLOR[m.status],MAT_COLOR[m.status]+"18"),fontSize:10}}>{m.status}</span>
            :<div style={{display:"flex",gap:4}}>
              {MAT_STATUS.map(s=>(
                <button key={s} onClick={()=>setMaterials(p=>p.map(x=>x.id===m.id?{...x,status:s}:x))} style={{padding:"3px 8px",borderRadius:99,fontSize:10,border:"1.5px solid "+(m.status===s?MAT_COLOR[s]:"#e2e8f0"),color:m.status===s?MAT_COLOR[s]:"#94a3b8",background:m.status===s?MAT_COLOR[s]+"18":"transparent",cursor:"pointer"}}>{s}</button>
              ))}
              <button style={BG(true)} onClick={()=>setMaterials(p=>p.filter(x=>x.id!==m.id))}>✕</button>
            </div>
          }
        </div>
      ))}
    </div>
  );
}

// ── EvidModal ──────────────────────────────────────────────────────────────
function EvidModal({type,requestId,role,atts,setAtts,showToast,onClose,taskId,setTasks}){
  const [previews,setPrev]=useState([]);
  const [rawFiles,setRawFiles]=useState([]);
  const [comment,setCmt]=useState("");
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef();
  const handleFiles=ev=>{
    const files=Array.from(ev.target.files);
    files.forEach(fi=>{const rd=new FileReader();rd.onload=e2=>setPrev(p=>[...p,{name:fi.name,url:e2.target.result}]);rd.readAsDataURL(fi);});
    setRawFiles(p=>[...p,...files]);
  };
  const save=async()=>{
    if(!previews.length){showToast("Seleccione imagen","error");return;}
    setUploading(true);
    try{
      const uploaded=await Promise.all(previews.map(async(pv,i)=>{
        const path=requestId+"/"+type+"/"+uid()+"_"+pv.name;
        let url=pv.url;
        try{if(rawFiles[i])url=await uploadImg(rawFiles[i],path);}catch(_){}
        return{id:"a"+uid(),requestId,type,name:pv.name,date:new Date().toISOString(),user:role,comment,preview:url};
      }));
      setAtts(prev=>[...prev,...uploaded]);
      if(taskId&&setTasks) setTasks(prev=>prev.map(t=>t.id===taskId?{...t,attachments:[...(t.attachments||[]),...uploaded]}:t));
      showToast(previews.length+" imagen(es) guardada(s)"); onClose();
    }catch(_){showToast("Error al subir","error");}
    setUploading(false);
  };
  return(
    <div style={MSt}>
      <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:14}}>📷 Evidencia - {type}</h3><button style={BG(true)} onClick={onClose}>✕</button></div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
        <div style={{border:"2px dashed #d1d5db",borderRadius:8,padding:20,textAlign:"center",cursor:"pointer",marginBottom:12,background:"#f8fafc"}} onClick={()=>fileRef.current.click()}><div style={{fontSize:32,marginBottom:6}}>📷</div><div style={{fontSize:12,color:"#64748b"}}>Toca para seleccionar imágenes</div></div>
        {previews.length>0&&(
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
            {previews.map((pv,i)=>(
              <div key={i} style={{position:"relative"}}>
                <img src={pv.url} alt={pv.name} style={{...thumb,width:80,height:64}}/>
                <button onClick={()=>{setPrev(pr=>pr.filter((_,j)=>j!==i));setRawFiles(fs=>fs.filter((_,j)=>j!==i));}} style={{position:"absolute",top:-4,right:-4,background:"#ef4444",color:"#fff",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",fontSize:9}}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={fg}><label style={lbl}>Comentario</label><input style={inp} value={comment} onChange={ev=>setCmt(ev.target.value)} placeholder="Descripción..."/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BP(true)} onClick={save} disabled={uploading}>{uploading?"Subiendo...":"Guardar"}</button></div>
      </div>
    </div>
  );
}

// ── CloseModal ─────────────────────────────────────────────────────────────
function CloseModal({req,atts,setAtts,role,onClose,onConfirm,showToast}){
  const closure=atts.filter(a=>a.requestId===req.id&&a.type==="cierre");
  const [showEv,setShowEv]=useState(false);
  const [nota,setNota]=useState("");
  const [err,setErr]=useState(false);
  const confirmar=()=>{ if(!nota.trim()){setErr(true);return;} onConfirm(nota.trim()); };
  return(
    <div style={MSt}>
      <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:460,padding:"20px",marginTop:16}}>
        <h3 style={{margin:"0 0 4px",fontSize:15}}>Cerrar solicitud {req.code}</h3>
        <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>{tieneCorreo(req)?"Se avisará a "+req.requesterEmail+" y se le preguntará si quedó resuelto.":"Esta solicitud no tiene correo de contacto; no se enviará aviso."}</div>
        <label style={lbl}>¿Qué se hizo? *</label>
        <textarea autoFocus style={{...inp,height:80,resize:"vertical",fontFamily:"inherit",...(err?{borderColor:"#ef4444",background:"#fef2f2"}:{})}} value={nota} onChange={ev=>{setNota(ev.target.value);setErr(false);}} placeholder="Ej: Se cambió el flexible del lavamanos y se probó sin filtraciones."/>
        {err&&<div style={{color:"#ef4444",fontSize:11,marginTop:2}}>Escribe una nota de cierre. El residente la verá en el correo.</div>}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
          <button style={BS(true)} onClick={()=>setShowEv(true)}>📷 Agregar foto de cierre</button>
          <span style={{fontSize:11,color:"#94a3b8"}}>{closure.length>0?closure.length+" foto(s) agregada(s)":"Opcional"}</span>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button style={BS(true)} onClick={onClose}>Cancelar</button>
          <button style={BSu(true)} onClick={confirmar}>✓ Cerrar solicitud</button>
        </div>
      </div>
      {showEv&&<EvidModal type="cierre" requestId={req.id} role={role} atts={atts} setAtts={setAtts} showToast={showToast} onClose={()=>setShowEv(false)}/>}
    </div>
  );
}

// ── NewReqModal ────────────────────────────────────────────────────────────
// Datos de contacto del residente recordados en este dispositivo (para no volver a escribirlos)
const RES_LS="ca_residente";
const getResLS=()=>{ try{ return JSON.parse(localStorage.getItem(RES_LS)||"{}")||{}; }catch(_){ return {}; } };
const setResLS=d=>{ try{ localStorage.setItem(RES_LS,JSON.stringify(d)); }catch(_){} };
const PRIO_HELP={
  Baja:"Puede esperar. No afecta el uso normal.",
  Media:"Molesta, pero se puede seguir usando.",
  Alta:"Impide el uso normal o puede empeorar pronto.",
  Emergencia:"Riesgo para personas o daño grave (fuga de gas o agua, corte eléctrico general, ascensor detenido con personas).",
};
const MAX_FOTOS=6;
// Departamentos / unidades del condominio
const UNIDADES=["A1","B2","C3","D4","E5","E6","F5","F6","G7","H8"];

// Prioridad automática: la define el sistema según lo que se reporta
const _norm=t=>String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const PRIO_REGLAS=[
  // Emergencia: riesgo para personas o daño grave
  {p:"Emergencia",cat:{Gas:["Olor a gas","Fuga"],Ascensores:["Parada emergencia"],Seguridad:["Incidente","Acceso no autorizado"]},
   txt:["olor a gas","fuga de gas","incendio","fuego","humo","explosion","inundacion","inundado","atrapad","encerrad","electrocut","chispa","cortocircuito","herido","accidente","robo","asalto","intruso","derrumbe"]},
  // Alta: impide el uso normal o puede empeorar pronto
  {p:"Alta",cat:{Electricidad:["Corte de luz","Tablero electrico","Falla de circuito"],Gas:["Corte suministro"],Agua:["Corte de agua","Fuga"],Filtraciones:["Techo"],Ascensores:["Puerta defectuosa","Ruido anormal","Otro"],Citofonia:["Puerta danada","Control acceso"],Perimetral:["Porton peatonal","Porton vehicular","Cerco electrico"],Motor:["Motor porton vehicular","Motor porton peatonal","Automatismo danado","Barrera vehicular"],Seguridad:["Alarma","Camara danada"]},
   txt:["sin luz","sin agua","sin gas","no funciona","no abre","no cierra","gotea","goteando","filtracion","se moja","no puedo salir","no puedo entrar","ascensor detenido","porton no"]},
  // Baja: puede esperar
  {p:"Baja",cat:{Jardines:["Poda","Dano en plantas","Riego","Sistema riego","Otro"],Aseo:["Pasillo sucio","Area comun","Otro"],Otros:["Mascotas","Ruidos molestos"],"Espacios comunes":["Sala eventos","Quincho","Gimnasio"]},txt:[]},
];
const PRIO_ORD={Emergencia:0,Alta:1,Media:2,Baja:3};
// Devuelve {p, motivo}. Las palabras de la descripción pueden subir la prioridad, nunca bajarla.
const prioAuto=(cat,sub,desc)=>{
  const d=_norm(desc);
  let p="Media", motivo="Prioridad estándar";
  for(const r of PRIO_REGLAS){ const l=r.cat[cat]; if(l&&l.includes(sub)){ p=r.p; motivo="Por el tipo de problema ("+cat+" / "+sub+")"; break; } }
  for(const r of PRIO_REGLAS){
    if(PRIO_ORD[r.p]>=PRIO_ORD[p]) continue;
    const w=r.txt.find(k=>d.includes(k));
    if(w){ p=r.p; motivo="La descripción menciona «"+w+"»"; break; }
  }
  return {p,motivo};
};

function NewReqModal({role,reqs,setReqs,addEmail,showToast,onClose,onOpen,cats,towers,session,usuarios}){
  const mob=useMob();
  const actCats=cats.filter(c=>c.active);
  const actTowers=towers.filter(t=>t.active);
  const initCat=actCats[0]||{name:"",subs:[""]};
  const initTower=actTowers[0]||{name:""};
  const isAdmin=role==="Administrador"||role==="Administrador Edificio";
  const esResidente=role==="Residente";
  const [tipo,setTipo]=useState(isAdmin?"Administrativo":"Incidencia");
  const adminCatList=Object.keys(ADMIN_CATS);
  const [adminCat,setAdminCat]=useState(adminCatList[0]);
  const [adminSub,setAdminSub]=useState(ADMIN_CATS[adminCatList[0]][0]);
  const [f,setF]=useState(()=>{
    const rec=esResidente?getResLS():{};
    const torreOk=rec.tower&&actTowers.some(t=>t.name===rec.tower);
    if(rec.unit&&!UNIDADES.includes(rec.unit)) rec.unit="";
    return {requesterName:session?.nombre&&session.id!=="guest"?session.nombre:(rec.requesterName||""),requesterEmail:session?.email||rec.requesterEmail||"",requesterPhone:rec.requesterPhone||"",tower:torreOk?rec.tower:initTower.name,unit:rec.unit||"",category:initCat.name,subcategory:initCat.subs[0]||"",description:"",priority:"Media",accessPermission:false,confirm:true,affectedTowers:[]};
  });

  const isAreaComun=f.tower==="Comun";
  const [errs,setErrs]=useState({});
  const [prevs,setPrevs]=useState([]); // {id,name,url,file}
  const [done,setDone]=useState(null);
  const [saving,setSaving]=useState(false);
  const fileRef=useRef();
  const boxRef=useRef();
  // Al editar un campo se borra su error, para que el rojo desaparezca apenas se corrige
  const setFld=(k,v)=>{setF(p=>({...p,[k]:v}));setErrs(p=>{if(!p[k])return p;const n={...p};delete n[k];return n;});};
  const inpM=mob?{...inp,fontSize:16,padding:"10px"}:inp;   // 16px evita el zoom automático en iPhone
  const selM=mob?{...sel,fontSize:16,padding:"10px"}:sel;
  const errTxt=k=>errs[k]?<div style={{color:"#ef4444",fontSize:11,marginTop:2}}>{errs[k]}</div>:null;
  const bErr=k=>errs[k]?{borderColor:"#ef4444",background:"#fef2f2"}:{};
  const secT=t=><div style={{gridColumn:"1/-1",fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.4,margin:"6px 0 8px",paddingBottom:4,borderBottom:"1px solid #f1f5f9"}}>{t}</div>;

  const validate=()=>{
    const err={};
    if(tipo==="Incidencia"){
      if(!f.unit.trim()||(!isAreaComun&&!UNIDADES.includes(f.unit))) err.unit=isAreaComun?"Indica el lugar (ej: piscina, hall)":"Selecciona tu departamento";
      if(!f.requesterName.trim()) err.requesterName="Escribe tu nombre";
      if(!/^\S+@\S+\.\S+$/.test(f.requesterEmail.trim())) err.requesterEmail="Escribe un correo válido (ej: nombre@gmail.com)";
    }
    if(f.description.trim().length<10) err.description="Cuéntanos un poco más (mínimo 10 caracteres)";
    setErrs(err);
    const ok=!Object.keys(err).length;
    // Lleva la pantalla al primer campo con error
    if(!ok) setTimeout(()=>{const el=boxRef.current&&boxRef.current.querySelector("[data-err='1']");if(el){el.scrollIntoView({behavior:"smooth",block:"center"});const i=el.querySelector("input,textarea");if(i)i.focus({preventScroll:true});}},50);
    return ok;
  };

  const handleFiles=ev=>{
    const files=Array.from(ev.target.files||[]);
    ev.target.value=""; // permite volver a elegir la misma foto
    let libres=MAX_FOTOS-prevs.length;
    files.forEach(fi=>{
      if(!fi.type.startsWith("image/")){showToast(fi.name+" no es una imagen","error");return;}
      if(libres<=0){showToast("Máximo "+MAX_FOTOS+" fotos","error");return;}
      libres--;
      const id=uid();
      const rd=new FileReader();
      rd.onload=e2=>setPrevs(p=>p.length>=MAX_FOTOS?p:[...p,{id,name:fi.name,url:e2.target.result,file:fi}]);
      rd.readAsDataURL(fi);
    });
  };

  const submit=async()=>{
    if(saving||!validate()) return;
    setSaving(true);
    try{
      const code=genCode(reqs,"SOL-"); const now=new Date().toISOString();
      const datos={...f,priority:prioFinal,requesterName:f.requesterName.trim(),requesterEmail:f.requesterEmail.trim().toLowerCase(),requesterPhone:f.requesterPhone.trim(),unit:f.unit.trim(),description:f.description.trim()};
      const attachmentsInitial=await Promise.all(prevs.map(async pv=>{
        const path=code+"/inicial/"+uid()+"_"+pv.name; let url=pv.url;
        try{if(pv.file)url=await uploadImg(pv.file,path);}catch(_){}
        return{id:"a"+uid(),requestId:code,type:"inicial",name:pv.name,date:now,user:datos.requesterName,preview:url,comment:""};
      }));
      const categoria=tipo==="Administrativo"?adminCat:f.category;
      const nr=normReq({id:code,code,createdAt:now,...datos,
        category:categoria,
        subcategory:tipo==="Administrativo"?adminSub:f.subcategory,
        affectedTowers:isAreaComun?(f.affectedTowers.length===0?"Todas":f.affectedTowers.join(", ")):null,
        status:"Ingresada",assignedTo:"Sin asignar",
        history:[{date:now,user:datos.requesterName||role,action:"Solicitud creada",from:null,to:"Ingresada",note:tipo==="Incidencia"?"Prioridad automática: "+prioFinal+" ("+auto.motivo+")":""}],
        prioAuto:tipo==="Incidencia",attachmentsInitial,dueDate:null,isUrgent:prioFinal==="Emergencia"});
      setReqs(p=>[nr,...p]);
      if(esResidente) setResLS({requesterName:datos.requesterName,requesterEmail:datos.requesterEmail,requesterPhone:datos.requesterPhone,tower:f.tower,unit:isAreaComun?(getResLS().unit||""):datos.unit});
      // Mail al solicitante
      if(datos.requesterEmail.includes("@")){
        addEmail({requestId:code,date:now,to:datos.requesterEmail,subject:"[CondoAdmin] Solicitud "+code+" recibida",type:"Creacion",status:"Enviado",body:"Su solicitud fue registrada. Código: "+code+".\n\nLe contactaremos a la brevedad."});
      }
      // Mail a administradores
      try{
        const admins=(usuarios||[]).filter(u=>["Administrador","Administrador Edificio"].includes(u.rol)&&u.email&&u.email.includes("@"));
        admins.forEach(u=>addEmail({requestId:code,date:now,to:u.email,subject:"[CondoAdmin] Nueva solicitud "+code,type:"Aviso",status:"Enviado",body:"Nueva solicitud recibida:\n\nCódigo: "+code+"\nSolicitante: "+datos.requesterName+"\nCategoría: "+categoria+"\nPrioridad: "+prioFinal+"\n\nIngrese al sistema para gestionar."}));
      }catch(ex){console.warn("Error notificando admins",ex);}
      setDone(nr); showToast("Solicitud "+code+" creada");
    }catch(ex){
      console.error("Error creando solicitud",ex);
      showToast("No se pudo enviar la solicitud. Intenta de nuevo.","error");
    }finally{
      setSaving(false);
    }
  };

  const hayCambios=f.description.trim().length>0||prevs.length>0;
  const cerrar=()=>{ if(saving) return; if(hayCambios&&!window.confirm("¿Salir sin enviar? Se perderá lo que escribiste.")) return; onClose(); };
  const otra=()=>{ setDone(null); setPrevs([]); setErrs({}); setF(p=>({...p,description:"",priority:"Media",accessPermission:false,affectedTowers:[]})); };

  const curCat=actCats.find(c=>c.name===f.category);
  // Incidencias: la prioridad la calcula el sistema. Solicitudes administrativas: la elige el administrador.
  const auto=prioAuto(f.category,f.subcategory,f.description);
  const prioFinal=tipo==="Incidencia"?auto.p:f.priority;
  const descLen=f.description.trim().length;

  if(done) return(
    <div style={MSt}>
      <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,padding:"24px",marginTop:16,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>✅</div>
        <h3 style={{margin:"0 0 6px"}}>Solicitud recibida</h3>
        <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Tu código de seguimiento es</div>
        <div style={{...bdg("#10b981","#f0fdf4"),fontSize:18,padding:"6px 16px",display:"inline-flex",marginBottom:12}}>{done.code}</div>
        <div style={{fontSize:13,color:"#475569",lineHeight:1.5,marginBottom:18,textAlign:"left",background:"#f8fafc",borderRadius:8,padding:"10px 12px"}}>
          <div>• La administración la revisará y asignará un responsable.</div>
          {done.requesterEmail&&<div>• Enviamos la confirmación a <strong>{done.requesterEmail}</strong>.</div>}
          <div>• Puedes ver su avance en {esResidente?"«Mis solicitudes»":"el listado de solicitudes"} con este código.</div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          <button style={BP(true)} onClick={()=>{onClose();onOpen(done);}}>Ver solicitud</button>
          <button style={BS(true)} onClick={otra}>+ Ingresar otra</button>
          <button style={BS(true)} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );

  const cols=mob?"1fr":"1fr 1fr";
  return(
    <div style={MSt}>
      <div ref={boxRef} style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:680,padding:mob?"16px 14px":"20px",marginTop:mob?4:16,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <h3 style={{margin:0,fontSize:16}}>{isAdmin?"Nueva solicitud":"Reportar incidencia"}</h3>
            {!isAdmin&&<div style={{fontSize:12,color:"#64748b",marginTop:2}}>Toma menos de un minuto. Los campos con * son obligatorios.</div>}
          </div>
          <button style={BG(true)} onClick={cerrar} aria-label="Cerrar">✕</button>
        </div>
        {isAdmin&&(
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            {["Administrativo","Incidencia"].map(tp=>{
              const isActive=tipo===tp;
              const color=tp==="Administrativo"?"#6366f1":"#ef4444";
              return <button key={tp} onClick={()=>{setTipo(tp);setErrs({});}} style={{flex:1,padding:"12px",borderRadius:10,border:"2px solid "+(isActive?color:"#e2e8f0"),background:isActive?(tp==="Administrativo"?"#eef2ff":"#fef2f2"):"#f9fafb",color:isActive?color:"#6b7280",fontWeight:isActive?700:400,cursor:"pointer",fontSize:14}}>{tp==="Administrativo"?"📋 Administrativo":"🚨 Incidencia"}</button>;
            })}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:cols,columnGap:10}}>
          {tipo==="Incidencia"&&(
            <>
              {secT("📍 ¿Dónde ocurre?")}
              <div style={fg}><label style={lbl}>Torre / sector</label><select style={selM} value={f.tower} onChange={ev=>{const v=ev.target.value;setF(p=>({...p,tower:v,affectedTowers:[],unit:(v==="Comun")===(p.tower==="Comun")?p.unit:""}));}}>{actTowers.map(t=><option key={t.id} value={t.name}>{t.label}</option>)}</select></div>
              <div style={fg} data-err={errs.unit?"1":"0"}><label style={lbl}>{isAreaComun?"Lugar *":"Departamento / unidad *"}</label>{isAreaComun
                ?<input style={{...inpM,...bErr("unit")}} value={f.unit} onChange={ev=>setFld("unit",ev.target.value)} placeholder="ej: piscina, hall de acceso, estacionamiento -1"/>
                :<select style={{...selM,...bErr("unit"),color:f.unit?"#1e293b":"#94a3b8"}} value={UNIDADES.includes(f.unit)?f.unit:""} onChange={ev=>setFld("unit",ev.target.value)}><option value="">Selecciona…</option>{UNIDADES.map(u=><option key={u} value={u} style={{color:"#1e293b"}}>{u}</option>)}</select>}{errTxt("unit")}</div>

              {/* Si es Area Común: selector de torres afectadas */}
              {isAreaComun&&(
                <div style={{...fg,gridColumn:"1/-1"}}>
                  <label style={lbl}>Torres afectadas</label>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",padding:"6px 12px",borderRadius:8,border:"2px solid "+(f.affectedTowers.length===0?"#3b82f6":"#e2e8f0"),background:f.affectedTowers.length===0?"#eff6ff":"#f9fafb",color:f.affectedTowers.length===0?"#1d4ed8":"#374151",fontWeight:f.affectedTowers.length===0?700:400}}>
                      <input type="radio" name="affTowers" style={{display:"none"}} checked={f.affectedTowers.length===0} onChange={()=>setFld("affectedTowers",[])}/>
                      Todas las torres
                    </label>
                    {actTowers.filter(t=>t.name!=="Comun").map(t=>{
                      const sel2=f.affectedTowers.includes(t.name);
                      return(
                        <label key={t.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",padding:"6px 12px",borderRadius:8,border:"2px solid "+(sel2?"#6366f1":"#e2e8f0"),background:sel2?"#eef2ff":"#f9fafb",color:sel2?"#4338ca":"#374151",fontWeight:sel2?700:400}}>
                          <input type="checkbox" style={{display:"none"}} checked={sel2} onChange={()=>{
                            const cur=f.affectedTowers;
                            setFld("affectedTowers",sel2?cur.filter(x=>x!==t.name):[...cur,t.name]);
                          }}/>
                          {t.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {secT("📝 ¿Qué ocurre?")}
              <div style={fg}><label style={lbl}>Tipo de problema</label><select style={selM} value={f.category} onChange={ev=>{const v=ev.target.value;const c=actCats.find(x=>x.name===v);setF(p=>({...p,category:v,subcategory:c?.subs[0]||""}));}}>{actCats.map(c=><option key={c.id}>{c.name}</option>)}</select></div>
              <div style={fg}><label style={lbl}>Detalle</label><select style={selM} value={f.subcategory} onChange={ev=>setFld("subcategory",ev.target.value)}>{(curCat?.subs||[]).map(s=><option key={s}>{s}</option>)}</select></div>
            </>
          )}
          {isAdmin&&tipo==="Administrativo"&&(
            <>
              <div style={fg}><label style={lbl}>Categoría</label><select style={selM} value={adminCat} onChange={ev=>{setAdminCat(ev.target.value);setAdminSub(ADMIN_CATS[ev.target.value][0]);}}>{adminCatList.map(c=><option key={c}>{c}</option>)}</select></div>
              <div style={fg}><label style={lbl}>Subcategoría</label><select style={selM} value={adminSub} onChange={ev=>setAdminSub(ev.target.value)}>{(ADMIN_CATS[adminCat]||[]).map(s=><option key={s}>{s}</option>)}</select></div>
            </>
          )}
          <div style={{...fg,gridColumn:"1/-1"}} data-err={errs.description?"1":"0"}>
            <label style={lbl}>Descripción *</label>
            <textarea style={{...inpM,height:tipo==="Administrativo"?120:96,resize:"vertical",fontFamily:"inherit",...bErr("description")}} value={f.description} onChange={ev=>setFld("description",ev.target.value)} placeholder={tipo==="Administrativo"?"Detalle administrativo...":"Ej: Hay una filtración en el techo del baño desde ayer, gotea cuando el vecino de arriba usa la ducha."}/>
            {errTxt("description")||(tipo==="Incidencia"&&<div style={{fontSize:11,color:descLen>=10?"#10b981":"#94a3b8",marginTop:2}}>{descLen>=10?"✓ Suficiente detalle":"Qué pasa, desde cuándo y dónde exactamente."}</div>)}
          </div>

          {tipo==="Incidencia"?(
            <div style={{...fg,gridColumn:"1/-1"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"10px 12px",borderRadius:8,background:PB[auto.p]||"#f8fafc",border:"1px solid #e2e8f0"}}>
                <span style={{fontSize:12,color:"#475569"}}>Prioridad asignada automáticamente:</span>
                <PBadge p={auto.p}/>
                <span style={{fontSize:11,color:"#64748b",flexBasis:"100%"}}>{auto.motivo}. {PRIO_HELP[auto.p]}</span>
              </div>
            </div>
          ):(
            <div style={{...fg,gridColumn:"1/-1"}}>
              <label style={lbl}>Prioridad</label>
              <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(4,1fr)",gap:6}}>
                {[...PRIORITIES].reverse().map(p=>{
                  const on=f.priority===p;
                  return <button key={p} type="button" onClick={()=>setFld("priority",p)} style={{padding:mob?"10px 6px":"8px 6px",borderRadius:8,cursor:"pointer",fontSize:13,border:"2px solid "+(on?PC[p]:"#e2e8f0"),background:on?(PB[p]||"#f9fafb"):"#fff",color:on?PC[p]:"#64748b",fontWeight:on?700:500}}>{p==="Emergencia"?"⚠ ":""}{p}</button>;
                })}
              </div>
            </div>
          )}

          {tipo==="Incidencia"&&(
            <>
              <div style={{...fg,gridColumn:"1/-1"}}>
                <label style={lbl}>Fotos <span style={{fontWeight:400,color:"#94a3b8"}}>(opcional, ayudan a resolver más rápido)</span></label>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  {prevs.map(pv=>(
                    <div key={pv.id} style={{position:"relative"}}>
                      <img src={pv.url} alt={pv.name} style={{...thumb,width:76,height:60}}/>
                      <button type="button" aria-label="Quitar foto" onClick={()=>setPrevs(pr=>pr.filter(x=>x.id!==pv.id))} style={{position:"absolute",top:-6,right:-6,background:"#ef4444",color:"#fff",border:"2px solid #fff",borderRadius:"50%",width:22,height:22,cursor:"pointer",fontSize:11,lineHeight:1,padding:0}}>✕</button>
                    </div>
                  ))}
                  {prevs.length<MAX_FOTOS&&(
                    <button type="button" onClick={()=>fileRef.current.click()} style={{border:"2px dashed #d1d5db",borderRadius:8,padding:prevs.length?"0 14px":"14px",height:prevs.length?60:"auto",flex:prevs.length?"0 0 auto":"1 1 100%",textAlign:"center",cursor:"pointer",background:"#f8fafc",color:"#64748b",fontSize:12}}>
                      {prevs.length?"+ Agregar":<><div style={{fontSize:24,marginBottom:4}}>📷</div>Toca para tomar o elegir fotos</>}
                    </button>
                  )}
                </div>
                {prevs.length>0&&<div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{prevs.length} de {MAX_FOTOS} fotos</div>}
              </div>

              {secT("👤 Tus datos de contacto")}
              <div style={fg} data-err={errs.requesterName?"1":"0"}><label style={lbl}>Nombre *</label><input type="text" autoComplete="name" style={{...inpM,...bErr("requesterName")}} value={f.requesterName} onChange={ev=>setFld("requesterName",ev.target.value)}/>{errTxt("requesterName")}</div>
              <div style={fg} data-err={errs.requesterEmail?"1":"0"}><label style={lbl}>Correo *</label><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" style={{...inpM,...bErr("requesterEmail")}} value={f.requesterEmail} onChange={ev=>setFld("requesterEmail",ev.target.value)} placeholder="nombre@correo.com"/>{errTxt("requesterEmail")||<div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Aquí te avisaremos del avance.</div>}</div>
              <div style={fg}><label style={lbl}>Teléfono <span style={{fontWeight:400,color:"#94a3b8"}}>(opcional)</span></label><input type="tel" inputMode="tel" autoComplete="tel" style={inpM} value={f.requesterPhone} onChange={ev=>setFld("requesterPhone",ev.target.value)} placeholder="+56 9 ..."/></div>
              {!isAreaComun&&(
                <label htmlFor="acc" style={{...fg,gridColumn:"1/-1",display:"flex",gap:10,alignItems:"center",cursor:"pointer",padding:"10px 12px",borderRadius:8,border:"1px solid "+(f.accessPermission?"#86efac":"#e2e8f0"),background:f.accessPermission?"#f0fdf4":"#f8fafc"}}>
                  <input type="checkbox" id="acc" style={{width:18,height:18,flexShrink:0}} checked={f.accessPermission} onChange={ev=>setFld("accessPermission",ev.target.checked)}/>
                  <span style={{fontSize:13}}>Autorizo el ingreso a mi departamento para revisar el problema<div style={{fontSize:11,color:"#94a3b8"}}>Si no lo marcas, coordinaremos contigo antes de entrar.</div></span>
                </label>
              )}
            </>
          )}
        </div>
        {Object.keys(errs).length>0&&<div style={{...alrt("error"),marginTop:6}}>Falta completar {Object.keys(errs).length===1?"un campo":Object.keys(errs).length+" campos"}. Revisa lo marcado en rojo.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10,flexDirection:mob?"column-reverse":"row"}}>
          <button style={{...BS(!mob),...(mob?{width:"100%",justifyContent:"center"}:{})}} onClick={cerrar} disabled={saving}>Cancelar</button>
          <button style={{...(tipo==="Administrativo"?BPu(!mob):BP(!mob)),...(mob?{width:"100%",justifyContent:"center",padding:"12px"}:{}),opacity:saving?.7:1}} onClick={submit} disabled={saving}>{saving?(prevs.length?"Subiendo fotos...":"Enviando..."):"Enviar solicitud"}</button>
        </div>
      </div>
    </div>
  );
}

// ── TasksView ──────────────────────────────────────────────────────────────
function TasksView({tasks,reqs,role,setTasks,deleteTask,showToast,mob,respAssign,onOpen}){
  const [fi,setFi]=useState({responsible:"",q:""});
  const [tab,setTab]=useState("pendientes");
  const validReqIds=new Set(reqs.map(r=>r.id));
  const base=tasks.filter(t=>validReqIds.has(t.requestId));
  const lista=t=>t.status==="Completada"||t.status==="Cancelada"||!!(t.informe||"").trim();
  const TABS=[
    {id:"pendientes",label:"Pendientes",f:t=>!lista(t)},
    {id:"vencidas",label:"Vencidas",f:t=>tareaPend(t)&&diffDue(t)<0},
    {id:"listas",label:"Completadas",f:lista},
    {id:"todas",label:"Todas",f:()=>true},
  ];
  const tabDef=TABS.find(t=>t.id===tab)||TABS[0];
  const q=fi.q.trim().toLowerCase();
  const fin=t=>t.dueDate?parseF(t.dueDate).getTime():Infinity;
  const visible=base.filter(t=>
    tabDef.f(t)&&
    (!fi.responsible||t.responsible===fi.responsible||t.ejecutor===fi.responsible)&&
    (!q||[t.title,t.responsible,t.ejecutor,(reqs.find(r=>r.id===t.requestId)||{}).code].filter(Boolean).join(" ").toLowerCase().includes(q))
  ).sort((a,b)=>fin(a)-fin(b));
  return(
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {TABS.map(t=>{
          const n=base.filter(t.f).length, on=tab===t.id, rojo=t.id==="vencidas"&&n>0;
          const col=rojo?"#dc2626":"#3b82f6";
          return <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:mob?"8px 12px":"6px 12px",borderRadius:99,fontSize:12,cursor:"pointer",border:"1px solid "+(on?col:"#e2e8f0"),background:on?col:"#fff",color:on?"#fff":(rojo?col:"#475569"),fontWeight:on||rojo?600:400}}>{t.label} <span style={{opacity:.85}}>({n})</span></button>;
        })}
      </div>
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input style={{...inp,flex:"2 1 180px",minWidth:140}} placeholder="🔍 Buscar por título, persona o código..." value={fi.q} onChange={ev=>setFi(p=>({...p,q:ev.target.value}))}/>
          <select style={{...sel,flex:"1 1 140px",color:fi.responsible?"#1e293b":"#94a3b8"}} value={fi.responsible} onChange={ev=>setFi(p=>({...p,responsible:ev.target.value}))}><option value="">Persona: todas</option>{(respAssign||[]).map(r=><option key={r}>{r}</option>)}</select>
        </div>
      </div>
      {visible.length===0?<Empty msg={q||fi.responsible?"Ninguna orden coincide con la búsqueda.":tab==="pendientes"?"No hay órdenes pendientes 🎉":tab==="vencidas"?"No hay órdenes vencidas ✓":"Sin órdenes"}/>:visible.map(t=>{
        const req=reqs.find(r=>r.id===t.requestId);
        const pend=tareaPend(t), dd=pend?diffDue(t):null;
        return(
          <div key={t.id} onClick={()=>req&&onOpen&&onOpen(req)} title={req&&onOpen?"Abrir solicitud "+req.code:""} style={{...card,borderLeft:"4px solid "+(dd!==null&&dd<0?"#ef4444":PC[t.priority]||"#e2e8f0"),marginBottom:8,padding:12,cursor:req&&onOpen?"pointer":"default"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:mob?"normal":"nowrap"}}>{t.title}</div>
                {req&&<div style={{fontSize:11,color:"#3b82f6"}}>{req.code} · <span style={{color:"#94a3b8"}}>{req.category}</span></div>}
                <div style={{fontSize:11,color:"#64748b"}}>👤 {t.responsible||"Sin responsable"}{t.ejecutor&&" · 🔧 "+t.ejecutor}</div>
                <div style={{fontSize:11,marginTop:2,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{color:"#94a3b8"}}>{t.dueDate?"📅 "+fmtD(t.dueDate):"Sin fecha límite"}</span>
                  {dd!==null&&dd<0&&<span style={bdg("#ef4444","#fef2f2")}>Vencida hace {Math.abs(dd)} día{Math.abs(dd)===1?"":"s"}</span>}
                  {dd!==null&&dd>=0&&dd<=3&&<span style={bdg("#92400e","#fffbeb")}>{dd===0?"Vence hoy":"Vence en "+dd+" día"+(dd===1?"":"s")}</span>}
                  {!lista(t)&&<span style={{color:"#94a3b8"}}>· falta informe</span>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}><PBadge p={t.priority}/><SBadge s={t.status}/></div>
                {can(role,"manageConfig")&&deleteTask&&(
                  <button style={BD(true)} onClick={ev=>{ev.stopPropagation();if(window.confirm("¿Eliminar orden \""+t.title+"\"? Esta acción no se puede deshacer."))deleteTask(t.id);}}>🗑 Eliminar</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ResidenteReqs — vista del residente: sus solicitudes + órdenes vencidas sin informe ──
// Verificación del correo del residente: pide un código de 6 dígitos enviado por correo
function AccesoResidente({onOk}){
  const [email,setEmail]=useState(()=>getResLS().requesterEmail||"");
  const [paso,setPaso]=useState(1);
  const [codigo,setCodigo]=useState("");
  const [msg,setMsg]=useState(null);   // {t:"error"|"info",m}
  const [busy,setBusy]=useState(false);
  const llamar=async body=>{
    const res=await fetch(SITE_URL+"/api/residente-codigo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    let j={}; try{ j=await res.json(); }catch(_){}
    return {ok:res.ok&&j.ok,error:j.error};
  };
  const enviar=async()=>{
    const e=email.trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(e)){setMsg({t:"error",m:"Escribe un correo válido."});return;}
    setBusy(true); setMsg(null);
    try{
      const r=await llamar({accion:"enviar",email:e});
      if(r.ok){setPaso(2);setCodigo("");setMsg({t:"info",m:"Te enviamos un código de 6 dígitos a "+e+". Revisa también la carpeta de spam."});}
      else setMsg({t:"error",m:r.error||"No se pudo enviar el código. Intenta de nuevo en unos minutos."});
    }catch(_){setMsg({t:"error",m:"No se pudo enviar el código. Revisa tu conexión."});}
    setBusy(false);
  };
  const verificar=async()=>{
    const c=codigo.replace(/\D/g,"");
    if(c.length!==6){setMsg({t:"error",m:"El código tiene 6 dígitos."});return;}
    setBusy(true); setMsg(null);
    try{
      const e=email.trim().toLowerCase();
      const r=await llamar({accion:"verificar",email:e,codigo:c});
      if(r.ok){const a={email:e,hasta:Date.now()+30*86400000};setAcceso(a);onOk(a);}
      else setMsg({t:"error",m:r.error||"Código incorrecto."});
    }catch(_){setMsg({t:"error",m:"No se pudo verificar. Revisa tu conexión."});}
    setBusy(false);
  };
  return(
    <div style={{...card,maxWidth:420,margin:"0 auto 12px",padding:18}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>🔒 Ver mis solicitudes</div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Para proteger tus datos, confirma que el correo es tuyo. Solo se pide una vez en este dispositivo.</div>
      {msg&&<div style={alrt(msg.t)}>{msg.m}</div>}
      {paso===1?(
        <>
          <label style={lbl}>Correo con el que ingresaste tus solicitudes</label>
          <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" style={{...inp,fontSize:16,padding:10,marginBottom:10}} value={email} onChange={ev=>setEmail(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&enviar()} placeholder="nombre@correo.com"/>
          <button style={{...BP(false),width:"100%",justifyContent:"center",opacity:busy?.7:1}} onClick={enviar} disabled={busy}>{busy?"Enviando...":"Enviarme el código"}</button>
        </>
      ):(
        <>
          <label style={lbl}>Código de 6 dígitos</label>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus style={{...inp,fontSize:22,padding:10,marginBottom:10,textAlign:"center",letterSpacing:6}} value={codigo} onChange={ev=>setCodigo(ev.target.value.replace(/\D/g,""))} onKeyDown={ev=>ev.key==="Enter"&&verificar()} placeholder="······"/>
          <button style={{...BP(false),width:"100%",justifyContent:"center",opacity:busy?.7:1}} onClick={verificar} disabled={busy}>{busy?"Verificando...":"Entrar"}</button>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
            <button style={BG(true)} onClick={()=>{setPaso(1);setMsg(null);}} disabled={busy}>← Cambiar correo</button>
            <button style={BG(true)} onClick={enviar} disabled={busy}>Reenviar código</button>
          </div>
        </>
      )}
    </div>
  );
}

function ResidenteReqs({reqs,tasks,session,onOpen,onNew,mob}){
  // Quien entra sin cuenta debe confirmar su correo con un código antes de ver solicitudes
  const [acc,setAcc]=useState(getAcceso);
  const invitado=!session?.email;
  const email=(session?.email||(acc&&acc.email)||"").trim().toLowerCase();
  const hoy=new Date(); hoy.setHours(0,0,0,0);

  // Solicitudes que levantó este residente (por correo)
  const misReqs=email?reqs.filter(r=>(r.requesterEmail||"").trim().toLowerCase()===email):[];

  // Órdenes vencidas sin informe asociadas a sus solicitudes
  const misReqIds=new Set(misReqs.map(r=>r.id));
  const vencidas=tasks.filter(t=>{
    if(!t.dueDate||t.informe?.trim()||t.status==="Completada"||t.status==="Cancelada") return false;
    if(!misReqIds.has(t.requestId)) return false;
    return new Date(t.dueDate)<hoy;
  });

  if(invitado&&!acc) return(
    <div>
      <div style={{textAlign:"center",marginBottom:14}}><button style={BP(false)} onClick={onNew}>🚨 Reportar una incidencia</button></div>
      <AccesoResidente onOk={setAcc}/>
    </div>
  );

  return(
    <div>
      {vencidas.length>0&&(
        <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
          <div style={{fontWeight:700,color:"#dc2626",fontSize:14,marginBottom:8}}>⚠ {vencidas.length} orden{vencidas.length>1?"es":""} vencida{vencidas.length>1?"s":""} sin informe</div>
          {vencidas.map(t=>{
            const req=reqs.find(r=>r.id===t.requestId);
            const dias=Math.ceil((hoy-new Date(t.dueDate))/86400000);
            return(
              <div key={t.id} style={{background:"#fff",borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:"3px solid #ef4444",fontSize:13}}>
                <div style={{fontWeight:600}}>{t.title}</div>
                {req&&<div style={{color:"#3b82f6",fontSize:11}}>{req.code} — {req.category}</div>}
                <div style={{color:"#dc2626",fontSize:11,marginTop:2}}>Venció hace {dias} día{dias>1?"s":""} · Sin informe de cierre</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:15}}>Mis solicitudes ({misReqs.length})</div>
        <button style={BP(true)} onClick={onNew}>+ Nueva</button>
      </div>
      {invitado&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>Solicitudes de {email} · <span style={{color:"#3b82f6",cursor:"pointer"}} onClick={()=>{setAcceso(null);setAcc(null);}}>usar otro correo</span></div>}

      {misReqs.length===0
        ? <Empty msg="Aún no tienes solicitudes. Usa el botón + Nueva para reportar una incidencia."/>
        : misReqs.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(r=>{
            const tareasReq=tasks.filter(t=>t.requestId===r.id);
            const venc=tareasReq.filter(t=>t.dueDate&&!t.informe?.trim()&&t.status!=="Completada"&&t.status!=="Cancelada"&&new Date(t.dueDate)<hoy);
            return(
              <div key={r.id} onClick={()=>onOpen(r)} style={{...card,marginBottom:8,padding:12,cursor:"pointer",borderLeft:"4px solid "+(SC[r.status]||"#e2e8f0")}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{r.code} — {r.category}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{r.description?.slice(0,80)}{r.description?.length>80?"…":""}</div>
                    <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>📅 {fmtD(r.createdAt)}</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:3}}>{sigPaso(r,"Residente",0)}</div>
                    {r.status==="Cerrada"&&!evalDe(r)&&<div style={{fontSize:11,color:"#1d4ed8",fontWeight:600,marginTop:2}}>Toca para decirnos si quedó resuelto →</div>}
                    {venc.length>0&&<div style={{fontSize:11,color:"#dc2626",marginTop:2}}>⚠ {venc.length} orden{venc.length>1?"es":""} vencida{venc.length>1?"s":""}</div>}
                  </div>
                  <div style={{flexShrink:0}}><SBadge s={r.status}/></div>
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

// ── MisSolicitudes ─────────────────────────────────────────────────────────
function MisSolicitudes({tasks,reqs,session,role,onOpen,mob}){
  const nombre=session?.nombre||"";
  const email=session?.email||"";
  const [tabMS,setTabMS]=useState("ejecutor");
  const [selIds,setSelIds]=useState([]);
  const [filterSt,setFilterSt]=useState("");
  const [q,setQ]=useState("");

  const matchMe = (val) => val&&(val===nombre||val===email);

  // Tareas donde soy ejecutor
  const tareasEjecutor=tasks.filter(t=>matchMe(t.ejecutor));
  // Tareas donde soy responsable (aunque también sea ejecutor — se muestran en ambas)
  const tareasResponsable=tasks.filter(t=>matchMe(t.responsible));

  // Solicitudes únicas por grupo
  const reqIdsEjecutor=[...new Set(tareasEjecutor.map(t=>t.requestId))];
  const reqIdsResponsable=[...new Set(tareasResponsable.map(t=>t.requestId))];

  // Si no hay tareas, buscar también solicitudes asignadas directamente
  const reqsAsignadas=reqs.filter(r=>matchMe(r.assignedTo));
  const reqIdsAsignadas=reqsAsignadas.map(r=>r.id);
  const allReqIdsResponsable=[...new Set([...reqIdsResponsable,...reqIdsAsignadas])];

  const activeIds=tabMS==="ejecutor"?reqIdsEjecutor:allReqIdsResponsable;
  const activeTareas=tabMS==="ejecutor"?tareasEjecutor:tareasResponsable;

  const visibleReqs=reqs.filter(r=>
    activeIds.includes(r.id)&&
    (!filterSt||r.status===filterSt)&&
    (!q||(r.code+" "+r.category+" "+(r.description||"")).toLowerCase().includes(q.toLowerCase()))
  );

  const toggleSel=id=>setSelIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const toggleAll=()=>setSelIds(selIds.length===visibleReqs.length?[]:visibleReqs.map(r=>r.id));

  const tabs=[
    {id:"ejecutor",label:"Como Ejecutor ("+reqIdsEjecutor.length+")"},
    {id:"responsable",label:"Como Responsable ("+reqIdsResponsable.length+")"},
  ];

  return(
    <div>
      <Tabs tabs={tabs} active={tabMS} onChange={t=>{setTabMS(t);setSelIds([]);}} accent="#6366f1"/>

      {/* Resumen del rol */}
      <div style={{...card,background:tabMS==="ejecutor"?"#eef2ff":"#f0fdf4",border:"1px solid "+(tabMS==="ejecutor"?"#c7d2fe":"#86efac"),marginBottom:12}}>
        <div style={{fontWeight:600,fontSize:13,color:tabMS==="ejecutor"?"#4338ca":"#16a34a",marginBottom:4}}>
          {tabMS==="ejecutor"?"🔧 Eres el ejecutor de estas solicitudes":"👤 Eres el responsable de estas solicitudes"}
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <span style={bdg("#6366f1","#eef2ff")}>{activeTareas.filter(t=>{const r=reqs.find(x=>x.id===t.requestId);return r&&!["Cerrada","Rechazada"].includes(r.status);}).length} activas</span>
          <span style={bdg("#10b981","#f0fdf4")}>{activeTareas.filter(t=>t.status==="Completada").length} órdenes completadas</span>
          <span style={bdg("#ef4444","#fef2f2")}>{activeTareas.filter(t=>t.informe?.trim()).length} con informe</span>
        </div>
      </div>

      {/* Filtros */}
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input style={{...inp,flex:2,minWidth:100}} placeholder="Buscar..." value={q} onChange={ev=>setQ(ev.target.value)}/>
          <select style={{...sel,flex:1}} value={filterSt} onChange={ev=>setFilterSt(ev.target.value)}>
            <option value="">Todos los estados</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <span style={{fontSize:11,color:"#64748b",flexShrink:0}}>{visibleReqs.length} solicitudes</span>
        </div>
        {visibleReqs.length>0&&(
          <div style={{marginTop:8,display:"flex",gap:6,alignItems:"center"}}>
            <button style={BS(true)} onClick={toggleAll}>
              {selIds.length===visibleReqs.length?"Deseleccionar todo":"Seleccionar todo"}
            </button>
            {selIds.length>0&&(
              <span style={bdg("#6366f1","#eef2ff")}>{selIds.length} seleccionada(s)</span>
            )}
          </div>
        )}
      </div>

      {/* Lista */}
      {visibleReqs.length===0?<Empty msg="Sin solicitudes en esta categoría"/>:(
        <div>{visibleReqs.map(r=>{
          const misOTs=activeTareas.filter(t=>t.requestId===r.id);
          const isSel=selIds.includes(r.id);
          return(
            <div key={r.id} style={{...card,borderLeft:"4px solid "+(isSel?"#6366f1":PC[r.priority]||"#e2e8f0"),marginBottom:8,background:isSel?"#eef2ff":"#fff",transition:"background .15s"}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                {/* Checkbox */}
                <div style={{paddingTop:2,flexShrink:0}}>
                  <input type="checkbox" checked={isSel} onChange={()=>toggleSel(r.id)} style={{width:16,height:16,cursor:"pointer",accentColor:"#6366f1"}}/>
                </div>
                {/* Info */}
                <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>onOpen(r)}>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                    <span style={{fontWeight:700,color:"#6366f1",fontSize:13}}>{r.code}</span>
                    <PBadge p={r.priority}/>
                    <SBadge s={r.status}/>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1e293b",marginBottom:2}}>{r.category} — {r.subcategory}</div>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>{r.description?.slice(0,80)}{r.description?.length>80?"...":""}</div>
                  {/* Mis órdenes en esta solicitud */}
                  {misOTs.map(t=>(
                    <div key={t.id} style={{background:"#f8fafc",borderRadius:6,padding:"6px 10px",marginBottom:4,border:"1px solid #e2e8f0"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <div>
                          <span style={{fontSize:12,fontWeight:600}}>{t.title}</span>
                          <div style={{fontSize:10,color:"#64748b",marginTop:1}}>
                            {tabMS==="ejecutor"?"🔧 Ejecutor":"👤 Responsable"} · {t.dueDate?("📅 "+fmtD(t.dueDate)):"Sin fecha"}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                          <SBadge s={t.status}/>
                          {t.informe?.trim()&&<span style={bdg("#10b981","#f0fdf4")}>✓ Informe</span>}
                          {!t.informe?.trim()&&t.status!=="Completada"&&t.dueDate&&Math.ceil((new Date(t.dueDate)-new Date())/86400000)<=3&&(
                            <span style={bdg("#ef4444","#fef2f2")}>⚠ Vence pronto</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Torre {r.tower}{r.unit?" / Unidad "+r.unit:""} · {fmtD(r.createdAt)}</div>
                </div>
              </div>
            </div>
          );
        })}</div>
      )}

      {/* Acciones con seleccionados */}
      {selIds.length>0&&(
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#1e293b",borderRadius:12,padding:"12px 20px",display:"flex",gap:12,alignItems:"center",zIndex:500,boxShadow:"0 8px 24px rgba(0,0,0,.3)"}}>
          <span style={{color:"#fff",fontSize:13,fontWeight:600}}>{selIds.length} seleccionada(s)</span>
          <button style={BS(true)} onClick={()=>setSelIds([])}>Limpiar</button>
          <button style={BP(true)} onClick={()=>{const r=reqs.find(x=>x.id===selIds[0]);if(r)onOpen(r);}}>Ver detalle</button>
        </div>
      )}
    </div>
  );
}

// ── ProviderDash ───────────────────────────────────────────────────────────
function ProviderDash({role,mob,reqs,session}){
  const myReqs=reqs.filter(r=>r.assignedTo&&(r.assignedTo===session?.nombre||r.assignedTo===session?.email));
  return(
    <div>
      <div style={{...card,background:"#1e3a5f",marginBottom:16}}><div style={{color:"#fff",fontWeight:700,fontSize:16,marginBottom:4}}>Mis Trabajos Asignados</div><div style={{color:"#94a3b8",fontSize:12}}>Asignados a {session?.nombre||"ti"}</div></div>
      <Grid cols={3} mob={mob}>
        <Kpi value={myReqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status)).length} label="Activas" color="#3b82f6" mob={mob}/>
        <Kpi value={myReqs.filter(r=>r.status==="Resuelta").length} label="Resueltas" color="#10b981" mob={mob}/>
        <Kpi value={myReqs.filter(r=>r.status==="Cerrada").length} label="Cerradas" color="#6b7280" mob={mob}/>
      </Grid>
      {myReqs.length===0?<Empty msg="No tienes solicitudes asignadas"/>:(
        <div>{myReqs.map(r=>(
          <div key={r.id} style={{...card,borderLeft:"4px solid "+(PC[r.priority]||"#e2e8f0"),marginBottom:10,padding:14}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}><span style={{fontWeight:700,color:"#3b82f6"}}>{r.code}</span><PBadge p={r.priority}/><SBadge s={r.status}/></div>
            <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{r.category}</div>
            <div style={{fontSize:12,color:"#374151",marginTop:4}}>{r.description}</div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

// ── Inspections ────────────────────────────────────────────────────────────
function Inspections({inspections,setInsp,reqs,setReqs,showToast,role,mob,towers}){
  const [sub,setSub]=useState("list");
  const [selIns,setSelIns]=useState(null);
  const readOnly=!can(role,"inspection");
  if(sub==="new") return <InspForm inspections={inspections} setInsp={setInsp} reqs={reqs} setReqs={setReqs} showToast={showToast} role={role} onBack={()=>setSub("list")} mob={mob} towers={towers}/>;
  if(sub==="detail"&&selIns){const ins=inspections.find(i=>i.id===selIns.id)||selIns;return <InspDetail inspection={normInsp(ins)} inspections={inspections} setInsp={setInsp} reqs={reqs} setReqs={setReqs} showToast={showToast} role={role} onBack={()=>setSub("list")} readOnly={readOnly} mob={mob}/>;}
  return(
    <div>
      <Grid cols={4} mob={mob}>
        <Kpi value={inspections.length} label="Total" color="#6366f1" mob={mob}/>
        <Kpi value={inspections.filter(i=>i.status==="Finalizada").length} label="Finalizadas" color="#10b981" mob={mob}/>
        <Kpi value={inspections.reduce((a,i)=>a+Object.values(i.items||{}).filter(v=>v.state==="Malo").length,0)} label="Malos" color="#ef4444" mob={mob}/>
        <Kpi value={inspections.reduce((a,i)=>a+Object.values(i.items||{}).filter(v=>v.state==="Regular").length,0)} label="Regulares" color="#f59e0b" mob={mob}/>
      </Grid>
      <div style={{...card,padding:12,marginBottom:12,display:"flex",justifyContent:"flex-end"}}>
        {!readOnly&&<button style={BP(true)} onClick={()=>setSub("new")}>+ Nueva inspección</button>}
      </div>
      {inspections.length===0?<Empty msg="Sin inspecciones"/>:(
        <div>{[...inspections].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(ins=>{
          const mal=Object.values(ins.items||{}).filter(v=>v.state==="Malo").length;
          const reg=Object.values(ins.items||{}).filter(v=>v.state==="Regular").length;
          return(
            <div key={ins.id} style={{...card,padding:12,marginBottom:8,cursor:"pointer",borderLeft:"4px solid "+(ins.status==="Finalizada"?"#10b981":"#f59e0b")}} onClick={()=>{setSelIns(ins);setSub("detail");}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div><span style={{fontWeight:700,color:"#6366f1"}}>{ins.id}</span><div style={{fontSize:12,color:"#64748b"}}>{ins.sector} - {fmtD(ins.date)}</div></div>
                <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                  <span style={bdg(ins.status==="Finalizada"?"#10b981":"#f59e0b",ins.status==="Finalizada"?"#f0fdf4":"#fffbeb")}>{ins.status}</span>
                  <div style={{display:"flex",gap:4}}>{mal>0&&<span style={bdg("#ef4444","#fef2f2")}>{mal} malos</span>}{reg>0&&<span style={bdg("#f59e0b","#fffbeb")}>{reg} reg.</span>}</div>
                </div>
              </div>
            </div>
          );
        })}</div>
      )}
    </div>
  );
}

function InspForm({inspections,setInsp,reqs,setReqs,showToast,role,onBack,mob,towers}){
  const nowStr=new Date().toISOString().slice(0,16);
  const towerSectors=(towers||[]).filter(t=>t.active).map(t=>t.label);
  const allSectors=[...towerSectors,...["Estacionamientos","Perimetro exterior","Jardines","Techumbres"].filter(s=>!towerSectors.includes(s))];
  const [meta,setMeta]=useState({date:nowStr,inspector:role,sector:allSectors[0]||"",conclusion:""});
  const [items,setItems]=useState(mkItems());
  const [actSec,setActSec]=useState("s1");
  const fileRef=useRef();
  const [pendImg,setPendImg]=useState(null);
  const setItem=(sid,name,field,val)=>{const k=sid+"_"+name;setItems(p=>({...p,[k]:{...p[k],[field]:val}}));};
  const getItem=(sid,name)=>items[sid+"_"+name]||{state:"",obs:"",urgency:"",images:[],reqId:null};
  const all=Object.values(items); const answered=all.filter(v=>v.state).length; const pct=Math.round((answered/all.length)*100);
  const handleImg=ev=>{if(!pendImg)return;const fi=ev.target.files[0];if(!fi)return;const rd=new FileReader();rd.onload=e2=>{const{sid,name}=pendImg;setItem(sid,name,"images",[...(getItem(sid,name).images||[]),e2.target.result]);};rd.readAsDataURL(fi);ev.target.value="";};
  const createReq=(sid,name)=>{const it=getItem(sid,name);const sec=CL_SECTIONS.find(s=>s.id===sid);const code=genCode(reqs,"SOL-");const now=new Date().toISOString();const pr=it.urgency==="Critica"?"Emergencia":it.urgency==="Alta"?"Alta":it.urgency==="Media"?"Media":"Baja";const nr=normReq({id:code,code,createdAt:now,requesterName:meta.inspector,requesterEmail:"admin@condo.cl",tower:"Comun",unit:meta.sector,category:"Espacios comunes",subcategory:sec?sec.label:"",description:"[Insp] "+name+": "+(it.obs||""),priority:pr,status:"Ingresada",assignedTo:"Sin asignar",history:[{date:now,user:meta.inspector,action:"Desde inspección",from:null,to:"Ingresada"}],dueDate:null,isUrgent:it.urgency==="Critica"});setReqs(p=>[nr,...p]);setItem(sid,name,"reqId",code);showToast("Solicitud "+code+" creada");};
  const save=st=>{if(!meta.sector||!meta.inspector){showToast("Complete sector e inspector","error");return;}if(st==="Finalizada"&&!meta.conclusion.trim()){showToast("Ingrese conclusión","error");return;}const code=genCode(inspections,"INS-");setInsp(p=>[{id:code,date:meta.date,inspector:meta.inspector,sector:meta.sector,status:st,conclusion:meta.conclusion,items},...p]);showToast(st==="Finalizada"?"Inspección finalizada":"Borrador guardado");onBack();};
  const secIdx=CL_SECTIONS.findIndex(s=>s.id===actSec); const sec=CL_SECTIONS[secIdx];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><button style={BS(true)} onClick={onBack}>← Volver</button><div style={{fontWeight:700,fontSize:mob?15:18}}>Nueva Inspección</div></div>
      <div style={card}><div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:10}}><div style={fg}><label style={lbl}>Fecha</label><input type="datetime-local" style={inp} value={meta.date} onChange={ev=>setMeta(p=>({...p,date:ev.target.value}))}/></div><div style={fg}><label style={lbl}>Inspector</label><input style={inp} value={meta.inspector} onChange={ev=>setMeta(p=>({...p,inspector:ev.target.value}))}/></div><div style={fg}><label style={lbl}>Sector</label><select style={sel} value={meta.sector} onChange={ev=>setMeta(p=>({...p,sector:ev.target.value}))}>{allSectors.map(s=><option key={s}>{s}</option>)}</select></div></div></div>
      <div style={{...card,padding:14,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontWeight:600,fontSize:12}}>Progreso: {answered}/{all.length}</div><div style={{display:"flex",gap:6}}><span style={bdg("#10b981","#f0fdf4")}>{all.filter(v=>v.state==="Bueno").length} ok</span><span style={bdg("#f59e0b","#fffbeb")}>{all.filter(v=>v.state==="Regular").length} reg.</span><span style={bdg("#ef4444","#fef2f2")}>{all.filter(v=>v.state==="Malo").length} malos</span></div></div>
        <div style={{height:7,background:"#f1f5f9",borderRadius:99}}><div style={{height:7,background:pct===100?"#10b981":"#3b82f6",borderRadius:99,width:pct+"%",transition:"width .3s"}}/></div>
      </div>
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12,paddingBottom:4}}>
        {CL_SECTIONS.map(s=>{const sm=s.items.map(n=>getItem(s.id,n)).filter(v=>v.state==="Malo").length;return <button key={s.id} style={actSec===s.id?BP(true):BS(true)} onClick={()=>setActSec(s.id)}>{s.label.split(" ")[0]}{sm>0?" ["+sm+"]":""}</button>;})}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
      {sec&&(
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{sec.label}</div>
          {sec.items.map(name=>{
            const it=getItem(sec.id,name); const isMalo=it.state==="Malo";
            return(
              <div key={name} style={{borderBottom:"1px solid #f1f5f9",paddingBottom:12,marginBottom:12}}>
                <div style={{fontWeight:600,fontSize:12,marginBottom:6}}>{name}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                  {ITEM_STATES.map(s=><button key={s} onClick={()=>setItem(sec.id,name,"state",s)} style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,cursor:"pointer",border:"2px solid "+(it.state===s?ITEM_COLOR[s]:"#e2e8f0"),background:it.state===s?ITEM_COLOR[s]+"22":"#f9fafb",color:it.state===s?ITEM_COLOR[s]:"#6b7280"}}>{s}</button>)}
                </div>
                {it.state&&it.state!=="No aplica"&&(
                  <div style={{display:"flex",gap:8,marginBottom:6}}>
                    <input style={{...inp,flex:1,fontSize:12}} placeholder="Observación..." value={it.obs} onChange={ev=>setItem(sec.id,name,"obs",ev.target.value)}/>
                    {isMalo&&<select style={{...sel,width:110,fontSize:12}} value={it.urgency} onChange={ev=>setItem(sec.id,name,"urgency",ev.target.value)}><option value="">Urgencia...</option>{URGENCY_LEVELS.map(u=><option key={u}>{u}</option>)}</select>}
                  </div>
                )}
                {(it.state==="Malo"||it.state==="Regular")&&(
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <button style={BS(true)} onClick={()=>{setPendImg({sid:sec.id,name});fileRef.current.click();}}>Foto</button>
                    {(it.images||[]).map((img,i)=><img key={i} src={img} alt="" style={{...thumb,width:50,height:40}}/>)}
                    {isMalo&&!it.reqId&&<button style={BD(true)} onClick={()=>createReq(sec.id,name)}>+ Solicitud</button>}
                    {isMalo&&it.reqId&&<span style={bdg("#10b981","#f0fdf4")}>✓ {it.reqId}</span>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            {secIdx>0&&<button style={BS(true)} onClick={()=>setActSec(CL_SECTIONS[secIdx-1].id)}>← Anterior</button>}
            {secIdx<CL_SECTIONS.length-1&&<button style={{...BP(true),marginLeft:"auto"}} onClick={()=>setActSec(CL_SECTIONS[secIdx+1].id)}>Siguiente →</button>}
          </div>
        </div>
      )}
      <div style={card}>
        <label style={lbl}>Conclusión general *</label>
        <textarea style={{...inp,height:80,resize:"vertical"}} placeholder="Resuma los hallazgos..." value={meta.conclusion} onChange={ev=>setMeta(p=>({...p,conclusion:ev.target.value}))}/>
        <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}>
          <button style={BS(true)} onClick={()=>save("Borrador")}>Guardar borrador</button>
          <button style={BP(true)} onClick={()=>save("Finalizada")}>Finalizar</button>
        </div>
      </div>
    </div>
  );
}

function InspDetail({inspection,inspections,setInsp,reqs,setReqs,showToast,role,onBack,readOnly,mob}){
  const [tab,setTab]=useState("resumen");
  const safeItems=inspection.items||mkItems();
  const allEntries=Object.entries(safeItems);
  const malos=allEntries.filter(en=>en[1].state==="Malo");
  const regs=allEntries.filter(en=>en[1].state==="Regular");
  const bues=allEntries.filter(en=>en[1].state==="Bueno");
  const createReq=(key,it)=>{if(it.reqId){showToast("Ya existe","error");return;}const parts=key.split("_");const sid=parts[0];const name=parts.slice(1).join("_");const sec=CL_SECTIONS.find(s=>s.id===sid);const code=genCode(reqs,"SOL-");const now=new Date().toISOString();const pr=it.urgency==="Critica"?"Emergencia":it.urgency==="Alta"?"Alta":it.urgency==="Media"?"Media":"Baja";const nr=normReq({id:code,code,createdAt:now,requesterName:inspection.inspector,requesterEmail:"admin@condo.cl",tower:"Comun",unit:inspection.sector,category:"Espacios comunes",subcategory:sec?sec.label:"",description:"["+inspection.id+"] "+name+": "+(it.obs||""),priority:pr,status:"Ingresada",assignedTo:"Sin asignar",history:[{date:now,user:inspection.inspector,action:"Desde inspección",from:null,to:"Ingresada"}],dueDate:null,isUrgent:it.urgency==="Critica"});setReqs(p=>[nr,...p]);setInsp(p=>p.map(i=>i.id!==inspection.id?i:{...i,items:{...i.items,[key]:{...i.items[key],reqId:code}}}));showToast("Solicitud "+code+" creada");};
  const tabs=[{id:"resumen",label:"Resumen"},{id:"hallazgos",label:"Hallazgos ("+(malos.length+regs.length)+")"},{id:"checklist",label:"Checklist"}];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <button style={BS(true)} onClick={onBack}>← Volver</button>
        <div style={{flex:1}}><span style={{fontWeight:700,fontSize:mob?15:18}}>{inspection.id}</span><span style={{...bdg(inspection.status==="Finalizada"?"#10b981":"#f59e0b",inspection.status==="Finalizada"?"#f0fdf4":"#fffbeb"),marginLeft:8}}>{inspection.status}</span><div style={{fontSize:11,color:"#64748b"}}>{inspection.sector} - {fmt(inspection.date)}</div></div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} accent="#6366f1"/>
      {tab==="resumen"&&<div><Grid cols={4} mob={mob}><Kpi value={bues.length+regs.length+malos.length} label="Revisados" color="#3b82f6" mob={mob}/><Kpi value={bues.length} label="Buenos" color="#10b981" mob={mob}/><Kpi value={regs.length} label="Regulares" color="#f59e0b" mob={mob}/><Kpi value={malos.length} label="Malos" color="#ef4444" mob={mob}/></Grid><div style={card}><p style={{fontSize:13,margin:0}}>{inspection.conclusion||"Sin conclusión."}</p></div></div>}
      {tab==="hallazgos"&&(
        <div>
          {malos.length+regs.length===0?<Empty msg="Sin hallazgos"/>:[...malos,...regs].map(entry=>{
            const key=entry[0]; const it=entry[1];
            const parts=key.split("_"); const name=parts.slice(1).join("_");
            const isMalo=it.state==="Malo";
            return(
              <div key={key} style={{...card,borderLeft:"4px solid "+(isMalo?"#ef4444":"#f59e0b"),padding:12,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                  <div><div style={{fontWeight:600,fontSize:13}}>{name}</div>{it.obs&&<p style={{fontSize:12,margin:"4px 0 0"}}>{it.obs}</p>}</div>
                  <span style={bdg(ITEM_COLOR[it.state],ITEM_COLOR[it.state]+"22")}>{it.state}</span>
                </div>
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  {(it.images||[]).map((img,i)=><img key={i} src={img} alt="" style={{...thumb,width:54,height:42}}/>)}
                  {it.reqId?<span style={bdg("#10b981","#f0fdf4")}>✓ {it.reqId}</span>:(isMalo&&!readOnly&&<button style={BD(true)} onClick={()=>createReq(key,it)}>+ Solicitud</button>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="checklist"&&(
        <div>{CL_SECTIONS.map(sec=>(
          <div key={sec.id} style={{...card,marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>{sec.label}</div>
            <table style={tbl}><thead><tr>{["Item","Estado","Obs","Solicitud"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{sec.items.map(name=>{const it=safeItems[sec.id+"_"+name]||{};return(<tr key={name}><td style={tdS}>{name}</td><td style={tdS}>{it.state?<span style={bdg(ITEM_COLOR[it.state]||"#94a3b8",(ITEM_COLOR[it.state]||"#94a3b8")+"22")}>{it.state}</span>:"---"}</td><td style={tdS}><span style={{fontSize:10,color:"#64748b"}}>{it.obs||"---"}</span></td><td style={tdS}>{it.reqId?<span style={bdg("#10b981","#f0fdf4")}>{it.reqId}</span>:"---"}</td></tr>);})}</tbody></table>
          </div>
        ))}</div>
      )}
    </div>
  );
}

// ── InvView ────────────────────────────────────────────────────────────────
function InvView({inventory,setInv,reqs,role,showToast,mob}){
  const [fi,setFi]=useState({cat:"",q:"",low:false});
  const [showForm,setShowForm]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [movement,setMov]=useState(null);
  const readOnly=can(role,"inventoryRead")&&!can(role,"inventory");
  if(!can(role,"inventory")&&!can(role,"inventoryRead")) return <Empty msg="Sin acceso"/>;
  const visible=inventory.filter(i=>(!fi.cat||i.category===fi.cat)&&(!fi.q||(i.name+" "+i.category).toLowerCase().includes(fi.q.toLowerCase()))&&(!fi.low||i.stock<i.minStock));
  const lowStock=inventory.filter(i=>i.stock<i.minStock).length;
  const saveItem=item=>{if(editItem){setInv(p=>p.map(i=>i.id===item.id?item:i));}else{setInv(p=>[...p,{...item,id:"inv"+uid()}]);}showToast("Guardado");setShowForm(false);setEditItem(null);};
  const adjStock=(id,delta)=>{setInv(p=>p.map(i=>i.id===id?{...i,stock:Math.max(0,i.stock+delta)}:i));showToast("Stock actualizado");setMov(null);};
  return(
    <div>
      <Grid cols={4} mob={mob}>
        <Kpi value={inventory.length} label="Total" color="#6366f1" mob={mob}/>
        <Kpi value={lowStock} label="Stock crítico" color="#ef4444" mob={mob}/>
        <Kpi value={inventory.filter(i=>i.stock>=i.minStock).length} label="Stock OK" color="#10b981" mob={mob}/>
        <Kpi value={"$"+inventory.reduce((s,i)=>s+(i.stock*i.cost),0).toLocaleString("es-CL")} label="Valor total" color="#3b82f6" mob={mob}/>
      </Grid>
      {lowStock>0&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:12}} onClick={()=>setFi(p=>({...p,low:true}))}><span style={{fontWeight:700,color:"#dc2626"}}>⚠</span><strong style={{color:"#dc2626"}}>{lowStock} insumo(s) bajo el mínimo</strong></div>}
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input style={{...inp,flex:2,minWidth:120}} placeholder="Buscar..." value={fi.q} onChange={ev=>setFi(p=>({...p,q:ev.target.value}))}/>
          <select style={{...sel,flex:1}} value={fi.cat} onChange={ev=>setFi(p=>({...p,cat:ev.target.value}))}><option value="">Todas las categorías</option>{INV_CATS.map(c=><option key={c}>{c}</option>)}</select>
          {!readOnly&&<button style={BP(true)} onClick={()=>{setEditItem(null);setShowForm(true);}}>+ Agregar</button>}
        </div>
      </div>
      {visible.length===0?<Empty msg="Sin insumos"/>:(
        <div>{visible.map(item=>{
          const low=item.stock<item.minStock;
          return(
            <div key={item.id} style={{...card,borderLeft:"4px solid "+(low?"#ef4444":"#10b981"),padding:12,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{item.name}</div><div style={{fontSize:11,color:"#64748b"}}>{item.category} - {item.location}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontWeight:700,fontSize:16,color:low?"#ef4444":"#1e293b"}}>{item.stock} <span style={{fontSize:11,fontWeight:400}}>{item.unit}</span></div><div style={{fontSize:10,color:"#94a3b8"}}>min: {item.minStock}</div></div>
              </div>
              {!readOnly&&(
                <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                  <button style={BS(true)} onClick={()=>setMov({item,dir:1})}>+ Stock</button>
                  <button style={BS(true)} onClick={()=>setMov({item,dir:-1})}>- Stock</button>
                  <button style={BG(true)} onClick={()=>{setEditItem(item);setShowForm(true);}}>Editar</button>
                  <button style={BG(true)} onClick={()=>setInv(p=>p.filter(i=>i.id!==item.id))}>Eliminar</button>
                </div>
              )}
            </div>
          );
        })}</div>
      )}
      {showForm&&<InvForm item={editItem} onSave={saveItem} onClose={()=>{setShowForm(false);setEditItem(null);}}/>}
      {movement&&<StockModal data={movement} onConfirm={adjStock} onClose={()=>setMov(null)}/>}
    </div>
  );
}

function InvForm({item,onSave,onClose}){
  const [f,setF]=useState({name:"",category:INV_CATS[0],unit:INV_UNITS[0],stock:0,minStock:1,location:"Bodega",cost:0,...(item||{})});
  return(
    <div style={MSt}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:500,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>{item?"Editar":"Nuevo"} insumo</h3><button style={BG(true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Nombre *</label><input style={inp} value={f.name} onChange={ev=>setF(p=>({...p,name:ev.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Categoría</label><select style={sel} value={f.category} onChange={ev=>setF(p=>({...p,category:ev.target.value}))}>{INV_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Unidad</label><select style={sel} value={f.unit} onChange={ev=>setF(p=>({...p,unit:ev.target.value}))}>{INV_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Stock actual</label><input type="number" min="0" style={inp} value={f.stock} onChange={ev=>setF(p=>({...p,stock:Math.max(0,+ev.target.value)}))}/></div>
        <div style={fg}><label style={lbl}>Stock mínimo</label><input type="number" min="0" style={inp} value={f.minStock} onChange={ev=>setF(p=>({...p,minStock:Math.max(0,+ev.target.value)}))}/></div>
        <div style={fg}><label style={lbl}>Costo unit.</label><input type="number" min="0" style={inp} value={f.cost} onChange={ev=>setF(p=>({...p,cost:Math.max(0,+ev.target.value)}))}/></div>
        <div style={fg}><label style={lbl}>Ubicación</label><input style={inp} value={f.location} onChange={ev=>setF(p=>({...p,location:ev.target.value}))}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BP(true)} onClick={()=>{if(!f.name.trim())return;onSave(f);}}>Guardar</button></div>
    </div></div>
  );
}

function StockModal({data,onConfirm,onClose}){
  const [qty,setQty]=useState(1);
  const isIn=data.dir>0; const max=isIn?9999:data.item.stock; const safeQty=Math.min(Math.max(1,qty),max);
  return(
    <div style={MSt}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:380,padding:"20px",marginTop:16}}>
      <h3 style={{margin:"0 0 12px",fontSize:15}}>{isIn?"Ingreso":"Egreso"} - {data.item.name}</h3>
      <div style={{...alrt(isIn?"success":"error"),marginBottom:12}}>Stock actual: <strong>{data.item.stock} {data.item.unit}</strong></div>
      <div style={fg}><label style={lbl}>Cantidad</label><input type="number" min="1" max={max} style={inp} value={qty} onChange={ev=>setQty(Math.max(1,+ev.target.value))}/></div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Resultante: <strong>{data.item.stock+(isIn?safeQty:-safeQty)} {data.item.unit}</strong></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button style={BS(true)} onClick={onClose}>Cancelar</button>
        {isIn
          ?<button style={BSu(true)} onClick={()=>onConfirm(data.item.id,safeQty)}>Confirmar ingreso</button>
          :<button style={BD(true)} disabled={qty>data.item.stock} onClick={()=>onConfirm(data.item.id,-safeQty)}>Confirmar egreso</button>
        }
      </div>
    </div></div>
  );
}

// ── EmailsView ─────────────────────────────────────────────────────────────
function EmailsView({logs,setEmails,role}){
  const [q,setQ]=useState("");
  const visible=[...logs].sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(lg=>!q||((lg.to||"")+(lg.subject||"")).toLowerCase().includes(q.toLowerCase()));
  return(
    <div>
      <div style={{...card,padding:12,marginBottom:12,display:"flex",gap:8}}>
        <input style={{...inp,flex:1}} placeholder="Buscar..." value={q} onChange={ev=>setQ(ev.target.value)}/>
        {can(role,"manageConfig")&&logs.length>0&&(
          <button style={BD(true)} onClick={()=>{if(window.confirm("¿Eliminar todos?"))setEmails([]);}}>🗑 Limpiar</button>
        )}
      </div>
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontWeight:600,fontSize:13}}>Bandeja</div>
          <span style={bdg("#10b981","#f0fdf4")}>{logs.length} enviados</span>
        </div>
        {visible.length===0?<Empty msg="Sin correos"/>:visible.map((lg,i)=>(
          <div key={lg.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0"}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
              <span style={{fontWeight:600,fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lg.subject}</span>
              <span style={bdg("#6366f1","#eef2ff")}>{lg.type}</span>
              {can(role,"manageConfig")&&<button style={{...BG(true),padding:"2px 6px",fontSize:11,color:"#ef4444"}} onClick={()=>setEmails(p=>p.filter(x=>x.id!==lg.id))}>🗑</button>}
            </div>
            <div style={{fontSize:10,color:"#64748b"}}>{lg.to} - {fmt(lg.date)}</div>
            <div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4,marginTop:4}}>{lg.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reports ────────────────────────────────────────────────────────────────
function Reports({reqs,tasks,inventory,mob}){
  const [per,setPer]=useState("todo");
  const PERIODOS=[{id:"30",label:"30 días"},{id:"90",label:"90 días"},{id:"365",label:"12 meses"},{id:"todo",label:"Todo"}];
  const desde=per==="todo"?null:new Date(Date.now()-parseInt(per,10)*86400000);
  // Solicitudes creadas dentro del período elegido
  const rq=desde?reqs.filter(r=>r.createdAt&&new Date(r.createdAt)>=desde):reqs;
  const cerradas=rq.filter(r=>r.status==="Cerrada");
  const abiertas=rq.filter(esAbierta);
  const avgGlobal=promDias(cerradas);
  const pctCierre=rq.length?Math.round(cerradas.length/rq.length*100):0;

  // Cumplimiento de plazos: cerradas dentro del plazo de su prioridad
  const conPlazo=cerradas.filter(r=>enPlazo(r)!==null);
  const nEnPlazo=conPlazo.filter(r=>enPlazo(r)).length;
  const pctPlazo=pct(nEnPlazo,conPlazo.length);
  const abFuera=abiertas.filter(fueraPlazo);
  const slaPrio=PRIORITIES.map(p=>{
    const c=conPlazo.filter(r=>r.priority===p);
    return {p,total:c.length,ok:c.filter(r=>enPlazo(r)).length,fuera:abFuera.filter(r=>r.priority===p).length};
  });
  // Tiempo hasta asignar responsable
  const hAsig=promNum(rq.map(horasAsignar));
  const nAsig=rq.filter(r=>horasAsignar(r)!==null).length;
  // Evaluación del residente
  const evaluadas=cerradas.filter(r=>evalDe(r));
  const nSi=evaluadas.filter(r=>evalDe(r).resuelto).length;
  const pctSi=pct(nSi,evaluadas.length);

  // Tendencia: siempre los últimos 6 meses (no depende del filtro)
  const tendencia=ultMeses(6).map(m=>({
    label:m.label,
    creadas:reqs.filter(r=>mesKey(r.createdAt)===m.key).length,
    cerradas:reqs.filter(r=>{const f=r.status==="Cerrada"?fechaCierre(r):null;return f&&mesKey(f)===m.key;}).length,
  }));
  const maxTend=Math.max(...tendencia.map(m=>Math.max(m.creadas,m.cerradas)),1);

  // Por categoría (se toman de los datos, así aparecen también las categorías creadas en Configuración)
  const catNames=[...new Set(rq.map(r=>r.category||"Sin categoría"))];
  const catStats=catNames.map(c=>{
    const rCat=rq.filter(r=>(r.category||"Sin categoría")===c);
    return {c,total:rCat.length,abiertas:rCat.filter(esAbierta).length,avg:promDias(rCat.filter(r=>r.status==="Cerrada"))};
  }).sort((a,b)=>b.total-a.total);
  const maxCat=Math.max(...catStats.map(x=>x.total),1);

  // Responsables: solicitudes asignadas + órdenes vencidas sin informe
  const respMap={};
  const R=n=>respMap[n]||(respMap[n]={asignadas:0,cerradas:0,pendientes:0,ordVenc:0,lista:[]});
  rq.forEach(r=>{
    if(!r.assignedTo||r.assignedTo==="Sin asignar") return;
    const s=R(r.assignedTo); s.asignadas++;
    if(r.status==="Cerrada"){s.cerradas++;s.lista.push(r);}
    else if(esAbierta(r)) s.pendientes++;
  });
  tasks.forEach(t=>{ if(t.responsible&&tareaPend(t)&&diffDue(t)<0) R(t.responsible).ordVenc++; });
  const respArr=Object.entries(respMap).sort((a,b)=>(b[1].asignadas-a[1].asignadas)||(b[1].ordVenc-a[1].ordVenc));

  // Órdenes de trabajo (estado actual)
  const ordPend=tasks.filter(tareaPend);
  const ordVenc=ordPend.filter(t=>diffDue(t)<0).length;
  const ordPorVencer=ordPend.filter(t=>diffDue(t)>=0&&diffDue(t)<=3).length;
  const ordComp=tasks.filter(t=>t.status==="Completada"||(t.informe||"").trim()).length;
  const ordSinFecha=tasks.filter(t=>!t.dueDate&&!(t.informe||"").trim()&&t.status!=="Completada"&&t.status!=="Cancelada").length;

  const sinAsignar=abiertas.filter(r=>!r.assignedTo||r.assignedTo==="Sin asignar").sort(ordPrioridad);
  const stockCrit=inventory.filter(i=>i.stock<i.minStock).length;

  const exportCSV=()=>{
    const esc=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
    const num=d=>d===null?"":String(Math.round(d*10)/10).replace(".",",");
    const head=["Código","Fecha ingreso","Categoría","Subcategoría","Prioridad","Estado","Responsable","Fecha cierre","Días resolución","Días abierta","Plazo","Dentro de plazo","Horas hasta asignar","Residente confirma"];
    const rows=rq.map(r=>{const f=r.status==="Cerrada"?fechaCierre(r):null;return [r.code,fmtD(r.createdAt),r.category,r.subcategory,r.priority,r.status,r.assignedTo,f?fmtD(f):"",num(r.status==="Cerrada"?diasCierre(r):null),esAbierta(r)?diasAbierta(r):"",slaTxt(r.priority),r.status==="Cerrada"?(enPlazo(r)===null?"":enPlazo(r)?"Sí":"No"):(fueraPlazo(r)?"No (abierta)":""),num(horasAsignar(r)),r.status==="Cerrada"&&evalDe(r)?(evalDe(r).resuelto?"Sí":"No"):""];});
    const csv="﻿"+[head,...rows].map(l=>l.map(esc).join(";")).join("\r\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download="solicitudes_"+new Date().toISOString().slice(0,10)+".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };

  return(
    <div>
      {/* Filtro de período + exportar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {PERIODOS.map(p=>(
            <button key={p.id} onClick={()=>setPer(p.id)} style={{padding:"5px 12px",borderRadius:99,fontSize:12,cursor:"pointer",border:"1px solid "+(per===p.id?"#6366f1":"#e2e8f0"),background:per===p.id?"#6366f1":"#fff",color:per===p.id?"#fff":"#64748b",fontWeight:per===p.id?600:400}}>{p.label}</button>
          ))}
        </div>
        <button style={BS(true)} onClick={exportCSV} disabled={!rq.length}>⬇ Exportar Excel (CSV)</button>
      </div>

      {/* KPIs resumen */}
      <Grid cols={4} mob={mob}>
        <Kpi value={rq.length} label={per==="todo"?"Total solicitudes":"Solicitudes ingresadas"} color="#6366f1" mob={mob}/>
        <Kpi value={abiertas.length} label="Siguen abiertas" color="#3b82f6" mob={mob}/>
        <Kpi value={cerradas.length+" ("+pctCierre+"%)"} label="Cerradas" color="#10b981" mob={mob}/>
        <Kpi value={fmtDias(avgGlobal)} label="Prom. resolución" color="#f97316" mob={mob}/>
      </Grid>

      {/* ¿Se cumple el objetivo? */}
      <div style={{fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.4,margin:"4px 0 8px"}}>¿Se está cumpliendo el objetivo?</div>
      <Grid cols={4} mob={mob}>
        <Kpi value={pctPlazo===null?"---":pctPlazo+"%"} label={"Resueltas dentro de plazo"+(conPlazo.length?" ("+nEnPlazo+" de "+conPlazo.length+")":"")} color={pctPlazo===null?"#94a3b8":pctPlazo>=80?"#10b981":pctPlazo>=50?"#f59e0b":"#ef4444"} mob={mob}/>
        <Kpi value={abFuera.length} label="Abiertas fuera de plazo" color={abFuera.length?"#f97316":"#10b981"} mob={mob}/>
        <Kpi value={fmtHoras(hAsig)} label={"Tiempo hasta asignar"+(nAsig?" ("+nAsig+" asignadas)":"")} color="#6366f1" mob={mob}/>
        <Kpi value={pctSi===null?"---":pctSi+"%"} label={"Residente confirma solución"+(evaluadas.length?" ("+nSi+" de "+evaluadas.length+" respuestas)":" (sin respuestas)")} color={pctSi===null?"#94a3b8":pctSi>=80?"#10b981":pctSi>=50?"#f59e0b":"#ef4444"} mob={mob}/>
      </Grid>

      {rq.length===0&&<div style={card}><Empty msg="No hay solicitudes en este período"/></div>}

      {/* Sin asignar */}
      {sinAsignar.length>0&&(
        <div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",marginBottom:12}}>
          <div style={{fontWeight:700,color:"#92400e",fontSize:13,marginBottom:8}}>⚠ {sinAsignar.length} solicitud{sinAsignar.length>1?"es":""} sin asignar</div>
          {sinAsignar.slice(0,5).map(r=>(
            <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #fde68a",fontSize:12}}>
              <span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span>
              <span style={{color:"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.category} · hace {diasAbierta(r)} día(s)</span>
              <PBadge p={r.priority}/>
            </div>
          ))}
          {sinAsignar.length>5&&<div style={{fontSize:11,color:"#92400e",marginTop:4}}>...y {sinAsignar.length-5} más</div>}
        </div>
      )}

      {/* Tendencia mensual */}
      <div style={{...card,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>📈 Tendencia mensual (últimos 6 meses)</div>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:118}}>
          {tendencia.map(m=>(
            <div key={m.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:80}}>
                <div title={"Creadas: "+m.creadas} style={{flex:1,background:"#3b82f6",borderRadius:"3px 3px 0 0",height:m.creadas?Math.max(3,Math.round(m.creadas/maxTend*80)):1}}/>
                <div title={"Cerradas: "+m.cerradas} style={{flex:1,background:"#10b981",borderRadius:"3px 3px 0 0",height:m.cerradas?Math.max(3,Math.round(m.cerradas/maxTend*80)):1}}/>
              </div>
              <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>{m.creadas} / {m.cerradas}</div>
              <div style={{fontSize:9,color:"#94a3b8"}}>{m.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:12,marginTop:6,justifyContent:"center"}}>
          <div style={{display:"flex",gap:4,alignItems:"center"}}><div style={{width:10,height:10,background:"#3b82f6",borderRadius:2}}/><span style={{fontSize:11,color:"#64748b"}}>Creadas</span></div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}><div style={{width:10,height:10,background:"#10b981",borderRadius:2}}/><span style={{fontSize:11,color:"#64748b"}}>Cerradas</span></div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
        {/* Por categoría */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📂 Por categoría</div>
          {catStats.length===0?<Empty msg="Sin datos"/>:catStats.map(x=>(
            <div key={x.c} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:6,fontSize:11,marginBottom:3}}>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,fontWeight:500}}>{x.c}</span>
                <div style={{display:"flex",gap:4,flexShrink:0,alignItems:"center"}}>
                  <span style={{fontWeight:700}}>{x.total}</span>
                  {x.avg!==null&&<span style={bdg("#64748b","#f1f5f9")}>{fmtDias(x.avg)} prom.</span>}
                  {x.abiertas>0&&<span style={bdg("#d97706","#fffbeb")}>{x.abiertas} abierta{x.abiertas>1?"s":""}</span>}
                </div>
              </div>
              <div style={{height:6,background:"#f1f5f9",borderRadius:99}}>
                <div style={{height:6,background:"#6366f1",borderRadius:99,width:(x.total/maxCat*100)+"%"}}/>
              </div>
            </div>
          ))}
        </div>

        {/* Responsables */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>👤 Desempeño por responsable</div>
          {respArr.length===0?<Empty msg="Sin datos"/>:respArr.map(([resp,st])=>{
            const pct=st.asignadas>0?Math.round(st.cerradas/st.asignadas*100):0;
            const avg=promDias(st.lista);
            return(
              <div key={resp} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:6,fontSize:11,marginBottom:3}}>
                  <span style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{resp}</span>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    <span style={bdg("#10b981","#f0fdf4")}>{st.cerradas}/{st.asignadas}</span>
                    {avg!==null&&<span style={bdg("#64748b","#f1f5f9")}>{fmtDias(avg)} prom.</span>}
                    {st.ordVenc>0&&<span style={bdg("#ef4444","#fef2f2")}>{st.ordVenc} orden{st.ordVenc>1?"es":""} venc.</span>}
                  </div>
                </div>
                <div style={{height:6,background:"#f1f5f9",borderRadius:99}}>
                  <div style={{height:6,background:pct>=80?"#10b981":pct>=50?"#f59e0b":"#ef4444",borderRadius:99,width:pct+"%"}}/>
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{st.asignadas>0?pct+"% cerradas · "+st.pendientes+" pendiente"+(st.pendientes!==1?"s":""):"Solo órdenes de trabajo"}</div>
              </div>
            );
          })}
        </div>

        {/* Por estado */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>📊 Por estado</div>
          {STATUSES.map(s=>{
            const c=rq.filter(r=>r.status===s).length;
            const pct=rq.length?Math.round(c/rq.length*100):0;
            return c>0?(
              <div key={s} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:92,flexShrink:0}}><SBadge s={s}/></div>
                <div style={{flex:1,height:5,background:"#f1f5f9",borderRadius:99}}>
                  <div style={{height:5,background:SC[s]||"#94a3b8",borderRadius:99,width:pct+"%"}}/>
                </div>
                <span style={{fontWeight:700,fontSize:12,minWidth:24,textAlign:"right"}}>{c}</span>
              </div>
            ):null;
          })}
        </div>

        {/* Por prioridad */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>🚨 Por prioridad</div>
          {PRIORITIES.map(p=>{
            const n=rq.filter(r=>r.priority===p).length;
            const pct=rq.length?Math.round(n/rq.length*100):0;
            return(
              <div key={p} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <div style={{width:92,flexShrink:0}}><PBadge p={p}/></div>
                <div style={{flex:1,height:5,background:"#f1f5f9",borderRadius:99}}>
                  <div style={{height:5,background:PC[p],borderRadius:99,width:pct+"%"}}/>
                </div>
                <span style={{fontWeight:700,fontSize:12,minWidth:20,textAlign:"right"}}>{n}</span>
              </div>
            );
          })}
        </div>

        {/* Cumplimiento de plazos por prioridad */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>⏱ Cumplimiento de plazos</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>Cerradas dentro del plazo de su prioridad.</div>
          {slaPrio.map(x=>{
            const pc=pct(x.ok,x.total);
            return(
              <div key={x.p} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:6,fontSize:11,marginBottom:3,alignItems:"center"}}>
                  <span><PBadge p={x.p}/> <span style={{color:"#94a3b8"}}>plazo {slaTxt(x.p)}</span></span>
                  <span style={{display:"flex",gap:4,alignItems:"center"}}>
                    <span style={{fontWeight:700}}>{pc===null?"sin cierres":pc+"% ("+x.ok+"/"+x.total+")"}</span>
                    {x.fuera>0&&<span style={bdg("#c2410c","#fff7ed")}>{x.fuera} abierta{x.fuera>1?"s":""} atrasada{x.fuera>1?"s":""}</span>}
                  </span>
                </div>
                <div style={{height:6,background:"#f1f5f9",borderRadius:99}}>
                  <div style={{height:6,background:pc===null?"#e2e8f0":pc>=80?"#10b981":pc>=50?"#f59e0b":"#ef4444",borderRadius:99,width:(pc||0)+"%"}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Órdenes de trabajo */}
        <div style={card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>⚙️ Órdenes de trabajo (hoy)</div>
          <IR l="Total órdenes" v={tasks.length}/>
          <IR l="Completadas / con informe" v={ordComp}/>
          <IR l="Vencidas sin informe" v={ordVenc}/>
          <IR l="Vencen en 3 días" v={ordPorVencer}/>
          <IR l="Pendientes sin fecha límite" v={ordSinFecha}/>
          {stockCrit>0&&(
            <div style={{marginTop:12}}>
              <span style={bdg("#ef4444","#fef2f2")}>⚠ {stockCrit} ítem{stockCrit>1?"s":""} con stock crítico</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MantView ───────────────────────────────────────────────────────────────
function MantView({mant,setMant,role,showToast,mob,respList,towers,equipos,setEquipos,certs,setCerts}){
  const [sub,setSub]=useState("list");
  const [sel,setSel]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [editItem,setEdit]=useState(null);
  const [fi,setFi]=useState({cat:"",status:"",q:""});
  const [mantTab,setMantTab]=useState("mant");
  const [showCertForm,setShowCertForm]=useState(false);
  const [editCert,setEditCert]=useState(null);
  const readOnly=!can(role,"mantencion");
  const activeEquipos=(equipos||[]).filter(eq=>eq.active);
  const enriched=mant.map(m=>({...m,computedStatus:getMantStatus(m)}));
  const vencidas=enriched.filter(m=>m.computedStatus==="Vencida").length;
  const porVencer=enriched.filter(m=>m.computedStatus==="Por vencer").length;
  const certsVenc=(certs||[]).filter(c=>{if(!c.vencimiento)return false;return Math.ceil((new Date(c.vencimiento)-new Date())/86400000)<0;}).length;
  const certsPorV=(certs||[]).filter(c=>{if(!c.vencimiento)return false;const d=Math.ceil((new Date(c.vencimiento)-new Date())/86400000);return d>=0&&d<=30;}).length;
  const visible=enriched.filter(m=>{
    if(fi.cat&&m.category!==fi.cat) return false;
    if(fi.status&&m.computedStatus!==fi.status) return false;
    if(fi.q&&!((m.asset||"")+" "+(m.provider||"")).toLowerCase().includes(fi.q.toLowerCase())) return false;
    return true;
  }).sort((a,b)=>{const ord={Vencida:0,"Por vencer":1,"En ejecucion":2,Vigente:3,Completada:4};return(ord[a.computedStatus]??9)-(ord[b.computedStatus]??9);});

  const saveMant=item=>{
    const ts=new Date().toISOString();
    if(editItem){setMant(p=>p.map(m=>m.id===item.id?item:m));showToast("Actualizado");}
    else{const code=genCode(mant,"MAN-");setMant(p=>[normMant({...item,id:code,code,createdAt:ts}),...p]);showToast("Mantención "+code+" creada");}
    setShowForm(false); setEdit(null);
  };
  const saveCert=item=>{
    if(editCert?.id){setCerts(p=>p.map(c=>c.id===item.id?item:c));showToast("Actualizado");}
    else{setCerts(p=>[{...item,id:"cert"+uid()},...p]);showToast("Certificación registrada");}
    setShowCertForm(false); setEditCert(null);
  };

  if(sub==="detail"&&sel){
    const item=normMant(mant.find(m=>m.id===sel.id)||sel);
    return <MantDetail item={item} mant={mant} setMant={setMant} role={role} showToast={showToast} mob={mob} readOnly={readOnly} onBack={()=>{setSub("list");setMantTab("mant");}} respList={respList}/>;
  }

  const mantTabs=[{id:"mant",label:"Mantenciones"},{id:"certs",label:"Certificaciones"+(certsVenc+certsPorV>0?" ⚠":"")}];
  return(
    <div>
      {vencidas>0&&mantTab==="mant"&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontWeight:700,color:"#dc2626"}}>✗</span><strong style={{color:"#dc2626"}}>{vencidas} vencida(s)</strong></div>}
      {porVencer>0&&mantTab==="mant"&&<div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontWeight:700,color:"#92400e"}}>!</span><strong style={{color:"#92400e"}}>{porVencer} por vencer</strong></div>}
      {certsVenc>0&&mantTab==="certs"&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontWeight:700,color:"#dc2626"}}>✗</span><strong style={{color:"#dc2626"}}>{certsVenc} certificación(es) vencida(s)</strong></div>}
      {certsPorV>0&&mantTab==="certs"&&<div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontWeight:700,color:"#92400e"}}>!</span><strong style={{color:"#92400e"}}>{certsPorV} vencen en 30 días</strong></div>}
      <Tabs tabs={mantTabs} active={mantTab} onChange={setMantTab}/>
      {mantTab==="mant"&&(
        <div>
          <div style={{...card,padding:12,marginBottom:12}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <input style={{...inp,flex:2,minWidth:120}} placeholder="Buscar..." value={fi.q} onChange={ev=>setFi(p=>({...p,q:ev.target.value}))}/>
              <select style={{...sel,flex:1}} value={fi.cat} onChange={ev=>setFi(p=>({...p,cat:ev.target.value}))}><option value="">Todas</option>{MANT_CATS.map(c=><option key={c}>{c}</option>)}</select>
              <select style={{...sel,flex:1}} value={fi.status} onChange={ev=>setFi(p=>({...p,status:ev.target.value}))}><option value="">Todos</option>{MANT_ESTADOS.map(s=><option key={s}>{s}</option>)}</select>
              {!readOnly&&<button style={BP(true)} onClick={()=>{setEdit(null);setShowForm(true);}}>+ Nueva</button>}
            </div>
          </div>
          {visible.length===0?<Empty msg="Sin mantenciones"/>:(
            <div>{visible.map(m=>{
              const dL=m.nextDate?Math.ceil((new Date(m.nextDate)-new Date())/86400000):null;
              const dC=dL===null?"#374151":dL<0?"#ef4444":dL<=30?"#f59e0b":"#374151";
              return(
                <div key={m.id} style={{...card,borderLeft:"4px solid "+(MANT_SC[m.computedStatus]||"#e2e8f0"),marginBottom:10,padding:14,cursor:"pointer"}} onClick={()=>{setSel(m);setSub("detail");}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{m.asset}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>{m.subcategory} - {m.location}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                      <MBadge m={m}/>
                      {m.nextDate&&<div style={{fontSize:11,color:dC,fontWeight:600}}>{dL!==null&&(dL<0?Math.abs(dL)+" dias vencida":dL+" dias rest.")}</div>}
                    </div>
                  </div>
                  {!readOnly&&(
                    <div style={{display:"flex",gap:6,marginTop:10}} onClick={ev=>ev.stopPropagation()}>
                      <button style={BS(true)} onClick={()=>{setEdit(m);setShowForm(true);}}>Editar</button>
                      <button style={BG(true)} onClick={()=>setMant(p=>p.filter(x=>x.id!==m.id))}>Eliminar</button>
                    </div>
                  )}
                </div>
              );
            })}</div>
          )}
          {showForm&&<MantForm item={editItem} onSave={saveMant} onClose={()=>{setShowForm(false);setEdit(null);}} respList={respList}/>}
        </div>
      )}
      {mantTab==="certs"&&(
        <div>
          {activeEquipos.length===0?<div style={alrt("warning")}>No hay equipos activos. Ve a Config → Equipos.</div>:(
            <div>
              <div style={{...card,padding:12,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,color:"#64748b"}}>{activeEquipos.length} equipos activos</div>
                {!readOnly&&<button style={BP(true)} onClick={()=>{setEditCert(null);setShowCertForm(true);}}>+ Nueva certificación</button>}
              </div>
              {activeEquipos.map(eq=>{
                const equipCerts=(certs||[]).filter(c=>c.equipoId===eq.id).sort((a,b)=>new Date(b.vencimiento)-new Date(a.vencimiento));
                const lastCert=equipCerts[0];
                const dL=lastCert?.vencimiento?Math.ceil((new Date(lastCert.vencimiento)-new Date())/86400000):null;
                const cColor=dL===null?"#6b7280":dL<0?"#ef4444":dL<=30?"#f59e0b":"#10b981";
                const cBg=dL===null?"#f9fafb":dL<0?"#fef2f2":dL<=30?"#fffbeb":"#f0fdf4";
                return(
                  <div key={eq.id} style={{...card,marginBottom:10,borderLeft:"4px solid "+cColor}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{fontSize:22}}>{eq.icono}</span>
                          <div><div style={{fontWeight:700,fontSize:14}}>{eq.nombre}</div><div style={{fontSize:11,color:"#64748b"}}>Frecuencia: {eq.frecuencia}</div></div>
                        </div>
                        {lastCert?(
                          <div style={{background:cBg,borderRadius:8,padding:"8px 10px",marginTop:6}}>
                            <div style={{fontSize:12,fontWeight:600,color:cColor}}>{dL<0?"Vencida hace "+Math.abs(dL)+" días":dL===0?"Vence hoy":dL<=30?"Vence en "+dL+" días":"Vigente · "+dL+" días"}</div>
                            <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Última: {fmtD(lastCert.fecha)} · Vence: {fmtD(lastCert.vencimiento)}</div>
                            {lastCert.empresa&&<div style={{fontSize:11,color:"#64748b"}}>Empresa: {lastCert.empresa}</div>}
                          </div>
                        ):<div style={{...alrt("warning"),margin:"6px 0 0"}}>Sin certificación registrada</div>}
                      </div>
                      {!readOnly&&<button style={BS(true)} onClick={()=>{setEditCert({equipoId:eq.id,equipoNombre:eq.nombre});setShowCertForm(true);}}>+ Registrar</button>}
                    </div>
                    {equipCerts.length>1&&(
                      <details style={{marginTop:8}}>
                        <summary style={{fontSize:11,color:"#6366f1",cursor:"pointer"}}>Historial ({equipCerts.length})</summary>
                        <div>{equipCerts.map(c=><div key={c.id} style={{fontSize:11,padding:"4px 0",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between"}}><span>{fmtD(c.fecha)} → {fmtD(c.vencimiento)}</span><span style={{color:"#64748b"}}>{c.empresa}</span></div>)}</div>
                      </details>
                    )}
                  </div>
                );
              })}
              {showCertForm&&<CertForm cert={editCert} equipos={activeEquipos} towers={towers} onSave={saveCert} onClose={()=>{setShowCertForm(false);setEditCert(null);}}/>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CertForm({cert,equipos,towers,onSave,onClose}){
  const actT=(towers||[]).filter(t=>t.active);
  const [f,setF]=useState({equipoId:cert?.equipoId||equipos[0]?.id||"",equipoNombre:cert?.equipoNombre||equipos[0]?.nombre||"",fecha:new Date().toISOString().slice(0,10),vencimiento:"",empresa:"",torre:"",ubicacion:"",notas:"",...(cert?.id?cert:{})});
  const setFld=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div style={MSt}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:520,padding:"20px",marginTop:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>Registrar Certificación</h3><button style={BG(true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Equipo *</label><select style={sel} value={f.equipoId} onChange={ev=>{const eq=equipos.find(x=>x.id===ev.target.value);setFld("equipoId",ev.target.value);setFld("equipoNombre",eq?.nombre||"");}}>{equipos.map(eq=><option key={eq.id} value={eq.id}>{eq.icono} {eq.nombre}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Torre</label><select style={sel} value={f.torre} onChange={ev=>setFld("torre",ev.target.value)}><option value="">Sin torre</option>{actT.map(t=><option key={t.id} value={t.name}>{t.label}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Ubicación</label><input style={inp} value={f.ubicacion} onChange={ev=>setFld("ubicacion",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Fecha certificación *</label><input type="date" style={inp} value={f.fecha} onChange={ev=>setFld("fecha",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Fecha vencimiento *</label><input type="date" style={inp} value={f.vencimiento} onChange={ev=>setFld("vencimiento",ev.target.value)}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Empresa responsable</label><input style={inp} value={f.empresa} onChange={ev=>setFld("empresa",ev.target.value)}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Notas</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.notas} onChange={ev=>setFld("notas",ev.target.value)}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BP(true)} onClick={()=>{if(!f.equipoId||!f.fecha||!f.vencimiento)return;onSave(f);}}>Guardar</button></div>
    </div></div>
  );
}

function MantForm({item,onSave,onClose,respList}){
  const defCat=MANT_CATS[0];
  const [f,setF]=useState({asset:"",category:defCat,subcategory:MANT_SUBCATS[defCat][0],location:"",tipo:MANT_TIPOS[0],responsible:(respList&&respList[0])||"",provider:"",lastDate:"",nextDate:"",costEstimated:"",costReal:"",description:"",...(item||{})});
  const setFld=(k,v)=>setF(p=>({...p,[k]:v}));
  const subs=MANT_SUBCATS[f.category]||[];
  return(
    <div style={MSt}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:600,padding:"20px",marginTop:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>{item?"Editar":"Nueva"} mantención</h3><button style={BG(true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Activo *</label><input style={inp} value={f.asset} onChange={ev=>setFld("asset",ev.target.value)} placeholder="ej: Ascensor Torre A"/></div>
        <div style={fg}><label style={lbl}>Categoría</label><select style={sel} value={f.category} onChange={ev=>{const nc=ev.target.value;const ns=MANT_SUBCATS[nc]||[];setFld("category",nc);if(!ns.includes(f.subcategory))setFld("subcategory",ns[0]||"");}}>{MANT_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Subcategoría</label><select style={sel} value={f.subcategory} onChange={ev=>setFld("subcategory",ev.target.value)}>{subs.map(s=><option key={s}>{s}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Ubicación</label><input style={inp} value={f.location} onChange={ev=>setFld("location",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Tipo</label><select style={sel} value={f.tipo} onChange={ev=>setFld("tipo",ev.target.value)}>{MANT_TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Responsable</label><select style={sel} value={f.responsible} onChange={ev=>setFld("responsible",ev.target.value)}>{(respList||[]).map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Proveedor</label><input style={inp} value={f.provider} onChange={ev=>setFld("provider",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Última mantención</label><input type="date" style={inp} value={f.lastDate} onChange={ev=>setFld("lastDate",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Próx. vencimiento</label><input type="date" style={inp} value={f.nextDate} onChange={ev=>setFld("nextDate",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Costo estimado</label><input type="number" min="0" style={inp} value={f.costEstimated} onChange={ev=>setFld("costEstimated",ev.target.value)}/></div>
        <div style={fg}><label style={lbl}>Costo real</label><input type="number" min="0" style={inp} value={f.costReal} onChange={ev=>setFld("costReal",ev.target.value)}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Descripción</label><textarea style={{...inp,height:70,resize:"vertical"}} value={f.description} onChange={ev=>setFld("description",ev.target.value)}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BP(true)} onClick={()=>{if(!f.asset.trim())return;onSave(f);}}>Guardar</button></div>
    </div></div>
  );
}

function MantDetail({item,mant,setMant,role,showToast,mob,readOnly,onBack,respList}){
  const m=normMant(mant.find(x=>x.id===item.id)||item);
  const st=getMantStatus(m);
  const [tab,setTab]=useState("info");
  const [cmt,setCmt]=useState("");
  const [showHF,setShowHF]=useState(false);
  const [showDF,setShowDF]=useState(false);
  const upd=ch=>setMant(p=>p.map(x=>x.id===m.id?{...x,...ch}:x));
  const addCmt=()=>{if(!cmt.trim())return;upd({comments:[...m.comments,{user:role,date:new Date().toISOString(),text:cmt}]});setCmt("");showToast("Comentario agregado");};
  const addHist=h=>{upd({history:[...m.history,{id:"h"+uid(),...h,costReal:+h.costReal}],lastDate:h.date,...(h.marcarVigente?{status:"Vigente"}:{})});showToast("Ejecución registrada");setShowHF(false);};
  const addDoc=d=>{upd({documents:[...m.documents,{id:"doc"+uid(),...d,date:new Date().toISOString().slice(0,10)}]});showToast("Documento agregado");setShowDF(false);};
  const dL=m.nextDate?Math.ceil((new Date(m.nextDate)-new Date())/86400000):null;
  const tabs=[{id:"info",label:"Información"},{id:"history",label:"Historial ("+m.history.length+")"},{id:"docs",label:"Documentos ("+m.documents.length+")"},{id:"comments",label:"Comentarios ("+m.comments.length+")"}];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <button style={BS(true)} onClick={onBack}>← Volver</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:mob?15:18}}>{m.asset}</span><MBadge m={m}/></div>
          <div style={{fontSize:11,color:"#64748b"}}>{m.code} - {m.category}</div>
        </div>
      </div>
      {st==="Vencida"&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,color:"#dc2626"}}>✗</span><strong style={{color:"#dc2626"}}>VENCIDA hace {Math.abs(dL||0)} días</strong></div>}
      {!readOnly&&(
        <div style={{...card,padding:12,marginBottom:12}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <select style={{...sel,width:160}} value={m.status} onChange={ev=>upd({status:ev.target.value})}>{MANT_ESTADOS.map(s=><option key={s}>{s}</option>)}</select>
            <button style={BSu(true)} onClick={()=>setShowHF(true)}>+ Registrar ejecución</button>
            <button style={BS(true)} onClick={()=>setShowDF(true)}>+ Documento</button>
          </div>
        </div>
      )}
      <Tabs tabs={tabs} active={tab} onChange={setTab} accent="#6366f1"/>
      {tab==="info"&&(
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
          <div style={card}><IR l="Categoría" v={(m.category||"")+" / "+(m.subcategory||"")}/><IR l="Ubicación" v={m.location}/><IR l="Tipo" v={m.tipo}/><IR l="Responsable" v={m.responsible}/><IR l="Proveedor" v={m.provider}/></div>
          <div style={card}><IR l="Última mantención" v={m.lastDate?fmtD(m.lastDate):"No registrada"}/><IR l="Próximo vencimiento" v={m.nextDate?fmtD(m.nextDate):"No definida"}/><IR l="Días restantes" v={dL===null?"---":dL<0?Math.abs(dL)+" vencida":dL+" días"}/><IR l="Costo estimado" v={m.costEstimated?"$"+Number(m.costEstimated).toLocaleString("es-CL"):"---"}/><IR l="Costo real" v={m.costReal?"$"+Number(m.costReal).toLocaleString("es-CL"):"Pendiente"}/></div>
          <div style={{...card,gridColumn:"1/-1"}}><p style={{fontSize:13,margin:0}}>{m.description||"Sin descripción."}</p></div>
        </div>
      )}
      {tab==="history"&&(
        <div>
          {!readOnly&&!showHF&&<button style={{...BSu(true),marginBottom:12}} onClick={()=>setShowHF(true)}>+ Registrar ejecución</button>}
          {showHF&&<HistForm onSave={addHist} onClose={()=>setShowHF(false)} respList={respList}/>}
          {m.history.length===0&&!showHF?<Empty msg="Sin historial"/>:(
            <div>{[...m.history].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(h=>(
              <div key={h.id||h.date} style={{...card,borderLeft:"4px solid #6366f1",marginBottom:8}}>
                <div style={{fontWeight:600,fontSize:13}}>{h.tipo} - {fmtD(h.date)}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{h.responsible}</div>
                {h.notes&&<p style={{fontSize:12,margin:"6px 0 0"}}>{h.notes}</p>}
                {h.costReal>0&&<span style={bdg("#10b981","#f0fdf4")}>${Number(h.costReal).toLocaleString("es-CL")}</span>}
              </div>
            ))}</div>
          )}
        </div>
      )}
      {tab==="docs"&&(
        <div>
          {!readOnly&&!showDF&&<button style={{...BS(true),marginBottom:12}} onClick={()=>setShowDF(true)}>+ Agregar documento</button>}
          {showDF&&<DocForm onSave={addDoc} onClose={()=>setShowDF(false)}/>}
          {m.documents.length===0&&!showDF?<Empty msg="Sin documentos"/>:m.documents.map(d=>(
            <div key={d.id} style={{...card,display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:13}}>{d.name}</div>
              <div style={{fontSize:11,color:"#64748b"}}>{fmtD(d.date)}</div>
            </div>
          ))}
        </div>
      )}
      {tab==="comments"&&(
        <div style={card}>
          {m.comments.map((c,i)=>(
            <div key={i} style={{borderLeft:"3px solid #e2e8f0",paddingLeft:10,marginBottom:10}}>
              <strong style={{fontSize:12}}>{c.user}</strong><span style={{fontSize:10,color:"#94a3b8",marginLeft:8}}>{fmt(c.date)}</span>
              <p style={{margin:"4px 0 0",fontSize:13}}>{c.text}</p>
            </div>
          ))}
          {!readOnly&&(
            <div style={{marginTop:10,display:"flex",gap:8}}>
              <input style={{...inp,flex:1}} placeholder="Comentario..." value={cmt} onChange={ev=>setCmt(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&addCmt()}/>
              <button style={BP(true)} onClick={addCmt}>Enviar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistForm({onSave,onClose,respList}){
  const [f,setF]=useState({date:new Date().toISOString().slice(0,10),tipo:MANT_TIPOS[0],responsible:(respList&&respList[0])||"",notes:"",costReal:0,marcarVigente:false});
  return(
    <div style={{...card,border:"2px solid #6366f1",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Registrar ejecución</div><button style={BG(true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={fg}><label style={lbl}>Fecha</label><input type="date" style={inp} value={f.date} onChange={ev=>setF(p=>({...p,date:ev.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Tipo</label><select style={sel} value={f.tipo} onChange={ev=>setF(p=>({...p,tipo:ev.target.value}))}>{MANT_TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Responsable</label><select style={sel} value={f.responsible} onChange={ev=>setF(p=>({...p,responsible:ev.target.value}))}>{(respList||[]).map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Costo real</label><input type="number" min="0" style={inp} value={f.costReal} onChange={ev=>setF(p=>({...p,costReal:Math.max(0,+ev.target.value)}))}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Notas</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.notes} onChange={ev=>setF(p=>({...p,notes:ev.target.value}))}/></div>
        <div style={{...fg,gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" id="mv" checked={f.marcarVigente} onChange={ev=>setF(p=>({...p,marcarVigente:ev.target.checked}))}/><label htmlFor="mv" style={{fontSize:12,cursor:"pointer"}}>Marcar como Vigente</label></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BSu(true)} onClick={()=>{if(!f.date)return;onSave(f);}}>Registrar</button></div>
    </div>
  );
}

function DocForm({onSave,onClose}){
  const [f,setF]=useState({name:"",notes:""});
  return(
    <div style={{...card,border:"2px solid #e2e8f0",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Agregar documento</div><button style={BG(true)} onClick={onClose}>✕</button></div>
      <div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={f.name} onChange={ev=>setF(p=>({...p,name:ev.target.value}))}/></div>
      <div style={fg}><label style={lbl}>Notas</label><input style={inp} value={f.notes} onChange={ev=>setF(p=>({...p,notes:ev.target.value}))}/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BP(true)} onClick={()=>{if(!f.name.trim())return;onSave(f);}}>Agregar</button></div>
    </div>
  );
}

// ── ConfigView ─────────────────────────────────────────────────────────────
function ConfigView({cats,setCats,towers,setTowers,equipos,setEquipos,showToast,session,setUsuarios}){
  const [editCat,setEditCat]=useState(null); const [showCF,setShowCF]=useState(false);
  const [editTow,setEditTow]=useState(null); const [showTF,setShowTF]=useState(false);
  const [tab,setTab]=useState("cats");
  const [usuariosLocal,setUsuariosLocal]=useState([]); const [showUF,setShowUF]=useState(false); const [editUser,setEditUser]=useState(null);
  useEffect(()=>{if(tab==="usuarios")loadUsuarios();},[tab]);
  const loadUsuarios=async()=>{
    try{const _uAll=await dbGet("usuarios");const list=Array.isArray(_uAll)?_uAll:[];setUsuariosLocal(list);setUsuarios(list);}catch(ex){console.error(ex);}
  };
  // Crea el usuario completo: cuenta de acceso + ficha con su rol. Devuelve un texto de error o null.
  const saveUsuario=async(u,acc)=>{
    try{
      if(u.isNew){
        let estado;
        try{ estado=await crearCuenta(u.email,(acc&&acc.pass)||claveAzar()); }
        catch(ex){ return errCuenta(ex); }
        const newId="u"+Date.now();
        await setDoc(doc(fbDb,"usuarios",newId),{id:newId,email:u.email,nombre:u.nombre,rol:u.rol,active:true});
        let aviso="";
        if(estado==="existia"||!acc||acc.mail){
          try{ await sendPasswordResetEmail(fbAuth,u.email); aviso=" · se le envió un correo para crear su contraseña"; }
          catch(_){ aviso=" · no se pudo enviar el correo; usa «Enviar acceso»"; }
        }
        showToast("Usuario creado"+(estado==="existia"?" (ese correo ya tenía cuenta)":"")+aviso);
      }
      else{await setDoc(doc(fbDb,"usuarios",String(u.id)),{id:u.id,email:u.email,nombre:u.nombre,rol:u.rol,active:u.active??true},{merge:true});showToast("Actualizado");}
      loadUsuarios();setShowUF(false);setEditUser(null);
      return null;
    }catch(ex){ return "No se pudo guardar: "+((ex&&ex.message)||ex); }
  };
  // Para usuarios que no tienen cuenta o que olvidaron la clave: se asegura la cuenta y se envía el correo
  const enviarAcceso=async u=>{
    const email=(u.email||"").trim();
    if(!email.includes("@")){showToast("Este usuario no tiene correo","error");return;}
    try{
      await crearCuenta(email,claveAzar());
      await sendPasswordResetEmail(fbAuth,email);
      showToast("Se envió a "+email+" un correo para crear o cambiar su contraseña");
    }catch(ex){showToast(errCuenta(ex),"error");}
  };
  const toggleUser=async u=>{try{await setDoc(doc(fbDb,"usuarios",String(u.id)),{active:!u.active},{merge:true});loadUsuarios();}catch(_){showToast("Error","error");}};
  const deleteUser=async u=>{if(!window.confirm("¿Eliminar "+u.nombre+"?"))return;try{await deleteDoc(doc(fbDb,"usuarios",String(u.id)));loadUsuarios();showToast("Eliminado");}catch(_){showToast("Error","error");}};
  const toggleCat=id=>setCats(p=>p.map(c=>c.id===id?{...c,active:!c.active}:c));
  const saveCat=cat=>{if(editCat){setCats(p=>p.map(c=>c.id===cat.id?cat:c));}else{setCats(p=>[...p,{...cat,id:"cat"+uid(),order:p.length}]);}showToast("Guardada");setShowCF(false);setEditCat(null);};
  const mvCat=(idx,dir)=>setCats(p=>{const a=[...p];if(dir<0&&idx===0||dir>0&&idx>=p.length-1)return p;[a[idx+dir],a[idx]]=[a[idx],a[idx+dir]];return a.map((c,i)=>({...c,order:i}));});
  const toggleTow=id=>setTowers(p=>p.map(t=>t.id===id?{...t,active:!t.active}:t));
  const saveTow=t=>{if(editTow){setTowers(p=>p.map(x=>x.id===t.id?t:x));}else{setTowers(p=>[...p,{...t,id:"t"+uid()}]);}showToast("Guardada");setShowTF(false);setEditTow(null);};
  const sla=Object.fromEntries(PRIORITIES.map(p=>[p,slaTxt(p)]));
  const cfgTabs=[{id:"cats",label:"Categorías"},{id:"towers",label:"Torres"},{id:"equipos",label:"Equipos"},{id:"usuarios",label:"Usuarios"},{id:"sla",label:"SLA"}];
  return(
    <div>
      <Tabs tabs={cfgTabs} active={tab} onChange={setTab}/>
      {tab==="cats"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,color:"#64748b"}}>{cats.filter(c=>c.active).length} activas</div><button style={BP(true)} onClick={()=>{setEditCat(null);setShowCF(true);}}>+ Nueva</button></div>
          <div style={card}>{cats.map((cat,idx)=>(
            <div key={cat.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:cat.active?1:.5,flexWrap:"wrap"}}>
              <div style={{display:"flex",flexDirection:"column"}}><button style={{...BG(true),padding:"1px 4px",fontSize:10}} onClick={()=>mvCat(idx,-1)}>▲</button><button style={{...BG(true),padding:"1px 4px",fontSize:10}} onClick={()=>mvCat(idx,1)}>▼</button></div>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{cat.name}</div><div style={{fontSize:11,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat.subs.join(", ")}</div></div>
              <div style={{display:"flex",gap:4}}><button style={BS(true)} onClick={()=>{setEditCat(cat);setShowCF(true);}}>Editar</button><button style={cat.active?BW(true):BSu(true)} onClick={()=>toggleCat(cat.id)}>{cat.active?"Desact.":"Activar"}</button><button style={BD(true)} onClick={()=>setCats(p=>p.filter(c=>c.id!==cat.id))}>X</button></div>
            </div>
          ))}</div>
          {showCF&&<CatForm cat={editCat} onSave={saveCat} onClose={()=>{setShowCF(false);setEditCat(null);}}/>}
        </div>
      )}
      {tab==="towers"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,color:"#64748b"}}>{towers.filter(t=>t.active).length} activas</div><button style={BP(true)} onClick={()=>{setEditTow(null);setShowTF(true);}}>+ Nueva torre</button></div>
          <div style={card}>{towers.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:t.active?1:.5,flexWrap:"wrap"}}>
              <div style={{width:34,height:34,borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:"#3b82f6"}}>{t.name}</div>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{t.label}</div></div>
              <div style={{display:"flex",gap:4}}><button style={BS(true)} onClick={()=>{setEditTow(t);setShowTF(true);}}>Editar</button><button style={t.active?BW(true):BSu(true)} onClick={()=>toggleTow(t.id)}>{t.active?"Desact.":"Activar"}</button><button style={BD(true)} onClick={()=>setTowers(p=>p.filter(x=>x.id!==t.id))}>X</button></div>
            </div>
          ))}</div>
          {showTF&&<TowerForm tower={editTow} onSave={saveTow} onClose={()=>{setShowTF(false);setEditTow(null);}}/>}
        </div>
      )}
      {tab==="equipos"&&(
        <div>
          <div style={{...alrt("info"),marginBottom:12}}>Activa los equipos que existen en tu edificio.</div>
          <div style={card}>{EQUIP_TIPOS.map(et=>{const eq=(equipos||[]).find(x=>x.id===et.id)||{...et,active:false};return(<div key={et.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:eq.active?1:.5}}><div style={{fontSize:24}}>{et.icono}</div><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{et.nombre}</div><div style={{fontSize:11,color:"#64748b"}}>{et.frecuencia}</div></div><button style={eq.active?BW(true):BSu(true)} onClick={()=>setEquipos(p=>p.map(x=>x.id===et.id?{...x,active:!x.active}:x))}>{eq.active?"Desactivar":"Activar"}</button></div>);})}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:8}}>{(equipos||[]).filter(x=>x.active).length} equipos activos</div>
        </div>
      )}
      {tab==="usuarios"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,color:"#64748b"}}>{usuariosLocal.filter(u=>u.active).length} activos<div style={{fontSize:11,color:"#94a3b8"}}>Aquí se crea el usuario completo, con su acceso. No hace falta entrar a Firebase.</div></div><button style={BP(true)} onClick={()=>{setEditUser(null);setShowUF(true);}}>+ Nuevo usuario</button></div>
          {showUF&&<UserForm user={editUser} existentes={usuariosLocal} onSave={saveUsuario} onClose={()=>{setShowUF(false);setEditUser(null);}}/>}
          <div>{usuariosLocal.map(u=>(
            <div key={u.id} style={{...card,opacity:u.active?1:.6,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{u.nombre}</div><div style={{fontSize:11,color:"#64748b"}}>{u.email}</div><span style={bdg("#6366f1","#eef2ff")}>{u.rol}</span></div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}><button style={BS(true)} onClick={()=>{setEditUser(u);setShowUF(true);}}>Editar</button><button style={BS(true)} title="Envía un correo para crear o cambiar la contraseña" onClick={()=>enviarAcceso(u)}>🔑 Enviar acceso</button><button style={u.active?BW(true):BSu(true)} onClick={()=>toggleUser(u)}>{u.active?"Desactivar":"Activar"}</button><button style={BD(true)} onClick={()=>deleteUser(u)}>Eliminar</button></div>
              </div>
            </div>
          ))}</div>
        </div>
      )}
      {tab==="sla"&&(
        <div style={card}>
          <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>Plazo de resolución por prioridad</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>Con estos plazos se calcula el cumplimiento en Reportes y la marca “Fuera de plazo”.</div>
          {Object.entries(sla).map(([p,t])=>(
            <div key={p} style={{display:"flex",justifyContent:"space-between",marginBottom:10,alignItems:"center"}}><PBadge p={p}/><span style={{fontWeight:600}}>{t}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserForm({user,onSave,onClose,existentes}){
  const [f,setF]=useState(user?{...user,isNew:false}:{nombre:"",email:"",rol:"Residente",active:true,isNew:true});
  const [rol,setRol]=useState(user?.rol||"Residente");
  const [pass,setPass]=useState("");
  const [verPass,setVerPass]=useState(true);
  const [mail,setMail]=useState(true);
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const generar=()=>{ const abc="abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const a=new Uint32Array(10); crypto.getRandomValues(a); setPass(Array.from(a,n=>abc[n%abc.length]).join("")); setVerPass(true); };
  const guardar=async()=>{
    const nombre=f.nombre.trim(), email=f.email.trim().toLowerCase();
    if(!nombre){setErr("Escribe el nombre.");return;}
    if(!user){
      if(!/^\S+@\S+\.\S+$/.test(email)){setErr("Escribe un correo válido.");return;}
      if((existentes||[]).some(u=>(u.email||"").trim().toLowerCase()===email)){setErr("Ya existe un usuario con ese correo.");return;}
      if(pass&&pass.length<6){setErr("La contraseña debe tener al menos 6 caracteres.");return;}
    }
    setErr(""); setBusy(true);
    const e=await onSave({...f,nombre,email:user?f.email:email,rol},{pass,mail:mail||!pass});
    setBusy(false);
    if(e) setErr(e);
  };
  return(
    <div style={MSt}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{user?"Editar":"Nuevo"} usuario</h3><button style={BG(true)} onClick={onClose} disabled={busy}>✕</button></div>
      <div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={f.nombre} onChange={ev=>setF(p=>({...p,nombre:ev.target.value}))}/></div>
      <div style={fg}><label style={lbl}>Correo *</label><input type="email" autoCapitalize="none" style={inp} value={f.email} onChange={ev=>setF(p=>({...p,email:ev.target.value}))} disabled={!!user} placeholder="nombre@correo.com"/>{user&&<div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>El correo no se puede cambiar. Si cambió, crea un usuario nuevo y desactiva este.</div>}</div>
      <div style={fg}><label style={lbl}>Rol</label><select style={sel} value={rol} onChange={ev=>{setRol(ev.target.value);setF(p=>({...p,rol:ev.target.value}));}}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
      {!user&&(
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:12,marginTop:4}}>
          <div style={{fontWeight:600,fontSize:12,marginBottom:6}}>🔑 Acceso a la aplicación</div>
          <label style={lbl}>Contraseña inicial <span style={{fontWeight:400,color:"#94a3b8"}}>(opcional)</span></label>
          <div style={{display:"flex",gap:6}}>
            <input type={verPass?"text":"password"} autoComplete="new-password" style={{...inp,flex:1}} value={pass} onChange={ev=>setPass(ev.target.value)} placeholder="Mínimo 6 caracteres"/>
            <button type="button" style={BS(true)} onClick={generar}>Generar</button>
            {pass&&<button type="button" style={BG(true)} onClick={()=>setVerPass(v=>!v)}>{verPass?"Ocultar":"Ver"}</button>}
          </div>
          <label style={{display:"flex",gap:8,alignItems:"center",fontSize:12,marginTop:10,cursor:pass?"pointer":"default",color:"#334155"}}>
            <input type="checkbox" checked={mail||!pass} disabled={!pass} onChange={ev=>setMail(ev.target.checked)}/>
            Enviarle un correo para que cree su propia contraseña
          </label>
          <div style={{fontSize:11,color:"#94a3b8",marginTop:6}}>{pass?"Entrégale esta contraseña a la persona"+(mail?"; además recibirá el correo para cambiarla.":"."):"Si no escribes una contraseña, la persona la crea desde el correo que le llegará."}</div>
        </div>
      )}
      {err&&<div style={{...alrt("error"),marginTop:10}}>{err}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button style={BS(true)} onClick={onClose} disabled={busy}>Cancelar</button><button style={{...BP(true),opacity:busy?.7:1}} onClick={guardar} disabled={busy}>{busy?"Guardando...":user?"Guardar":"Crear usuario"}</button></div>
    </div></div>
  );
}

function CatForm({cat,onSave,onClose}){
  const [name,setName]=useState(cat?cat.name:"");
  const [subs,setSubs]=useState(cat?cat.subs.join("\n"):"");
  const save=()=>{if(!name.trim())return;const s=subs.split("\n").map(x=>x.trim()).filter(Boolean);if(!s.length)return;onSave({...(cat||{}),name:name.trim(),subs:s,active:cat?cat.active:true});};
  return(
    <div style={MSt}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{cat?"Editar":"Nueva"} categoría</h3><button style={BG(true)} onClick={onClose}>✕</button></div>
      <div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={name} onChange={ev=>setName(ev.target.value)}/></div>
      <div style={fg}><label style={lbl}>Subcategorías (una por línea)</label><textarea style={{...inp,height:120,resize:"vertical"}} value={subs} onChange={ev=>setSubs(ev.target.value)}/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BP(true)} onClick={save}>Guardar</button></div>
    </div></div>
  );
}

function TowerForm({tower,onSave,onClose}){
  const [name,setName]=useState(tower?tower.name:"");
  const [label,setLabel]=useState(tower?tower.label:"");
  return(
    <div style={MSt}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{tower?"Editar":"Nueva"} torre</h3><button style={BG(true)} onClick={onClose}>✕</button></div>
      <div style={fg}><label style={lbl}>Código *</label><input style={inp} value={name} onChange={ev=>setName(ev.target.value)} placeholder="ej: A"/></div>
      <div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={label} onChange={ev=>setLabel(ev.target.value)} placeholder="ej: Torre A"/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={BS(true)} onClick={onClose}>Cancelar</button><button style={BP(true)} onClick={()=>{if(!name.trim()||!label.trim())return;onSave({...(tower||{}),name:name.trim(),label:label.trim(),active:tower?tower.active:true});}}>Guardar</button></div>
    </div></div>
  );
}
