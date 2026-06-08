import { useState, useEffect, useRef } from "react";

const SUPA_URL = "https://ijefrrtdtjshfquuytic.supabase.co";
const SUPA_KEY = "sb_publishable_sZTDO3ROm8IEnzbWuEUK-w_DeOz65XG";

const dbFetch = async (table, method="GET", body=null, filter="") => {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`, {
    method,
    headers: {
      "Content-Type":"application/json",
      "apikey":SUPA_KEY,
      "Authorization":`Bearer ${SUPA_KEY}`,
      "Prefer":method==="POST"?"return=representation":method==="PATCH"?"return=representation":"",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};
const dbGet    = (t, f="")  => dbFetch(t,"GET",null,f||"?select=*");
const dbPost   = (t, b)     => dbFetch(t,"POST",b,"");
const dbPatch  = (t, id, b) => dbFetch(t,"PATCH",b,`?id=eq.${id}`);
const dbUpsert = (t, b)     => fetch(`${SUPA_URL}/rest/v1/${t}`,{
  method:"POST",
  headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Prefer":"resolution=merge-duplicates"},
  body:JSON.stringify(b),
});

const authSignIn = async (email, password) => {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
    body:JSON.stringify({email,password}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description||"Error");
  return data;
};
const authSignOut = async (token) => {
  await fetch(`${SUPA_URL}/auth/v1/logout`,{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${token}`},
  });
};

// ─── UNIDADES ─────────────────────────────────────────────────────────────────
const UNIDADES = [
  {torre:"1036",deptos:["A1","B2","C3","D4","E5","F6","G7","H8"]},
  {torre:"1038",deptos:["A1","B2","C3","D4","E5","F6","G7","H8"]},
  {torre:"1052",deptos:["A1","B2","C3","D4","E5","F6","G7","H8"]},
  {torre:"1054",deptos:["A1","B2","C3","D4","E5","F6","G7","H8"]},
  {torre:"1060",deptos:["A1","B2","C3","D4","E5","F6","G7","H8"]},
  {torre:"1061",deptos:["A1","B2","C3","D4","E6","F5","G7","H8"]},
  {torre:"1080",deptos:["A1","B2","C3","D4","E5","F6","G7","H8"]},
  {torre:"1081",deptos:["A1","B2","C3","D4","E6","F5","G7","H8"]},
];

// FIX #4: TORRE_DIRECCION definido ANTES de cualquier componente que lo usa
const TORRE_DIRECCION = {
  "1080":"3 Oriente 1080","1060":"3 Oriente 1060",
  "1081":"4 Oriente 1081","1061":"4 Oriente 1061",
  "1036":"12 Norte 1036","1038":"12 Norte 1038",
  "1052":"12 Norte 1052","1054":"12 Norte 1054",
};

// FIX #1: gx/gy agregados a cada spot para que SectorMap pueda renderizar
const SPOTS_DATA = [
  // SECTOR 1
  {id:59,torre:"1060",depto:"A1",sector:1,gx:1,gy:0},{id:39,torre:"1036",depto:"A1",sector:1,gx:2,gy:0},
  {id:41,torre:"1080",depto:"A1",sector:1,gx:3,gy:0},{id:46,torre:"1038",depto:"A1",sector:1,gx:4,gy:0},
  {id:62,torre:"1080",depto:"B2",sector:1,gx:1,gy:1},{id:51,torre:"1036",depto:"B2",sector:1,gx:2,gy:1},
  {id:60,torre:"1060",depto:"B2",sector:1,gx:3,gy:1},{id:47,torre:"1080",depto:"C3",sector:1,gx:1,gy:2},
  {id:49,torre:"1036",depto:"C3",sector:1,gx:2,gy:2},{id:53,torre:"1060",depto:"C3",sector:1,gx:3,gy:2},
  {id:48,torre:"1036",depto:"D4",sector:1,gx:5,gy:0},{id:58,torre:"1060",depto:"D4",sector:1,gx:6,gy:0},
  {id:43,torre:"1080",depto:"D4",sector:1,gx:7,gy:0},{id:64,torre:"1080",depto:"E5",sector:1,gx:5,gy:1},
  {id:45,torre:"1036",depto:"E5",sector:1,gx:6,gy:1},{id:56,torre:"1060",depto:"E5",sector:1,gx:7,gy:1},
  {id:50,torre:"1080",depto:"F6",sector:1,gx:5,gy:2},{id:54,torre:"1060",depto:"F6",sector:1,gx:6,gy:2},
  {id:63,torre:"1038",depto:"F6",sector:1,gx:7,gy:2},{id:40,torre:"1080",depto:"G7",sector:1,gx:1,gy:3},
  {id:57,torre:"1060",depto:"G7",sector:1,gx:2,gy:3},{id:42,torre:"1036",depto:"G7",sector:1,gx:3,gy:3},
  {id:55,torre:"1038",depto:"G7",sector:1,gx:4,gy:3},{id:61,torre:"1080",depto:"H8",sector:1,gx:5,gy:3},
  {id:52,torre:"1060",depto:"H8",sector:1,gx:6,gy:3},{id:44,torre:"1036",depto:"H8",sector:1,gx:7,gy:3},
  // SECTOR 2
  {id:33,torre:"1052",depto:"B2",sector:2,gx:1,gy:0},{id:38,torre:"1038",depto:"B2",sector:2,gx:2,gy:0},
  {id:27,torre:"1038",depto:"C3",sector:2,gx:3,gy:0},{id:28,torre:"1052",depto:"C3",sector:2,gx:4,gy:0},
  {id:37,torre:"1038",depto:"D4",sector:2,gx:1,gy:1},{id:29,torre:"1052",depto:"D4",sector:2,gx:2,gy:1},
  {id:36,torre:"1038",depto:"E5",sector:2,gx:3,gy:1},{id:32,torre:"1052",depto:"F6",sector:2,gx:1,gy:2},
  {id:31,torre:"1036",depto:"F6",sector:2,gx:2,gy:2},{id:35,torre:"1052",depto:"G7",sector:2,gx:3,gy:2},
  {id:30,torre:"1052",depto:"H8",sector:2,gx:4,gy:2},{id:34,torre:"1038",depto:"H8",sector:2,gx:5,gy:2},
  // SECTOR 3
  {id:1, torre:"1081",depto:"A1",sector:3,gx:1,gy:0},{id:12,torre:"1061",depto:"A1",sector:3,gx:2,gy:0},
  {id:21,torre:"1052",depto:"A1",sector:3,gx:3,gy:0},{id:6, torre:"1054",depto:"A1",sector:3,gx:4,gy:0},
  {id:8, torre:"1081",depto:"B2",sector:3,gx:1,gy:1},{id:13,torre:"1061",depto:"B2",sector:3,gx:2,gy:1},
  {id:5, torre:"1054",depto:"B2",sector:3,gx:3,gy:1},{id:3, torre:"1081",depto:"C3",sector:3,gx:1,gy:2},
  {id:14,torre:"1061",depto:"C3",sector:3,gx:2,gy:2},{id:23,torre:"1054",depto:"C3",sector:3,gx:3,gy:2},
  {id:9, torre:"1061",depto:"D4",sector:3,gx:5,gy:0},{id:11,torre:"1081",depto:"D4",sector:3,gx:6,gy:0},
  {id:18,torre:"1054",depto:"D4",sector:3,gx:7,gy:0},{id:2, torre:"1081",depto:"E5",sector:3,gx:5,gy:1},
  {id:4, torre:"1054",depto:"E5",sector:3,gx:6,gy:1},{id:16,torre:"1052",depto:"E5",sector:3,gx:7,gy:1},
  {id:10,torre:"1061",depto:"E6",sector:3,gx:5,gy:2},{id:15,torre:"1061",depto:"F5",sector:3,gx:6,gy:2},
  {id:7, torre:"1081",depto:"F6",sector:3,gx:1,gy:3},{id:19,torre:"1054",depto:"F6",sector:3,gx:2,gy:3},
  {id:17,torre:"1054",depto:"G7",sector:3,gx:3,gy:3},{id:20,torre:"1061",depto:"G7",sector:3,gx:4,gy:3},
  {id:25,torre:"1081",depto:"G7",sector:3,gx:5,gy:3},{id:22,torre:"1081",depto:"H8",sector:3,gx:6,gy:3},
  {id:24,torre:"1054",depto:"H8",sector:3,gx:7,gy:3},{id:26,torre:"1061",depto:"H8",sector:3,gx:8,gy:3},
];
const SECTOR_NAMES = {1:"3 Oriente / 12 Norte",2:"Patio Central",3:"4 Oriente / 12 Norte"};

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const ROLES     = ["Administrador","Administrador Edificio","Conserjeria","Residente","Comite","Proveedor"];
const STATUSES  = ["Ingresada","En revision","Asignada","En proceso","Resuelta","Cerrada","Rechazada"];
const PRIORITIES= ["Emergencia","Alta","Media","Baja"];
const STATUS_COLOR  = {Ingresada:"#6366f1","En revision":"#f59e0b",Asignada:"#3b82f6","En proceso":"#8b5cf6",Resuelta:"#10b981",Cerrada:"#6b7280",Rechazada:"#ef4444"};
const PRIORITY_COLOR= {Emergencia:"#ef4444",Alta:"#f97316",Media:"#f59e0b",Baja:"#6b7280"};
const PRIORITY_BG   = {Emergencia:"#fef2f2",Alta:"#fff7ed",Media:"#fffbeb",Baja:"#f9fafb"};
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
  Otros:["Ruidos molestos","Mascotas","Dano propiedad comun","Otro"],
};
const ADMIN_CATS = {
  "Gestión":["Circular informativa","Acta de reunión","Carta a residente","Aviso general","Otro"],
  "Finanzas":["Pago de gastos comunes","Deuda morosa","Cotización","Factura proveedor","Fondo de reserva","Otro"],
  "Documentos":["Solicitud de certificado","Reglamento interno","Contrato proveedor","Permiso municipal","Otro"],
  "Comité":["Convocatoria reunión","Acuerdo de comité","Votación","Otro"],
  "Legal":["Reclamo residente","Infracción reglamento","Denuncia","Mediación","Otro"],
  "Proveedores":["Solicitud de cotización","Evaluación proveedor","Término de contrato","Otro"],
};
const MANT_CATS    = ["Equipos/Maquinaria","Infraestructura","Sistemas"];
const MANT_SUBCATS = {
  "Equipos/Maquinaria":["Ascensor","Motor porton","Bomba agua","Bomba calor","Generador","Otro"],
  "Infraestructura":["Techumbres","Fachadas","Piscina","Quincho","Sala eventos","Otro"],
  "Sistemas":["Electrico","Gas","Agua potable","Citofonia","Camaras","Otro"],
};
const MANT_TIPOS = ["Preventiva","Correctiva","Certificacion","Revision tecnica"];
const MANT_SC    = {Vigente:"#10b981","Por vencer":"#f59e0b",Vencida:"#ef4444","En ejecucion":"#6366f1",Completada:"#6b7280"};
const INV_CATS   = ["Herramientas","Electrico","Plomeria","Pintura","Limpieza","Jardines","Perimetral","Motor","Otros"];
const INV_UNITS  = ["unidad","caja","kg","litro","metro","rollo","par","juego"];
const CL_SECTIONS = [
  {id:"s1",label:"Cierres perimetrales",items:["Reja perimetral","Porton peatonal","Porton vehicular","Cerraduras","Bisagras","Automatizacion","Citofonia","Senaletica"]},
  {id:"s2",label:"Jardines",items:["Cesped","Arboles","Arbustos","Macizos","Sistema riego","Podas","Maleza","Estado general"]},
  {id:"s3",label:"Iluminacion",items:["Luminarias ext","Luminarias pasillos","Luces acceso","Luces estacionamiento","Alumbrado perimetral","Cableado visible","Interruptores"]},
  {id:"s4",label:"Mobiliario",items:["Bancas","Basureros","Juegos infantiles","Bicicleteros","Senaletica interior","Barandas","Rejas interiores"]},
  {id:"s5",label:"Canerias",items:["Canerias visibles","Filtraciones","Goteras","Llaves de paso","Sumideros","Canaletas","Bajadas de agua","Acumulacion agua"]},
  {id:"s6",label:"Techumbres",items:["Techo principal","Cubiertas","Tejas","Sellos","Senales humedad","Riesgo desprendimiento"]},
  {id:"s7",label:"Muros",items:["Muros perimetrales","Fachadas","Grietas","Humedad","Pintura deteriorada","Revestimientos","Vandalismo"]},
  {id:"s8",label:"Circulaciones",items:["Veredas","Pavimentos","Escaleras","Rampas","Pasamanos","Estacionamientos","Senalizacion","Obstaculos"]},
  {id:"s9",label:"Aseo",items:["Limpieza areas comunes","Basura","Escombros","Graffitis","Olores"]},
];
const ITEM_STATES = ["Bueno","Regular","Malo","No aplica"];
const ITEM_COLOR  = {Bueno:"#10b981",Regular:"#f59e0b",Malo:"#ef4444","No aplica":"#94a3b8","":"#d1d5db"};
const PERMS = {
  Administrador:["create","viewAll","assign","changeStatus","closeCases","createTask","viewReports","viewEmails","manageConfig","comment","inspection","inventory","manageWork","mantencion","mantRead"],
  "Administrador Edificio":["create","viewAll","assign","changeStatus","closeCases","createTask","viewReports","viewEmails","comment","inspection","inventory","manageWork","mantencion","mantRead"],
  Conserjeria:["create","viewOps","changeStatusLimited","comment","inspection","inventory","manageWork","mantencion","mantRead"],
  Residente:["create","viewOwn"],
  Comite:["viewAll","viewReports","inspectionRead","inventoryRead","mantRead"],
  Proveedor:["providerDash"],
};
const can = (role, action) => (PERMS[role]||[]).includes(action);

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt  = d => { try { return new Date(d).toLocaleString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); } catch { return String(d); }};
const fmtD = d => { try { return new Date(d).toLocaleDateString("es-CL"); } catch { return String(d); }};
const uid  = () => Math.random().toString(36).slice(2,9);
// FIX #7: String() antes de .replace para evitar crash si id es número
const genCode = (arr, pfx) => {
  const nums = (arr||[]).map(r => parseInt((String(r.id||r.code||"")).replace(/\D/g,""))||0);
  return pfx + String((nums.length ? Math.max(0,...nums) : 0)+1).padStart(3,"0");
};
const getMantStatus = m => {
  if (!m) return "Vigente";
  if (m.status==="En ejecucion"||m.status==="Completada") return m.status;
  if (!m.nextDate) return "Vigente";
  const diff = (new Date(m.nextDate)-new Date())/86400000;
  if (diff<0) return "Vencida"; if (diff<=30) return "Por vencer"; return "Vigente";
};
const mkItems = (ov) => {
  const o=ov||{}, items={};
  CL_SECTIONS.forEach(s=>s.items.forEach(n=>{
    const k=s.id+"_"+n;
    items[k]={state:"",obs:"",urgency:"",images:[],reqId:null,...(o[k]||{})};
  }));
  return items;
};
const normalizeReq  = r => ({comments:[],history:[],attachmentsInitial:[],assignedTo:"Sin asignar",dueDate:null,isUrgent:false,...(r||{})});
const normalizeTask = t => ({comments:[],attachments:[],materials:[],status:"Ingresada",...(t||{})});
const normalizeMant = m => ({history:[],comments:[],documents:[],...(m||{})});
const normalizeInsp = i => ({items:mkItems((i||{}).items),...(i||{})});

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const bdg   = (c,bg) => ({display:"inline-flex",alignItems:"center",padding:"2px 6px",borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,whiteSpace:"nowrap"});
const mkBtn = (v,sm?) => {
  const base={display:"inline-flex",alignItems:"center",gap:4,padding:sm?"4px 8px":"7px 12px",borderRadius:6,fontSize:sm?11:13,fontWeight:600,cursor:"pointer",border:"none",lineHeight:1.2};
  const vs={primary:{background:"#3b82f6",color:"#fff"},secondary:{background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0"},danger:{background:"#ef4444",color:"#fff"},success:{background:"#10b981",color:"#fff"},ghost:{background:"transparent",color:"#6b7280"},warning:{background:"#f59e0b",color:"#fff"},purple:{background:"#8b5cf6",color:"#fff"}};
  return {...base,...(vs[v||"primary"])};
};
const card  = {background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px",marginBottom:12};
const inp   = {width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box" as const};
const selSt = {width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box" as const};
const lbl   = {fontSize:12,fontWeight:600,color:"#374151",marginBottom:3,display:"block"};
const fg    = {marginBottom:10};
const thSt  = {textAlign:"left" as const,padding:"6px 8px",borderBottom:"2px solid #e2e8f0",fontWeight:600,fontSize:10,color:"#6b7280",textTransform:"uppercase" as const,whiteSpace:"nowrap" as const};
const tdSt  = {padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle" as const,fontSize:12};
const tbl   = {width:"100%",borderCollapse:"collapse" as const,fontSize:12};
const kpiSt = {background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px"};
const alrt  = (t:string) => ({padding:"8px 12px",borderRadius:6,fontSize:12,marginBottom:10,background:t==="error"?"#fef2f2":t==="success"?"#f0fdf4":t==="warning"?"#fffbeb":"#eff6ff",color:t==="error"?"#dc2626":t==="success"?"#16a34a":t==="warning"?"#92400e":"#1d4ed8",border:"1px solid "+(t==="error"?"#fca5a5":t==="success"?"#86efac":t==="warning"?"#fde68a":"#bfdbfe")});
const modal = {position:"fixed" as const,inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"8px",overflowY:"auto" as const};
const thumb = {width:64,height:48,objectFit:"cover" as const,borderRadius:6,border:"1px solid #e2e8f0"};

function useMob(){
  const [m,setM]=useState(window.innerWidth<768);
  useEffect(()=>{const h=()=>setM(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return m;
}

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
function SBadge({s}){const c=STATUS_COLOR[s]||"#64748b";return <span style={bdg(c,c+"22")}>{s}</span>;}
function PBadge({p}){return <span style={{...bdg(PRIORITY_COLOR[p]||"#64748b",PRIORITY_BG[p]||"#f9fafb"),fontWeight:700}}>{p==="Emergencia"?"⚠ ":""}{p}</span>;}
function MBadge({m}){const st=getMantStatus(m);return <span style={bdg(MANT_SC[st]||"#64748b",(MANT_SC[st]||"#64748b")+"22")}>{st}</span>;}
function IR({l,v}){return <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600}}>{v==null?"---":String(v)}</span></div>;}
function Empty({msg}){return <div style={{textAlign:"center",padding:"40px 20px",color:"#94a3b8",fontSize:13}}>{msg}</div>;}
function Kpi({value,label,color,mob}){return <div style={{...kpiSt,borderTop:"3px solid "+color}}><div style={{fontSize:mob?18:24,fontWeight:700,color}}>{value}</div><div style={{fontSize:11,color:"#64748b",marginTop:3}}>{label}</div></div>;}
function Grid({cols,mob,children}){return <div style={{display:"grid",gridTemplateColumns:"repeat("+(mob?2:cols)+",1fr)",gap:12,marginBottom:16}}>{children}</div>;}
function Tabs({tabs,active,onChange,accent}){
  const ac=accent||"#3b82f6";
  return <div style={{display:"flex",borderBottom:"2px solid #e2e8f0",marginBottom:12,overflowX:"auto"}}>
    {tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{...mkBtn("ghost"),borderRadius:0,padding:"8px 12px",whiteSpace:"nowrap",borderBottom:active===t.id?"2px solid "+ac:"2px solid transparent",marginBottom:-2,color:active===t.id?ac:"#64748b",fontWeight:active===t.id?700:400}}>{t.label}</button>)}
  </div>;
}
function Loader(){return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16,background:"#f1f5f9"}}><div style={{width:40,height:40,border:"4px solid #e2e8f0",borderTop:"4px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{color:"#64748b",fontSize:14}}>Cargando...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID  = "service_vxhdrlx";
const EMAILJS_TEMPLATE_ID = "template_90tjafk";
const EMAILJS_PUBLIC_KEY  = "wKxD2rJHuftU7W-WE";
const RECIBO_EMAIL        = "com12norte@gmail.com";

const sendRealEmail = async (to, subject, body) => {
  if (!to||!to.includes("@")) return;
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({service_id:EMAILJS_SERVICE_ID,template_id:EMAILJS_TEMPLATE_ID,user_id:EMAILJS_PUBLIC_KEY,
        template_params:{to_email:to,subject,message:body,name:"Comunidad 12 Norte",email:"no-reply@condo12norte.cl"}}),
    });
  } catch(e){console.error("EmailJS:",e);}
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [mode,setMode]=useState(null);
  const [email,setEmail]=useState(""); const [pass,setPass]=useState("");
  const [load,setLoad]=useState(false); const [err,setErr]=useState("");

  const submit=async()=>{
    if(!email||!pass){setErr("Ingrese correo y contraseña");return;}
    setLoad(true);setErr("");
    try{
      const auth=await authSignIn(email,pass);
      const res=await fetch(`${SUPA_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&active=eq.true`,
        {headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${auth.access_token}`}});
      const users=await res.json();
      if(!users||users.length===0) throw new Error("Usuario no encontrado o inactivo");
      onLogin({...users[0],token:auth.access_token});
    }catch(e){setErr(e.message||"Credenciales incorrectas");}
    setLoad(false);
  };

  if(!mode) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{background:"#0f172a",borderRadius:16,width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:28}}>🏢</div>
          <div style={{fontWeight:700,fontSize:24,color:"#0f172a"}}>Comunidad 12 Norte</div>
          <div style={{color:"#64748b",fontSize:14,marginTop:4}}>Sistema de Gestión</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={()=>setMode("residente")} style={{background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(59,130,246,.35)"}}>
            <div style={{fontSize:36}}>🏠</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Soy Residente</div><div style={{color:"#bfdbfe",fontSize:12,marginTop:2}}>Crea o consulta tus incidentes</div></div>
            <div style={{marginLeft:"auto",color:"#bfdbfe",fontSize:20}}>→</div>
          </button>
          <button onClick={()=>setMode("personal")} style={{background:"linear-gradient(135deg,#0f172a,#1e3a5f)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(0,0,0,.25)"}}>
            <div style={{fontSize:36}}>🔑</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Acceso Personal</div><div style={{color:"#94a3b8",fontSize:12,marginTop:2}}>Administración · Conserjería · Comité</div></div>
            <div style={{marginLeft:"auto",color:"#94a3b8",fontSize:20}}>→</div>
          </button>
        </div>
      </div>
    </div>
  );

  if(mode==="residente") return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:400}}>
        <button onClick={()=>setMode(null)} style={{background:"rgba(0,0,0,.06)",border:"none",color:"#64748b",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",marginBottom:24}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:52,marginBottom:12}}>🏠</div>
          <div style={{fontWeight:700,fontSize:22,color:"#0f172a"}}>Bienvenido, Residente</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={()=>onLogin({id:"guest-residente",nombre:"Residente",email:"",rol:"Residente",token:null,openNewReq:true})}
            style={{background:"linear-gradient(135deg,#ef4444,#dc2626)",border:"none",borderRadius:14,padding:"20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16}}>
            <div style={{fontSize:32}}>🚨</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:16}}>Reportar Incidente</div><div style={{color:"#fecaca",fontSize:12,marginTop:2}}>Fallas, problemas o emergencias</div></div>
            <div style={{marginLeft:"auto",color:"#fecaca",fontSize:20}}>→</div>
          </button>
          <button onClick={()=>onLogin({id:"guest-residente",nombre:"Residente",email:"",rol:"Residente",token:null,openNewReq:false,startView:"estacionamientos"})}
            style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",border:"1px solid #334155",borderRadius:14,padding:"20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16}}>
            <div style={{fontSize:32}}>🅿</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:16}}>Estacionamiento</div><div style={{color:"#64748b",fontSize:12,marginTop:2}}>Registra o consulta tu patente</div></div>
            <div style={{marginLeft:"auto",color:"#64748b",fontSize:20}}>→</div>
          </button>
          <button onClick={()=>onLogin({id:"guest-residente",nombre:"Residente",email:"",rol:"Residente",token:null,openNewReq:false,startView:"gastos"})}
            style={{background:"linear-gradient(135deg,#065f46,#047857)",border:"none",borderRadius:14,padding:"20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16}}>
            <div style={{fontSize:32}}>💰</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:16}}>Gastos Comunes</div><div style={{color:"#6ee7b7",fontSize:12,marginTop:2}}>Pagar o enviar comprobante</div></div>
            <div style={{marginLeft:"auto",color:"#6ee7b7",fontSize:20}}>→</div>
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
        <div style={{marginBottom:14}}><label style={{...lbl,color:"#94a3b8"}}>Correo</label><input style={{...inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
        <div style={{marginBottom:24}}><label style={{...lbl,color:"#94a3b8"}}>Contraseña</label><input style={{...inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
        <button style={{width:"100%",padding:"13px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer"}} onClick={submit} disabled={load}>{load?"Ingresando...":"Ingresar"}</button>
      </div>
    </div>
  );
}

// ─── GASTOS COMUNES ───────────────────────────────────────────────────────────
function GastosPagos({addEmail,showToast,mob}){
  const [tab,setTab]=useState("panel");
  const [torre,setTorre]=useState(""); const [depto,setDepto]=useState("");
  const [img,setImg]=useState(null); const [sending,setSending]=useState(false);
  const [done,setDone]=useState(false); const [recibos,setRecibos]=useState([]);
  const fileRef=useRef();
  const deptosFilt=UNIDADES.find(u=>u.torre===torre)?.deptos||[];

  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setImg({name:f.name,url:ev.target.result});r.readAsDataURL(f);};
  const enviar=async()=>{
    if(!torre||!depto){showToast("Selecciona torre y unidad","error");return;}
    if(!img){showToast("Adjunta imagen del recibo","error");return;}
    setSending(true);
    const now=new Date().toISOString();
    const body=`Recibo de pago de gastos comunes\n\nTorre: ${torre}\nUnidad: ${depto}\nFecha: ${fmt(now)}\n\nArchivo: ${img.name}`;
    await sendRealEmail(RECIBO_EMAIL,"[12 Norte] Recibo GC - Torre "+torre+" Unidad "+depto,body);
    const rec={id:"rc"+uid(),torre,depto,fecha:now,imgName:img.name,imgUrl:img.url};
    setRecibos(p=>[rec,...p]);
    addEmail({date:now,to:RECIBO_EMAIL,subject:"Recibo GC - Torre "+torre+" / "+depto,type:"Recibo Pago",status:"Enviado",body});
    setSending(false);setDone(true);showToast("Recibo enviado a "+RECIBO_EMAIL);
    setTimeout(()=>{setDone(false);setTorre("");setDepto("");setImg(null);},3000);
  };

  return(
    <div>
      <div style={{...card,background:"linear-gradient(135deg,#1e3a5f,#0f172a)",border:"none",padding:20,marginBottom:16}}>
        <div style={{color:"#fff",fontWeight:700,fontSize:18,marginBottom:4}}>💰 Gastos Comunes y Pagos</div>
        <div style={{color:"#94a3b8",fontSize:13}}>Comunidad 12 Norte · Viña del Mar</div>
      </div>
      <Tabs tabs={[{id:"panel",label:"Panel"},{id:"recibo",label:"Enviar Recibo"},{id:"historial",label:"Historial"}]} active={tab} onChange={setTab} accent="#10b981"/>
      {tab==="panel"&&(
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:16}}>
          <div style={{...card,border:"2px solid #10b981",padding:24,textAlign:"center",borderRadius:16}}>
            <div style={{fontSize:48,marginBottom:12}}>🏘</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Portal Comunidad Feliz</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:16,lineHeight:1.5}}>Consulta tu estado de cuenta, paga tus gastos comunes y más.</div>
            <a href="https://app.comunidadfeliz.com/" target="_blank" rel="noopener noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:8,padding:"12px 24px",borderRadius:10,background:"#10b981",color:"#fff",textDecoration:"none",fontWeight:700,fontSize:14}}>
              🔗 Ir a Comunidad Feliz
            </a>
          </div>
          <div style={{...card,border:"2px solid #3b82f6",padding:24,textAlign:"center",borderRadius:16,cursor:"pointer"}} onClick={()=>setTab("recibo")}>
            <div style={{fontSize:48,marginBottom:12}}>📤</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Enviar Recibo de Pago</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:16,lineHeight:1.5}}>Adjunta tu comprobante y envíalo directamente a administración.</div>
            <button style={{...mkBtn("primary"),padding:"12px 24px",borderRadius:10,fontSize:14}} onClick={e=>{e.stopPropagation();setTab("recibo");}}>📸 Enviar ahora</button>
          </div>
        </div>
      )}
      {tab==="recibo"&&(
        <div style={{...card,maxWidth:520,margin:"0 auto",padding:24,borderRadius:16}}>
          <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>📤 Enviar Recibo de Pago</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:20}}>El recibo será enviado a: <strong>{RECIBO_EMAIL}</strong></div>
          {done&&<div style={{...alrt("success"),marginBottom:16}}>✅ Recibo enviado correctamente</div>}
          <div style={fg}><label style={lbl}>Torre *</label>
            <select style={selSt} value={torre} onChange={e=>{setTorre(e.target.value);setDepto("");}}>
              <option value="">— Selecciona torre —</option>
              {UNIDADES.map(u=><option key={u.torre} value={u.torre}>{TORRE_DIRECCION[u.torre]||"12 Norte "+u.torre}</option>)}
            </select>
          </div>
          <div style={fg}><label style={lbl}>Unidad / Departamento *</label>
            <select style={selSt} value={depto} onChange={e=>setDepto(e.target.value)} disabled={!torre}>
              <option value="">— Selecciona unidad —</option>
              {deptosFilt.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={fg}>
            <label style={lbl}>Comprobante de pago *</label>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <button style={{...mkBtn("secondary"),flex:1,justifyContent:"center",padding:"10px"}} onClick={()=>{fileRef.current.removeAttribute("capture");fileRef.current.click();}}>🖼 Adjuntar imagen</button>
              <button style={{...mkBtn("primary"),flex:1,justifyContent:"center",padding:"10px"}} onClick={()=>{fileRef.current.setAttribute("capture","environment");fileRef.current.click();}}>📷 Tomar foto</button>
            </div>
            {img&&(
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,border:"1px solid #86efac"}}>
                <img src={img.url} alt="recibo" style={{...thumb,width:56,height:44}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#16a34a"}}>✓ Imagen lista</div>
                  <div style={{fontSize:11,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{img.name}</div>
                </div>
                <button style={mkBtn("ghost",true)} onClick={()=>setImg(null)}>✕</button>
              </div>
            )}
          </div>
          <button style={{...mkBtn("success"),width:"100%",justifyContent:"center",padding:"13px",fontSize:14,marginTop:8}} onClick={enviar} disabled={sending}>
            {sending?"Enviando...":"📤 Enviar Recibo"}
          </button>
        </div>
      )}
      {tab==="historial"&&(
        <div style={card}>
          <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Historial de recibos enviados</div>
          {recibos.length===0?<Empty msg="Sin recibos enviados aún"/>:recibos.map(r=>(
            <div key={r.id} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0",display:"flex",gap:12,alignItems:"center"}}>
              <img src={r.imgUrl} alt="recibo" style={{...thumb,width:56,height:44}}/>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>Torre {r.torre} / {r.depto}</div><div style={{fontSize:11,color:"#64748b"}}>{fmt(r.fecha)}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BODEGAS — FIX #3: sin localStorage ──────────────────────────────────────
function BodegasView({showToast,mob}){
  const [bodegas,setBodegas]=useState([]);
  const [showForm,setShowForm]=useState(false); const [editItem,setEditItem]=useState(null);
  const [fi,setFi]=useState({torre:"",q:""}); const [tab,setTab]=useState("lista");

  const visible=bodegas.filter(b=>{
    if(fi.torre&&b.torre!==fi.torre) return false;
    if(fi.q&&!(b.numero+" "+b.torre+" "+b.depto+" "+(b.propietario||"")).toLowerCase().includes(fi.q.toLowerCase())) return false;
    return true;
  }).sort((a,b)=>String(a.numero).localeCompare(String(b.numero)));

  const saveB=b=>{
    if(editItem){setBodegas(p=>p.map(x=>x.id===b.id?b:x));showToast("Bodega actualizada");}
    else{setBodegas(p=>[...p,{...b,id:"bod"+uid()}]);showToast("Bodega registrada");}
    setShowForm(false);setEditItem(null);
  };
  const delB=id=>{if(window.confirm("¿Eliminar bodega?"))setBodegas(p=>p.filter(x=>x.id!==id));};
  const tot=bodegas.length, asig=bodegas.filter(b=>b.propietario).length;

  return(
    <div>
      <div style={{...card,background:"linear-gradient(135deg,#1e3a5f,#0f172a)",border:"none",padding:20,marginBottom:16}}>
        <div style={{color:"#fff",fontWeight:700,fontSize:18,marginBottom:4}}>🏪 Bodegas</div>
        <div style={{color:"#94a3b8",fontSize:13}}>Gestión de bodegas de la comunidad</div>
      </div>
      <Grid cols={3} mob={mob}>
        <Kpi value={tot} label="Total bodegas" color="#6366f1" mob={mob}/>
        <Kpi value={asig} label="Asignadas" color="#10b981" mob={mob}/>
        <Kpi value={tot-asig} label="Libres" color="#f59e0b" mob={mob}/>
      </Grid>
      <Tabs tabs={[{id:"lista",label:"Lista"},{id:"mapa",label:"Vista por Torre"}]} active={tab} onChange={setTab} accent="#6366f1"/>
      {tab==="lista"&&(
        <div>
          <div style={{...card,padding:12,marginBottom:12}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <input style={{...inp,flex:2,minWidth:120}} placeholder="Buscar número, propietario..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/>
              <select style={{...selSt,flex:1}} value={fi.torre} onChange={e=>setFi(p=>({...p,torre:e.target.value}))}>
                <option value="">Todas las torres</option>
                {UNIDADES.map(u=><option key={u.torre} value={u.torre}>{u.torre}</option>)}
              </select>
              <button style={mkBtn("primary",true)} onClick={()=>{setEditItem(null);setShowForm(true);}}>+ Agregar bodega</button>
            </div>
          </div>
          {visible.length===0?<Empty msg="Sin bodegas registradas"/>:(
            <div style={card}>
              <table style={tbl}>
                <thead><tr>{["N°","Torre","Unidad","Propietario","Estado","Acciones"].map(h=><th key={h} style={thSt}>{h}</th>)}</tr></thead>
                <tbody>{visible.map(b=>(
                  <tr key={b.id}>
                    <td style={tdSt}><span style={{fontWeight:700,color:"#6366f1"}}>#{b.numero}</span></td>
                    <td style={tdSt}>{b.torre}</td><td style={tdSt}>{b.depto}</td>
                    <td style={tdSt}>{b.propietario||<span style={{color:"#94a3b8"}}>Sin asignar</span>}</td>
                    <td style={tdSt}><span style={bdg(b.propietario?"#10b981":"#f59e0b",b.propietario?"#f0fdf4":"#fffbeb")}>{b.propietario?"Asignada":"Libre"}</span></td>
                    <td style={tdSt}>
                      <button style={mkBtn("secondary",true)} onClick={()=>{setEditItem(b);setShowForm(true);}}>Editar</button>
                      <button style={{...mkBtn("ghost",true),color:"#ef4444",marginLeft:4}} onClick={()=>delB(b.id)}>🗑</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab==="mapa"&&(
        <div>{UNIDADES.map(u=>{
          const uBods=bodegas.filter(b=>b.torre===u.torre);
          return(
            <div key={u.torre} style={{...card,marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>Torre {u.torre}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {u.deptos.map(d=>{
                  const bod=uBods.find(b=>b.depto===d);
                  return(
                    <div key={d} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid "+(bod?"#10b981":"#e2e8f0"),background:bod?"#f0fdf4":"#f9fafb",minWidth:60,textAlign:"center",cursor:bod?"pointer":"default"}}
                      onClick={()=>bod&&(setEditItem(bod),setShowForm(true))}>
                      <div style={{fontSize:11,fontWeight:700,color:bod?"#16a34a":"#94a3b8"}}>{d}</div>
                      {bod&&<div style={{fontSize:9,color:"#64748b"}}>#{bod.numero}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}</div>
      )}
      {showForm&&<BodegaForm item={editItem} onSave={saveB} onClose={()=>{setShowForm(false);setEditItem(null);}}/>}
    </div>
  );
}

function BodegaForm({item,onSave,onClose}){
  const [f,setF]=useState({numero:"",torre:"",depto:"",propietario:"",telefono:"",notas:"",...(item||{})});
  const deptosFilt=UNIDADES.find(u=>u.torre===f.torre)?.deptos||[];
  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>{item?"Editar":"Nueva"} Bodega</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={fg}><label style={lbl}>N° Bodega *</label><input style={inp} value={f.numero} onChange={e=>setF(p=>({...p,numero:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Torre</label>
          <select style={selSt} value={f.torre} onChange={e=>setF(p=>({...p,torre:e.target.value,depto:""}))}>
            <option value="">—</option>{UNIDADES.map(u=><option key={u.torre} value={u.torre}>{u.torre}</option>)}
          </select>
        </div>
        <div style={fg}><label style={lbl}>Unidad</label>
          <select style={selSt} value={f.depto} onChange={e=>setF(p=>({...p,depto:e.target.value}))} disabled={!f.torre}>
            <option value="">—</option>{deptosFilt.map(d=><option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={fg}><label style={lbl}>Propietario</label><input style={inp} value={f.propietario} onChange={e=>setF(p=>({...p,propietario:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Teléfono</label><input style={inp} value={f.telefono} onChange={e=>setF(p=>({...p,telefono:e.target.value}))}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Notas</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.notas} onChange={e=>setF(p=>({...p,notas:e.target.value}))}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button>
        <button style={mkBtn("primary",true)} onClick={()=>{if(!String(f.numero).trim())return;onSave(f);}}>Guardar</button>
      </div>
    </div></div>
  );
}

// ─── ESTACIONAMIENTOS ─────────────────────────────────────────────────────────
const SC={1:{bg:"#0f4c2a",light:"#d4ede3",accent:"#22c55e"},2:{bg:"#3b1d6b",light:"#ede0f5",accent:"#a855f7"},3:{bg:"#7c2d12",light:"#fde9d4",accent:"#f97316"}};
const BY_TORRE_DEPTO={};
SPOTS_DATA.forEach(s=>{BY_TORRE_DEPTO[`${s.torre}-${s.depto}`]=s;});
const TORRES_PARK=["1036","1038","1052","1054","1060","1061","1080","1081"];
const DEPTOS_ALL=["A1","B2","C3","D4","E5","E6","F5","F6","G7","H8"];
const CW=62,CH=34,GAP=7,RD=30;

// FIX #1 + #10: SectorMap usa gx/gy de datos; zona NO BLOQUEAR solo si hay spots con gx=5
function SectorMap({sectorId,records,onSpotClick,highlightId}){
  const spots=SPOTS_DATA.filter(s=>s.sector===sectorId);
  const maxGx=Math.max(...spots.map(s=>s.gx));
  const maxGy=Math.max(...spots.map(s=>s.gy));
  const W=(maxGx)*(CW+GAP)+RD*2+CW+20;
  const H=(maxGy+1)*(CH+GAP)+RD*2+20;
  const sx=gx=>RD+10+(gx-1)*(CW+GAP);
  const sy=gy=>RD+10+gy*(CH+GAP);
  const sc=SC[sectorId];
  const colXs=[...new Set(spots.map(s=>s.gx))].map(sx);
  const noBloquearSpot=sectorId===2?spots.find(s=>s.gx===5):null;
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",maxWidth:"100%"}}>
      <rect width={W} height={H} fill="#161d2e" rx="8"/>
      <rect x={0} y={0} width={W} height={RD} fill="#242d42"/>
      <rect x={0} y={H-RD} width={W} height={RD} fill="#242d42"/>
      <line x1={0} y1={RD/2} x2={W} y2={RD/2} stroke="#facc15" strokeWidth={1.2} strokeDasharray="10,7" opacity={.7}/>
      <line x1={0} y1={H-RD/2} x2={W} y2={H-RD/2} stroke="#facc15" strokeWidth={1.2} strokeDasharray="10,7" opacity={.7}/>
      {colXs.map((cx,i)=><line key={i} x1={cx-GAP/2} y1={RD} x2={cx-GAP/2} y2={H-RD} stroke="#1e2a3d" strokeWidth={GAP}/>)}
      {spots.map(s=>{
        const rec=records[s.id];const isHL=s.id===highlightId;const occ=!!rec;
        const x=sx(s.gx),y=sy(s.gy);
        const fill=isHL?"#facc15":occ?sc.bg:"#1e2d45";
        const stroke=isHL?"#fde047":occ?sc.accent:"#2d3f5e";
        return(
          <g key={s.id} style={{cursor:"pointer"}} onClick={()=>onSpotClick(s)}>
            <rect x={x+2} y={y+3} width={CW} height={CH} rx={5} fill="rgba(0,0,0,.5)"/>
            <rect x={x} y={y} width={CW} height={CH} rx={5} fill={fill} stroke={stroke} strokeWidth={isHL?2.5:occ?1.5:1}/>
            <text x={x+CW/2} y={y+CH*0.44} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight="900" fontFamily="monospace" fill={isHL?"#0f172a":occ?sc.accent:"#3b5278"}>#{s.id}</text>
            <text x={x+CW/2} y={y+CH*0.82} textAnchor="middle" dominantBaseline="middle" fontSize={7} fontFamily="monospace" fill={isHL?"#1e3a5f":occ?"rgba(255,255,255,.5)":"#2d3f5e"}>{s.torre}·{s.depto}</text>
            {occ&&rec.patentes?.[0]&&<text x={x+CW/2} y={y-5} textAnchor="middle" fontSize={6.5} fontFamily="monospace" fontWeight="700" fill={sc.accent}>{rec.patentes[0]}</text>}
            {isHL&&<rect x={x-4} y={y-4} width={CW+8} height={CH+8} rx={7} fill="none" stroke="#facc15" strokeWidth={2} opacity={.5}/>}
          </g>
        );
      })}
      {sectorId===1&&[{gx:1,label:"P.1036"},{gx:3,label:"P.1080"},{gx:6,label:"P.1038"},{gx:8,label:"P.1080"}].map(({gx,label})=>
        <text key={label} x={sx(gx)+CW/2} y={11} textAnchor="middle" fontSize={7} fill="#60a5fa" fontFamily="monospace">{label}</text>)}
      {sectorId===2&&[{gx:2,label:"P.1038"},{gx:6,label:"P.1052"}].map(({gx,label})=>
        <text key={label} x={sx(gx)+CW/2} y={11} textAnchor="middle" fontSize={7} fill="#60a5fa" fontFamily="monospace">{label}</text>)}
      {sectorId===3&&[{gx:1,label:"P.1081"},{gx:4,label:"P.1061"},{gx:6,label:"P.1052"},{gx:9,label:"P.1081"}].map(({gx,label})=>
        <text key={label} x={sx(gx)+CW/2} y={11} textAnchor="middle" fontSize={7} fill="#60a5fa" fontFamily="monospace">{label}</text>)}
      {/* FIX #10: zona NO BLOQUEAR solo si existe un spot con gx=5 en sector 2 */}
      {noBloquearSpot&&(()=>{
        const x=sx(5)+CW+3,y2=sy(0),h=(CH+GAP)*2-GAP;
        return <g><rect x={x} y={y2} width={CW-8} height={h} rx={3} fill="#7f1d1d" opacity={.4} stroke="#ef4444" strokeWidth={1} strokeDasharray="3,2"/><text x={x+(CW-8)/2} y={y2+h/2-4} textAnchor="middle" fontSize={6} fill="#ef4444" fontFamily="monospace">NO</text><text x={x+(CW-8)/2} y={y2+h/2+5} textAnchor="middle" fontSize={6} fill="#ef4444" fontFamily="monospace">BLOQUEAR</text></g>;
      })()}
    </svg>
  );
}

function SpotModal({spot,record,onClose,onSave,onDelete}){
  const sc=SC[spot.sector];
  const [patentes,setPat]=useState(record?.patentes||[""]);
  const [propietario,setProp]=useState(record?.propietario||"");
  const [telefono,setTel]=useState(record?.telefono||"");
  const [vehiculo,setVeh]=useState(record?.vehiculo||"");
  const save=()=>onSave({patentes:patentes.filter(p=>p.trim()),propietario,telefono,vehiculo,updatedAt:new Date().toISOString()});
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#0f172a",border:`1.5px solid ${sc.accent}35`,borderRadius:18,width:"100%",maxWidth:420,overflow:"hidden"}}>
        <div style={{padding:"18px 20px 14px",background:sc.bg,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:sc.accent,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>{SECTOR_NAMES[spot.sector]}</div>
            <div style={{fontSize:22,fontWeight:900,color:"white",fontFamily:"monospace"}}>Estac. #{spot.id}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:2}}>Torre {spot.torre} · {spot.depto}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",color:"white",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:16}}>✕</button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:8}}>Patentes</label>
            {patentes.map((p,i)=>(
              <div key={i} style={{display:"flex",gap:6,marginBottom:7}}>
                <input value={p} onChange={e=>setPat(pt=>pt.map((x,j)=>j===i?e.target.value.toUpperCase():x))} placeholder={`Patente ${i+1}`} maxLength={8}
                  style={{flex:1,padding:"10px 14px",borderRadius:9,fontSize:15,fontWeight:800,border:"1.5px solid #1e3a5f",background:"#1e293b",color:"white",outline:"none",fontFamily:"monospace",letterSpacing:3,textTransform:"uppercase"}}/>
                {patentes.length>1&&<button onClick={()=>setPat(pt=>pt.filter((_,j)=>j!==i))} style={{padding:"0 11px",borderRadius:9,border:"1.5px solid #7f1d1d",background:"#450a0a",color:"#f87171",cursor:"pointer",fontSize:15}}>−</button>}
              </div>
            ))}
            {patentes.length<5&&<button onClick={()=>setPat(p=>[...p,""])} style={{width:"100%",padding:"7px",borderRadius:9,border:`1.5px dashed ${sc.accent}55`,background:"rgba(255,255,255,.03)",color:sc.accent,cursor:"pointer",fontSize:12,fontWeight:600}}>+ Agregar patente</button>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5}}>Propietario</label>
            <input value={propietario} onChange={e=>setProp(e.target.value)} placeholder="Nombre completo" style={{padding:"8px 11px",borderRadius:8,fontSize:13,border:"1.5px solid #1e3a5f",background:"#1e293b",color:"white",outline:"none"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["Teléfono",telefono,setTel,"+56 9 ..."],["Vehículo",vehiculo,setVeh,"Marca/Color"]].map(([label,val,setter,ph])=>(
              <div key={label as string} style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5}}>{label as string}</label>
                <input value={val as string} onChange={e=>(setter as any)(e.target.value)} placeholder={ph as string} style={{padding:"8px 11px",borderRadius:8,fontSize:13,border:"1.5px solid #1e3a5f",background:"#1e293b",color:"white",outline:"none"}}/>
              </div>
            ))}
          </div>
        </div>
        <div style={{padding:"0 20px 20px",display:"flex",gap:8,justifyContent:"space-between"}}>
          <div>{record&&<button onClick={onDelete} style={{padding:"9px 16px",borderRadius:9,border:"1.5px solid #7f1d1d",background:"#450a0a",color:"#f87171",fontWeight:700,fontSize:12,cursor:"pointer"}}>Liberar</button>}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{padding:"9px 16px",borderRadius:9,border:"1.5px solid #1e3a5f",background:"transparent",color:"#94a3b8",fontWeight:600,fontSize:12,cursor:"pointer"}}>Cancelar</button>
            <button onClick={save} style={{padding:"9px 22px",borderRadius:9,border:"none",background:sc.accent,color:"#0f172a",fontWeight:900,fontSize:12,cursor:"pointer"}}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResidenteParkScreen({records,setRecords,onBack,showBack=true}){
  const [tab,setTab]=useState("form");
  const [toastP,setToastP]=useState(null);
  const [form,setFormP]=useState({torre:"",depto:"",tipoResidente:"",nombre:"",email:"",telefono:"",usoEstacionamiento:"",vehiculos:[{patente:"",marca:"",color:"",esVisita:"no"}]});
  const [step,setStep]=useState<number|string>(0);
  const [found,setFound]=useState(null);
  const [errors,setErrors]=useState({});
  const [emailInput,setEmailInput]=useState("");
  const [isEditing,setIsEditing]=useState(false);
  const [queryPat,setQueryPat]=useState("");
  const [queryResult,setQueryResult]=useState(null);

  const showTP=(msg,type="success")=>{setToastP({msg,type});setTimeout(()=>setToastP(null),2800);};
  const setF=(k,v)=>setFormP(p=>({...p,[k]:v}));

  const handleLookup=()=>{
    if(!form.torre||!form.depto){setErrors({lookup:"Selecciona dirección y departamento"});return;}
    const spot=BY_TORRE_DEPTO[`${form.torre}-${form.depto}`]||null;
    if(!spot){setErrors({lookup:"No se encontró asignación para esta dirección"});return;}
    setFound(spot);
    const rec=records[spot.id];
    if(rec&&rec.email){setIsEditing(true);setEmailInput("");setErrors({});setStep("verify");}
    else{setIsEditing(false);setErrors({});setStep(1);}
  };
  const handleEmailVerify=()=>{
    const rec=records[found.id];
    const stored=(rec?.email||"").trim().toLowerCase();
    const entered=emailInput.trim().toLowerCase();
    if(!entered){setErrors({emailVerify:"Ingresa tu correo"});return;}
    if(stored!==entered){setErrors({emailVerify:"El correo no coincide. Contacta a administración."});return;}
    setFormP(f=>({...f,nombre:rec.nombre||"",email:rec.email||"",telefono:rec.telefono||"",tipoResidente:rec.tipoResidente||"",usoEstacionamiento:rec.usoEstacionamiento||"",vehiculos:rec.vehiculos?.length?rec.vehiculos:[{patente:"",marca:"",color:"",esVisita:"no"}]}));
    setErrors({});setStep(1);
  };
  const validateStep=s=>{
    const e={};
    if(s===1){if(!form.nombre.trim())e["nombre"]="Requerido";if(!form.tipoResidente)e["tipoResidente"]="Selecciona una opción";}
    if(s===2){if(!form.usoEstacionamiento)e["usoEstacionamiento"]="Selecciona una opción";}
    if(s===3){form.vehiculos.forEach((v,i)=>{if(!v.patente.trim())e[`pat_${i}`]="Ingresa la patente";});}
    return e;
  };
  const next=()=>{
    const e=validateStep(step as number);
    if(Object.keys(e).length){setErrors(e);return;}
    if((step as number)<3)setStep(s=>(s as number)+1);
    else guardar();
  };
  const guardar=()=>{
    if(!found)return;
    const veh=form.vehiculos.filter(v=>v.patente.trim());
    const data={nombre:form.nombre,email:form.email,telefono:form.telefono,tipoResidente:form.tipoResidente,usoEstacionamiento:form.usoEstacionamiento,vehiculos:veh,patentes:veh.map(v=>v.patente.toUpperCase().replace(/[^A-Z0-9]/g,"")),updatedAt:new Date().toISOString()};
    setRecords(r=>({...r,[found.id]:data}));
    setStep(4);showTP("Registro guardado correctamente");
  };
  const resetForm=()=>{setFormP({torre:"",depto:"",tipoResidente:"",nombre:"",email:"",telefono:"",usoEstacionamiento:"",vehiculos:[{patente:"",marca:"",color:"",esVisita:"no"}]});setFound(null);setStep(0);setErrors({});setIsEditing(false);setEmailInput("");};
  const addVeh=()=>{if(form.vehiculos.length<5)setFormP(f=>({...f,vehiculos:[...f.vehiculos,{patente:"",marca:"",color:"",esVisita:"no"}]}));};
  const updVeh=(i,k,v)=>{setFormP(f=>({...f,vehiculos:f.vehiculos.map((x,j)=>j===i?{...x,[k]:k==="patente"?v.toUpperCase():v}:x)}));setErrors(e=>({...e,[`pat_${i}`]:""}));};
  const remVeh=i=>setFormP(f=>({...f,vehiculos:f.vehiculos.filter((_,j)=>j!==i)}));
  const buscarPatente=()=>{
    if(!queryPat.trim())return;
    const q=queryPat.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    let res=null;
    for(const s of SPOTS_DATA){const rec=records[s.id];if(rec?.patentes?.some(p=>p.toUpperCase().replace(/[^A-Z0-9]/g,"")===q)){res={spot:s,record:rec};break;}}
    setQueryResult(res||"not_found");
  };
  const sc=found?SC[found.sector]:null;
  const deptosFilt=form.torre?DEPTOS_ALL.filter(d=>BY_TORRE_DEPTO[`${form.torre}-${d}`]):[];
  const radio=(fieldKey,val,label)=>(
    <label key={val} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 14px",borderRadius:9,border:`1.5px solid ${form[fieldKey]===val?"#2563eb":"#e2e8f0"}`,background:form[fieldKey]===val?"#eff6ff":"white",cursor:"pointer",marginBottom:7}} onClick={()=>setF(fieldKey,val)}>
      <div style={{width:17,height:17,borderRadius:"50%",border:"2px solid",marginTop:1,flexShrink:0,borderColor:form[fieldKey]===val?"#2563eb":"#cbd5e1",background:form[fieldKey]===val?"#2563eb":"white",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {form[fieldKey]===val&&<div style={{width:6,height:6,borderRadius:"50%",background:"white"}}/>}
      </div>
      <span style={{fontSize:13,color:form[fieldKey]===val?"#1d4ed8":"#374151",fontWeight:form[fieldKey]===val?600:400,lineHeight:1.4}}>{label}</span>
    </label>
  );
  const STEPS=["Dirección","Identificación","Uso","Vehículos"];
  const inpStyle=(k)=>({width:"100%",padding:"10px 12px",borderRadius:9,fontSize:13,border:`1.5px solid ${errors[k]?"#e53e3e":"#e2e8f0"}`,outline:"none",fontFamily:"inherit",background:"white",boxSizing:"border-box" as const});

  return(
    <div style={{minHeight:"100vh",background:"#eef2f7",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"white",padding:"16px 20px 0",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:640,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            {showBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,.15)",border:"none",color:"white",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:16,fontWeight:600}}>←</button>}
            <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600,opacity:.7,textTransform:"uppercase",letterSpacing:1}}>Residente</div><div style={{fontSize:20,fontWeight:900,letterSpacing:-.4}}>🏠 Mi Estacionamiento</div></div>
          </div>
          <div style={{display:"flex",gap:2,background:"rgba(0,0,0,.2)",borderRadius:10,padding:3,marginBottom:0}}>
            {[["form","📝","Ingresar Datos"],["query","🔍","Consultar Patente"]].map(([k,icon,label])=>(
              <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"9px 6px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===k?"white":"transparent",color:tab===k?"#1d4ed8":"rgba(255,255,255,.7)",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                <span>{icon}</span><span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxWidth:640,margin:"0 auto",padding:"20px 16px"}}>
        {tab==="form"&&<div>
          {typeof step==="number"&&step>=1&&step<=3&&(
            <div style={{display:"flex",alignItems:"center",marginBottom:20}}>
              {STEPS.slice(1).map((s,i)=>{const idx=i+1;const done=(step as number)>idx;const active=(step as number)===idx;return(
                <div key={s} style={{display:"flex",alignItems:"center",flex:1}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}>
                    <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,background:done||active?"#2563eb":"#e2e8f0",color:done||active?"white":"#94a3b8"}}>{done?"✓":idx}</div>
                    <span style={{fontSize:9,color:active?"#1d4ed8":done?"#64748b":"#94a3b8",fontWeight:active?700:400,marginTop:3,textTransform:"uppercase",letterSpacing:.3}}>{s}</span>
                  </div>
                  {i<2&&<div style={{height:2,flex:1,background:done?"#2563eb":"#e2e8f0",marginBottom:16}}/>}
                </div>
              );})}
            </div>
          )}
          {step===0&&<div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
            <h2 style={{margin:"0 0 6px",fontSize:17,fontWeight:800}}>Dirección de tu unidad</h2>
            <p style={{margin:"0 0 20px",fontSize:13,color:"#64748b",lineHeight:1.5}}>Selecciona tu dirección para identificar tu estacionamiento asignado.</p>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:6}}>1. Dirección / Torre *</label>
                <select value={form.torre} onChange={e=>{setF("torre",e.target.value);setF("depto","");}} style={{width:"100%",padding:"11px 12px",borderRadius:9,fontSize:14,fontWeight:600,border:"1.5px solid #e2e8f0",background:"white",outline:"none",cursor:"pointer",fontFamily:"monospace"}}>
                  <option value="">— Selecciona la dirección —</option>
                  {TORRES_PARK.map(t=><option key={t} value={t}>{TORRE_DIRECCION[t]}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:6}}>2. Letra / Block *</label>
                <select value={form.depto} onChange={e=>setF("depto",e.target.value)} disabled={!form.torre} style={{width:"100%",padding:"11px 12px",borderRadius:9,fontSize:14,fontWeight:600,border:`1.5px solid ${errors["lookup"]?"#e53e3e":"#e2e8f0"}`,background:form.torre?"white":"#f8fafc",outline:"none",cursor:form.torre?"pointer":"not-allowed",fontFamily:"monospace",color:form.torre?"#0f172a":"#94a3b8"}}>
                  <option value="">— Selecciona letra/block —</option>
                  {deptosFilt.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
                {errors["lookup"]&&<span style={{fontSize:11,color:"#e53e3e",marginTop:4,display:"block"}}>{errors["lookup"]}</span>}
              </div>
            </div>
            {form.torre&&form.depto&&BY_TORRE_DEPTO[`${form.torre}-${form.depto}`]&&(()=>{
              const preview=BY_TORRE_DEPTO[`${form.torre}-${form.depto}`];const sc0=SC[preview.sector];
              return<div style={{marginTop:16,padding:"12px 16px",borderRadius:10,background:sc0.accent+"18",border:`1.5px solid ${sc0.accent}40`,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:10,background:sc0.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:900,fontSize:14,color:sc0.accent}}>#{preview.id}</div>
                <div><div style={{fontSize:11,color:sc0.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Estacionamiento asignado ✓</div><div style={{fontSize:13,color:"#0f172a",fontWeight:600}}>{SECTOR_NAMES[preview.sector]}</div></div>
              </div>;
            })()}
            <button onClick={handleLookup} style={{width:"100%",marginTop:20,padding:"13px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:15,cursor:"pointer"}}>Continuar →</button>
          </div>}

          {step==="verify"&&found&&(()=>{
            const sc0=SC[found.sector];const rec=records[found.id];
            return<div style={{background:"white",borderRadius:16,overflow:"hidden"}}>
              <div style={{background:sc0.bg,padding:"20px 24px",display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:52,height:52,borderRadius:12,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontSize:18,fontWeight:900,color:sc0.accent}}>#{found.id}</div>
                <div><div style={{fontSize:11,color:sc0.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Registro existente</div><div style={{fontSize:14,color:"white",fontWeight:700}}>{SECTOR_NAMES[found.sector]}</div><div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Torre {found.torre} · {found.depto}</div></div>
              </div>
              <div style={{padding:"22px"}}>
                <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"12px 16px",marginBottom:20}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#166534",marginBottom:3}}>Esta unidad ya tiene un registro</div>
                  <div style={{fontSize:12,color:"#15803d"}}>Registrado a nombre de <strong>{rec.nombre||"un residente"}</strong>.</div>
                </div>
                <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:8}}>Correo electrónico registrado</label>
                <input type="email" value={emailInput} onChange={e=>{setEmailInput(e.target.value);setErrors(er=>({...er,emailVerify:""}));}} onKeyDown={e=>e.key==="Enter"&&handleEmailVerify()} placeholder="correo@ejemplo.com" style={{width:"100%",padding:"12px 14px",borderRadius:10,fontSize:14,border:`1.5px solid ${errors["emailVerify"]?"#e53e3e":"#e2e8f0"}`,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"#f8fafc"}}/>
                {errors["emailVerify"]&&<div style={{marginTop:8,padding:"10px 14px",borderRadius:8,background:"#fff5f5",border:"1px solid #fecaca",fontSize:12,color:"#dc2626"}}>{errors["emailVerify"]}</div>}
                <button onClick={handleEmailVerify} style={{width:"100%",marginTop:14,padding:"13px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Verificar y Editar →</button>
                <button onClick={()=>{setStep(0);setFound(null);}} style={{width:"100%",marginTop:8,padding:"10px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:12,cursor:"pointer"}}>← Volver</button>
              </div>
            </div>;
          })()}

          {step===1&&<div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
            {sc&&<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:sc.bg,marginBottom:20}}><div style={{fontFamily:"monospace",fontWeight:900,fontSize:18,color:sc.accent}}>#{found.id}</div><div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{SECTOR_NAMES[found.sector]} · Torre {found.torre} · {found.depto}</div></div>}
            <h2 style={{margin:"0 0 16px",fontSize:16,fontWeight:800}}>Bloque 1: Identificación</h2>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:8}}>¿Usted es? *</label>
                {errors["tipoResidente"]&&<span style={{fontSize:10,color:"#e53e3e",display:"block",marginBottom:6}}>{errors["tipoResidente"]}</span>}
                {radio("tipoResidente","propietario_residente","Propietario residente")}
                {radio("tipoResidente","propietario_arriendo","Propietario no residente (arrienda)")}
                {radio("tipoResidente","arrendatario","Arrendatario / Ocupante")}
              </div>
              {[["nombre","Nombre completo *","Ej: Juan Pérez","text"],["email","Correo electrónico","correo@ejemplo.com","email"],["telefono","Teléfono","+56 9 1234 5678","tel"]].map(([k,label,ph,type])=>(
                <div key={k} style={{display:"flex",flexDirection:"column",gap:4}}>
                  <label style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5}}>{label}</label>
                  <input type={type} value={form[k]} onChange={e=>setF(k,e.target.value)} placeholder={ph} style={inpStyle(k)}/>
                  {errors[k]&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors[k]}</span>}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={()=>setStep(0)} style={{padding:"11px 20px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:13,cursor:"pointer"}}>← Atrás</button>
              <button onClick={next} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Continuar →</button>
            </div>
          </div>}

          {step===2&&<div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
            {sc&&<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:sc.bg,marginBottom:20}}><div style={{fontFamily:"monospace",fontWeight:900,fontSize:18,color:sc.accent}}>#{found.id}</div><div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{SECTOR_NAMES[found.sector]} · Torre {found.torre} · {found.depto}</div></div>}
            <h2 style={{margin:"0 0 6px",fontSize:16,fontWeight:800}}>Bloque 2: Uso del Espacio</h2>
            {errors["usoEstacionamiento"]&&<span style={{fontSize:10,color:"#e53e3e",display:"block",marginBottom:8}}>{errors["usoEstacionamiento"]}</span>}
            {radio("usoEstacionamiento","uso_exclusivo","Uso exclusivo para vehículo(s) del residente.")}
            {radio("usoEstacionamiento","visitas","Se utilizará principalmente para visitas.")}
            {radio("usoEstacionamiento","ceder","Lo prestaré / cederé a otro comunero.")}
            {radio("usoEstacionamiento","sin_uso","No tengo vehículo ni lo usaré por ahora.")}
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={()=>setStep(1)} style={{padding:"11px 20px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:13,cursor:"pointer"}}>← Atrás</button>
              <button onClick={next} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Continuar →</button>
            </div>
          </div>}

          {step===3&&<div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
            {sc&&<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:sc.bg,marginBottom:20}}><div style={{fontFamily:"monospace",fontWeight:900,fontSize:18,color:sc.accent}}>#{found.id}</div><div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{SECTOR_NAMES[found.sector]} · Torre {found.torre} · {found.depto}</div></div>}
            <h2 style={{margin:"0 0 6px",fontSize:16,fontWeight:800}}>Bloque 3: Registro de Vehículos</h2>
            <p style={{margin:"0 0 18px",fontSize:13,color:"#64748b",lineHeight:1.5}}>Al menos un vehículo es requerido.</p>
            {form.vehiculos.map((v,i)=>(
              <div key={i} style={{background:"#f8fafc",borderRadius:12,padding:16,marginBottom:12,border:"1.5px solid #e2e8f0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{fontSize:12,fontWeight:700}}>🚗 Vehículo {i+1}</span>
                  {form.vehiculos.length>1&&<button onClick={()=>remVeh(i)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:12,fontWeight:600}}>✕ Quitar</button>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:4}}>Patente *</label>
                    <input value={v.patente} onChange={e=>updVeh(i,"patente",e.target.value)} placeholder="ABCD12" maxLength={8} style={{width:"100%",padding:"10px 12px",borderRadius:8,fontSize:15,fontWeight:800,border:`1.5px solid ${errors[`pat_${i}`]?"#e53e3e":"#e2e8f0"}`,outline:"none",fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",boxSizing:"border-box"}}/>
                    {errors[`pat_${i}`]&&<span style={{fontSize:10,color:"#e53e3e"}}>{errors[`pat_${i}`]}</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[["marca","Marca","Toyota..."],["color","Color","Blanco..."]].map(([k,label,ph])=>(
                      <div key={k}><label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:4}}>{label}</label><input value={v[k]} onChange={e=>updVeh(i,k,e.target.value)} placeholder={ph} style={{width:"100%",padding:"9px 11px",borderRadius:8,fontSize:13,border:"1.5px solid #e2e8f0",outline:"none",boxSizing:"border-box"}}/></div>
                    ))}
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:6}}>¿Es de visita recurrente?</label>
                    <div style={{display:"flex",gap:8}}>
                      {[["si","Sí, es visita"],["no","No, es propio"]].map(([val,label])=>(
                        <button key={val} onClick={()=>updVeh(i,"esVisita",val)} style={{flex:1,padding:"8px 12px",borderRadius:8,border:`1.5px solid ${v.esVisita===val?"#2563eb":"#e2e8f0"}`,background:v.esVisita===val?"#eff6ff":"white",color:v.esVisita===val?"#1d4ed8":"#475569",fontWeight:v.esVisita===val?700:400,fontSize:12,cursor:"pointer"}}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {form.vehiculos.length<5&&<button onClick={addVeh} style={{width:"100%",padding:"10px",borderRadius:10,border:"1.5px dashed #2563eb",background:"#eff6ff",color:"#2563eb",cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:4}}>+ Agregar otro vehículo</button>}
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={()=>setStep(2)} style={{padding:"11px 20px",borderRadius:9,border:"1.5px solid #e2e8f0",background:"white",color:"#475569",fontWeight:600,fontSize:13,cursor:"pointer"}}>← Atrás</button>
              <button onClick={next} style={{flex:1,padding:"11px",borderRadius:9,border:"none",background:"#16a34a",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>✅ Enviar Registro</button>
            </div>
          </div>}

          {step===4&&found&&(()=>{
            const sc4=SC[found.sector];
            return<div style={{background:"white",borderRadius:16,overflow:"hidden",textAlign:"center"}}>
              <div style={{background:sc4.bg,padding:"32px 24px 24px"}}>
                <div style={{fontSize:52,marginBottom:10}}>✅</div>
                <div style={{fontSize:20,fontWeight:900,color:"white",marginBottom:4}}>{isEditing?"✏️ Registro modificado":"¡Registro enviado!"}</div>
                <div style={{fontFamily:"monospace",fontSize:28,fontWeight:900,color:sc4.accent}}>#{found.id}</div>
              </div>
              <div style={{padding:"20px 24px"}}>
                <div style={{fontSize:14,color:"#374151",marginBottom:16}}>Tu información ha sido registrada en el sistema.</div>
                <button onClick={resetForm} style={{width:"100%",padding:"12px",borderRadius:9,border:"1.5px solid #2563eb",background:"white",color:"#2563eb",fontWeight:700,fontSize:13,cursor:"pointer"}}>Registrar otra unidad</button>
              </div>
            </div>;
          })()}
        </div>}

        {tab==="query"&&<div>
          <div style={{background:"white",borderRadius:16,padding:24,marginBottom:16}}>
            <h2 style={{margin:"0 0 6px",fontSize:17,fontWeight:800}}>Consultar Patente</h2>
            <p style={{margin:"0 0 16px",fontSize:13,color:"#64748b",lineHeight:1.5}}>Ingresa la patente para verificar si está registrada.</p>
            <div style={{display:"flex",gap:10}}>
              <input value={queryPat} onChange={e=>{setQueryPat(e.target.value);setQueryResult(null);}} onKeyDown={e=>e.key==="Enter"&&buscarPatente()} placeholder="ABCD12" maxLength={8} style={{flex:1,padding:"13px 16px",borderRadius:10,fontSize:18,fontWeight:900,border:"2px solid #e2e8f0",background:"white",color:"#0f172a",outline:"none",fontFamily:"monospace",textTransform:"uppercase",letterSpacing:3}}/>
              <button onClick={buscarPatente} style={{padding:"13px 20px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Buscar</button>
            </div>
          </div>
          {queryResult==="not_found"&&<div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:16,padding:28,textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:10}}>🔍</div>
            <div style={{fontSize:16,fontWeight:700,color:"#92400e",marginBottom:6}}>Patente no encontrada</div>
            <div style={{fontFamily:"monospace",fontSize:18,fontWeight:900,letterSpacing:3,color:"#b45309",marginBottom:10}}>{queryPat.toUpperCase()}</div>
            <div style={{fontSize:12,color:"#b45309"}}>No está registrada. Ve a <strong>Ingresar Datos</strong> para registrarla.</div>
          </div>}
          {queryResult&&queryResult!=="not_found"&&(()=>{
            const {spot,record}=queryResult;const sc5=SC[spot.sector];
            return<div style={{background:sc5.bg,borderRadius:16,overflow:"hidden"}}>
              <div style={{padding:"18px 22px",background:"rgba(255,255,255,.08)",borderBottom:"1px solid rgba(255,255,255,.1)",display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:40}}>✅</div>
                <div><div style={{fontSize:11,color:sc5.accent,fontWeight:700,marginBottom:2}}>Patente registrada</div><div style={{fontSize:24,fontWeight:900,fontFamily:"monospace",letterSpacing:3,color:"white"}}>{queryPat.toUpperCase()}</div></div>
              </div>
              <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:12}}>
                {[["🅿","Estacionamiento",`#${spot.id}`,true],["📍","Sector",SECTOR_NAMES[spot.sector],false],["🏢","Torre",spot.torre,false],["🏠","Departamento",spot.depto,false],...(record.nombre?[["👤","Residente",record.nombre,false]]:[])].map(([icon,label,value,mono])=>(
                  <div key={label as string} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,.07)",paddingBottom:10}}>
                    <span style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>{icon as string} {label as string}</span>
                    <span style={{fontSize:14,fontWeight:700,color:"white",fontFamily:mono?"monospace":"inherit"}}>{value as string||"—"}</span>
                  </div>
                ))}
              </div>
            </div>;
          })()}
        </div>}
      </div>
      {toastP&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:toastP.type==="error"?"#7f1d1d":toastP.type==="info"?"#1e3a5f":"#064e3b",color:"white",padding:"12px 22px",borderRadius:12,fontSize:13,fontWeight:700,zIndex:1500,whiteSpace:"nowrap"}}>{toastP.type==="error"?"❌":"✅"} {toastP.msg}</div>}
    </div>
  );
}

function StaffParkScreen({records,setRecords,onBack,showToast}){
  const [tab,setTab]=useState("verify");
  const [query,setQuery]=useState(""); const [result,setResult]=useState(null);
  const [selSpot,setSelSpot]=useState(null);
  const [toastS,setToastS]=useState(null);
  const [searchList,setSearchList]=useState("");
  const [filterSector,setFilterSector]=useState("all");
  const [sortBy,setSortBy]=useState("id");
  const [confirmDel,setConfirmDel]=useState(null);

  const showTS=(msg,type="success")=>{setToastS({msg,type});setTimeout(()=>setToastS(null),2600);};
  const totalOcc=Object.keys(records).length; const total=SPOTS_DATA.length;

  const verify=()=>{
    if(!query.trim())return;
    const q=query.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    let found=null;
    for(const s of SPOTS_DATA){const rec=records[s.id];if(rec?.patentes?.some(p=>p.toUpperCase().replace(/[^A-Z0-9]/g,"")===q)){found={spot:s,record:rec};break;}}
    setResult(found||"not_found");
  };
  const delRecord=spot=>{
    setRecords(r=>{const n={...r};delete n[spot.id];return n;});
    setConfirmDel(null);showTS(`Estacionamiento #${spot.id} liberado`,"info");
  };
  const listedSpots=SPOTS_DATA.filter(s=>{
    if(!records[s.id])return false;
    if(filterSector!=="all"&&s.sector!==Number(filterSector))return false;
    if(searchList){const q=searchList.toLowerCase();const rec=records[s.id];return String(s.id).includes(q)||s.torre.includes(q)||s.depto.toLowerCase().includes(q)||rec.patentes?.some(p=>p.toLowerCase().includes(q))||(rec.propietario||"").toLowerCase().includes(q);}
    return true;
  }).sort((a,b)=>{if(sortBy==="id")return a.id-b.id;if(sortBy==="torre")return a.torre.localeCompare(b.torre)||a.depto.localeCompare(b.depto);if(sortBy==="sector")return a.sector-b.sector;if(sortBy==="depto")return a.depto.localeCompare(b.depto);return 0;});
  const scRes=result&&result!=="not_found"?SC[result.spot.sector]:null;

  return(
    <div style={{minHeight:"100vh",background:"#0a0f1e",fontFamily:"system-ui,sans-serif",color:"white"}}>
      <div style={{background:"#111827",borderBottom:"1px solid #1f2937",padding:"14px 20px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:760,margin:"0 auto",display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"#0a0f1e",border:"none",color:"#64748b",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:16}}>←</button>
          <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600,color:"#374151",textTransform:"uppercase",letterSpacing:1}}>Acceso Personal</div><div style={{fontSize:18,fontWeight:800}}>🔑 Panel de Control</div></div>
          <div style={{display:"flex",gap:14,textAlign:"right"}}>
            <div><div style={{fontSize:17,fontWeight:900,color:"#22c55e",fontFamily:"monospace"}}>{total-totalOcc}</div><div style={{fontSize:9,color:"#374151"}}>LIBRES</div></div>
            <div><div style={{fontSize:17,fontWeight:900,color:"#f59e0b",fontFamily:"monospace"}}>{totalOcc}</div><div style={{fontSize:9,color:"#374151"}}>OCUP.</div></div>
            <div><div style={{fontSize:17,fontWeight:900,color:"#60a5fa",fontFamily:"monospace"}}>{total}</div><div style={{fontSize:9,color:"#374151"}}>TOTAL</div></div>
          </div>
        </div>
        <div style={{maxWidth:760,margin:"10px auto 0",display:"flex",gap:2,background:"#0a0f1e",borderRadius:10,padding:3}}>
          {[["verify","🔍","Verificar"],["list","📋","Listado"],["map","🗺️","Plano"]].map(([k,icon,label])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===k?"#2563eb":"transparent",color:tab===k?"white":"#4b5563",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{maxWidth:760,margin:"0 auto",padding:"16px"}}>
        {tab==="verify"&&<div>
          <div style={{background:"#111827",borderRadius:16,padding:22,marginBottom:18,border:"1px solid #1f2937"}}>
            <div style={{display:"flex",gap:10}}>
              <input value={query} onChange={e=>{setQuery(e.target.value);setResult(null);}} onKeyDown={e=>e.key==="Enter"&&verify()} placeholder="ABCD12" maxLength={8} style={{flex:1,padding:"14px 16px",borderRadius:10,fontSize:20,fontWeight:900,border:"2px solid #1f2937",background:"#0a0f1e",color:"white",outline:"none",fontFamily:"monospace",textTransform:"uppercase",letterSpacing:4}}/>
              <button onClick={verify} style={{padding:"14px 24px",borderRadius:10,border:"none",background:"#2563eb",color:"white",fontWeight:800,fontSize:14,cursor:"pointer"}}>Verificar</button>
            </div>
          </div>
          {result==="not_found"&&<div style={{background:"#450a0a",border:"1.5px solid #7f1d1d",borderRadius:16,padding:28,textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:10}}>❌</div>
            <div style={{fontSize:17,fontWeight:800,color:"#fca5a5",marginBottom:8}}>Patente no registrada</div>
            <div style={{fontFamily:"monospace",fontSize:20,fontWeight:900,letterSpacing:4,color:"#f87171",marginBottom:12}}>{query.toUpperCase()}</div>
            <div style={{background:"rgba(239,68,68,.1)",borderRadius:10,padding:"10px 16px",fontSize:12,color:"#fca5a5",marginBottom:18}}>⚠️ Vehículo sin asignación. Derivar a administración.</div>
            <button onClick={()=>{setQuery("");setResult(null);}} style={{padding:"9px 24px",borderRadius:8,border:"1.5px solid #7f1d1d",background:"transparent",color:"#f87171",cursor:"pointer",fontWeight:700}}>Nueva búsqueda</button>
          </div>}
          {result&&result!=="not_found"&&scRes&&<div style={{background:scRes.bg,borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"18px 22px",background:"rgba(255,255,255,.07)",borderBottom:"1px solid rgba(255,255,255,.09)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:38}}>✅</div>
                <div><div style={{fontSize:11,color:scRes.accent,fontWeight:700,marginBottom:2}}>Patente verificada</div><div style={{fontSize:24,fontWeight:900,fontFamily:"monospace",letterSpacing:4,color:"white"}}>{query.toUpperCase()}</div></div>
              </div>
              <button onClick={()=>setSelSpot(result.spot)} style={{padding:"8px 14px",borderRadius:8,border:`1.5px solid ${scRes.accent}60`,background:"rgba(255,255,255,.08)",color:scRes.accent,fontWeight:700,fontSize:12,cursor:"pointer"}}>✏️ Editar</button>
            </div>
            <div style={{padding:"18px 22px",display:"flex",flexDirection:"column",gap:12}}>
              {[["🅿","Estacionamiento",`#${result.spot.id}`,true],["📍","Sector",SECTOR_NAMES[result.spot.sector],false],["🏢","Torre",result.spot.torre,false],["🏠","Departamento",result.spot.depto,false],...(result.record.propietario?[["👤","Propietario",result.record.propietario,false]]:[])].map(([icon,label,value,mono])=>(
                <div key={label as string} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid rgba(255,255,255,.07)",paddingBottom:10}}>
                  <span style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>{icon as string} {label as string}</span>
                  <span style={{fontSize:14,fontWeight:700,color:"white",fontFamily:mono?"monospace":"inherit"}}>{value as string||"—"}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"0 22px 18px",display:"flex",gap:8}}>
              <button onClick={()=>setConfirmDel(result.spot)} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid #7f1d1d",background:"rgba(239,68,68,.1)",color:"#f87171",fontWeight:700,fontSize:13,cursor:"pointer"}}>🗑 Eliminar</button>
              <button onClick={()=>{setQuery("");setResult(null);}} style={{flex:1,padding:"10px",borderRadius:9,border:"2px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.06)",color:"white",fontWeight:700,fontSize:13,cursor:"pointer"}}>Nueva búsqueda</button>
            </div>
          </div>}
        </div>}
        {tab==="list"&&<div>
          <div style={{background:"#111827",borderRadius:13,padding:12,marginBottom:12,border:"1px solid #1f2937",display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={searchList} onChange={e=>setSearchList(e.target.value)} placeholder="Buscar patente, torre, depto..." style={{flex:1,minWidth:150,padding:"8px 12px",borderRadius:8,fontSize:12,border:"1.5px solid #1f2937",background:"#0a0f1e",color:"white",outline:"none"}}/>
            <select value={filterSector} onChange={e=>setFilterSector(e.target.value)} style={{padding:"8px 10px",borderRadius:8,fontSize:12,border:"1.5px solid #1f2937",background:"#0a0f1e",color:"white",cursor:"pointer"}}>
              <option value="all">Todos los sectores</option>
              {[1,2,3].map(s=><option key={s} value={s}>{SECTOR_NAMES[s]}</option>)}
            </select>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:"8px 10px",borderRadius:8,fontSize:12,border:"1.5px solid #1f2937",background:"#0a0f1e",color:"white",cursor:"pointer"}}>
              <option value="id">N° Estac.</option><option value="torre">Torre</option><option value="depto">Depto</option><option value="sector">Sector</option>
            </select>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {Object.entries(SC).map(([sid,sc2])=>{const ss=SPOTS_DATA.filter(s=>s.sector===Number(sid));const occ=ss.filter(s=>records[s.id]).length;return(
              <div key={sid} style={{flex:1,background:"#111827",borderRadius:10,padding:"9px 11px",border:`1px solid ${sc2.accent}28`,borderLeft:`3px solid ${sc2.accent}`}}>
                <div style={{fontSize:8,color:sc2.accent,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:2}}>Sector {sid}</div>
                <div style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:"white"}}>{occ}<span style={{fontSize:10,color:"#374151"}}>/{ss.length}</span></div>
                <div style={{height:3,background:"#0a0f1e",borderRadius:2,marginTop:4}}><div style={{height:"100%",width:`${occ/ss.length*100}%`,background:sc2.accent,borderRadius:2}}/></div>
              </div>
            );})}
          </div>
          <div style={{background:"#111827",borderRadius:14,overflow:"hidden",border:"1px solid #1f2937"}}>
            <div style={{display:"grid",gridTemplateColumns:"50px 62px 60px 1fr 68px 84px",padding:"8px 14px",background:"#0a0f1e",borderBottom:"1px solid #1f2937",fontSize:10,fontWeight:700,color:"#374151",textTransform:"uppercase",letterSpacing:.5}}>
              <span>Estac.</span><span>Torre</span><span>Depto</span><span>Patente(s)</span><span>Sector</span><span>Acciones</span>
            </div>
            {listedSpots.length===0&&<div style={{padding:32,textAlign:"center",color:"#374151",fontSize:13}}>{totalOcc===0?"No hay registros aún.":"Sin resultados."}</div>}
            {listedSpots.map((s,i)=>{const rec=records[s.id];const sc2=SC[s.sector];return(
              <div key={s.id} style={{display:"grid",gridTemplateColumns:"50px 62px 60px 1fr 68px 84px",padding:"10px 14px",borderBottom:i<listedSpots.length-1?"1px solid #0f172a":"none",alignItems:"center",fontSize:12}}>
                <div style={{width:34,height:34,borderRadius:8,background:sc2.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:900,fontSize:11,color:sc2.accent}}>#{s.id}</div>
                <span style={{color:"#94a3b8",fontFamily:"monospace",fontSize:11}}>{s.torre}</span>
                <span style={{color:"#94a3b8",fontFamily:"monospace",fontWeight:700}}>{s.depto}</span>
                <div>{rec.patentes?.map((p,pi)=><span key={pi} style={{display:"inline-block",marginRight:4,marginBottom:2,padding:"2px 6px",borderRadius:5,background:sc2.bg,color:sc2.accent,fontFamily:"monospace",fontSize:11,fontWeight:700}}>{p}</span>)}{rec.propietario&&<div style={{fontSize:10,color:"#374151",marginTop:2}}>{rec.propietario}</div>}</div>
                <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:6,height:6,borderRadius:1,background:sc2.accent}}/><span style={{fontSize:10,color:"#374151"}}>S{s.sector}</span></div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>setSelSpot(s)} style={{padding:"5px 8px",borderRadius:6,border:"1.5px solid #1e3a5f",background:"rgba(37,99,235,.12)",color:"#60a5fa",cursor:"pointer",fontSize:13}}>✏️</button>
                  <button onClick={()=>setConfirmDel(s)} style={{padding:"5px 8px",borderRadius:6,border:"1.5px solid #7f1d1d",background:"rgba(239,68,68,.1)",color:"#f87171",cursor:"pointer",fontSize:13}}>🗑</button>
                </div>
              </div>
            );})}
            {listedSpots.length>0&&<div style={{padding:"9px 14px",borderTop:"1px solid #1f2937",fontSize:11,color:"#374151",display:"flex",justifyContent:"space-between"}}><span>{listedSpots.length} de {totalOcc} registros</span><span>{total-totalOcc} espacios libres</span></div>}
          </div>
        </div>}
        {tab==="map"&&<div>
          <div style={{background:"#111827",borderRadius:16,overflow:"hidden",marginBottom:14,border:"1px solid #1f2937"}}>
            <div style={{padding:"12px 16px",background:"#1e293b",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #0f172a"}}>
              <div><div style={{fontSize:13,fontWeight:800,color:"white"}}>🛰 Mapa Satelital</div><div style={{fontSize:11,color:"#64748b",marginTop:1}}>12 Norte, Viña del Mar</div></div>
              <a href="https://maps.google.com/?q=12+Norte+1052,+Viña+del+Mar,+Chile" target="_blank" rel="noopener noreferrer" style={{padding:"6px 12px",borderRadius:8,background:"#2563eb",color:"white",textDecoration:"none",fontSize:11,fontWeight:700}}>🗺 Abrir en Maps</a>
            </div>
            <div style={{position:"relative",width:"100%",height:320}}>
              <iframe title="Mapa" width="100%" height="320" style={{border:"none",display:"block"}} loading="lazy" allowFullScreen src="https://maps.google.com/maps?q=-33.01226,-71.544733&z=19&t=k&output=embed&iwloc=near"/>
              <div style={{position:"absolute",bottom:10,left:10,background:"rgba(15,23,42,.88)",borderRadius:10,padding:"8px 12px",border:"1px solid rgba(255,255,255,.1)"}}>
                {[{color:"#22c55e",label:"3 Oriente",n:26},{color:"#a855f7",label:"Patio Central",n:12},{color:"#f97316",label:"4 Oriente",n:26}].map(({color,label,n})=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}><div style={{width:10,height:10,borderRadius:2,background:color,flexShrink:0}}/><span style={{fontSize:10,color:"white",fontWeight:600}}>{label}</span><span style={{fontSize:9,color:"#64748b",marginLeft:"auto",paddingLeft:8}}>{n} esp.</span></div>
                ))}
              </div>
            </div>
          </div>
          {[1,2,3].map(sid=>{
            const sc2=SC[sid];const sSpots=SPOTS_DATA.filter(s=>s.sector===sid);const occ=sSpots.filter(s=>records[s.id]).length;
            const COORDS={1:{lat:-33.01215,lng:-71.54480,puertas:"1036, 1038, 1060, 1080"},2:{lat:-33.01226,lng:-71.54473,puertas:"1036, 1038, 1052"},3:{lat:-33.01240,lng:-71.54463,puertas:"1052, 1054, 1061, 1081"}};
            const coords=COORDS[sid];
            return(
              <div key={sid} style={{background:"#111827",borderRadius:16,overflow:"hidden",marginBottom:14,border:`1px solid ${sc2.accent}25`}}>
                <div style={{padding:"12px 16px",background:sc2.bg,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><div style={{fontWeight:800,fontSize:13,color:sc2.accent}}>📍 {SECTOR_NAMES[sid]}</div><div style={{fontSize:10,color:"rgba(255,255,255,.45)",marginTop:2}}>Puertas: {coords.puertas}</div></div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:sc2.accent}}>{occ}<span style={{fontSize:10,color:"rgba(255,255,255,.3)"}}>/{sSpots.length}</span></div></div>
                    <a href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`} target="_blank" rel="noopener noreferrer" style={{padding:"5px 10px",borderRadius:7,background:"rgba(255,255,255,.15)",color:"white",textDecoration:"none",fontSize:10,fontWeight:700,border:"1px solid rgba(255,255,255,.2)",whiteSpace:"nowrap"}}>📍 Ver en Maps</a>
                  </div>
                </div>
                <div style={{background:"#0f172a",padding:10}}>
                  <SectorMap sectorId={sid} records={records} onSpotClick={s=>setSelSpot(s)} highlightId={null}/>
                </div>
                <div style={{padding:"6px 14px 10px",display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:sc2.accent}}/><span style={{fontSize:10,color:"#64748b"}}>Ocupado</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#1e2d45"}}/><span style={{fontSize:10,color:"#64748b"}}>Libre</span></div>
                  <span style={{fontSize:10,color:"#374151",marginLeft:"auto"}}>Toca un espacio para editar</span>
                </div>
              </div>
            );
          })}
        </div>}
      </div>
      {selSpot&&<SpotModal spot={selSpot} record={records[selSpot.id]} onClose={()=>setSelSpot(null)}
        onSave={data=>{setRecords(r=>({...r,[selSpot.id]:data}));setSelSpot(null);showTS(`Estacionamiento #${selSpot.id} actualizado`);}}
        onDelete={()=>{setRecords(r=>{const n={...r};delete n[selSpot.id];return n;});setSelSpot(null);showTS(`#${selSpot.id} liberado`,"info");}}/>}
      {confirmDel&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1100,padding:20}}>
        <div style={{background:"#1e293b",borderRadius:16,padding:28,maxWidth:320,width:"100%",border:"1.5px solid #334155",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:14}}>⚠️</div>
          <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:8}}>¿Confirmar eliminación?</div>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:22}}>Estacionamiento #{confirmDel.id} — Torre {confirmDel.torre} · {confirmDel.depto}</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmDel(null)} style={{flex:1,padding:"10px",borderRadius:9,border:"1.5px solid #334155",background:"transparent",color:"#94a3b8",fontWeight:700,fontSize:13,cursor:"pointer"}}>Cancelar</button>
            <button onClick={()=>delRecord(confirmDel)} style={{flex:1,padding:"10px",borderRadius:9,border:"none",background:"#dc2626",color:"white",fontWeight:800,fontSize:13,cursor:"pointer"}}>Eliminar</button>
          </div>
        </div>
      </div>}
      {toastS&&<div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:toastS.type==="info"?"#1e3a5f":"#064e3b",color:"white",padding:"12px 22px",borderRadius:12,fontSize:13,fontWeight:700,zIndex:1500,whiteSpace:"nowrap"}}>{toastS.type==="info"?"🔓":"✅"} {toastS.msg}</div>}
    </div>
  );
}

// FIX #2: botón Panel de Control visible para staff + FIX #3: sin localStorage
function EstacionamientosView({mob,showToast,role}){
  const [parkRecords,setParkRecords]=useState({});
  const isResidente=role==="Residente";
  const [subView,setSubView]=useState(isResidente?"resident":"home");
  const total=SPOTS_DATA.length; const totalOcc=Object.keys(parkRecords).length;

  if(subView==="resident") return <ResidenteParkScreen records={parkRecords} setRecords={setParkRecords} onBack={()=>setSubView("home")} showBack={!isResidente}/>;
  if(subView==="staff") return <StaffParkScreen records={parkRecords} setRecords={setParkRecords} onBack={()=>setSubView("home")} showToast={showToast}/>;

  return(
    <div>
      <div style={{...card,background:"linear-gradient(135deg,#0f172a,#1e3a5f)",border:"none",padding:24,marginBottom:16,borderRadius:16}}>
        <div style={{color:"#fff",fontWeight:700,fontSize:20,marginBottom:4}}>🅿 Estacionamientos</div>
        <div style={{color:"#94a3b8",fontSize:13}}>Comunidad 12 Norte · {total} espacios</div>
        <div style={{display:"flex",gap:20,marginTop:12}}>
          <div><div style={{fontSize:20,fontWeight:900,color:"#22c55e",fontFamily:"monospace"}}>{total-totalOcc}</div><div style={{fontSize:10,color:"#64748b"}}>LIBRES</div></div>
          <div><div style={{fontSize:20,fontWeight:900,color:"#f59e0b",fontFamily:"monospace"}}>{totalOcc}</div><div style={{fontSize:10,color:"#64748b"}}>OCUPADOS</div></div>
          <div><div style={{fontSize:20,fontWeight:900,color:"#60a5fa",fontFamily:"monospace"}}>{total}</div><div style={{fontSize:10,color:"#64748b"}}>TOTAL</div></div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <button onClick={()=>setSubView("resident")} style={{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:40}}>🏠</div>
          <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Registrar mi patente</div><div style={{color:"#bfdbfe",fontSize:12,marginTop:2}}>Consulta y registra tu estacionamiento</div></div>
          <div style={{marginLeft:"auto",color:"#bfdbfe",fontSize:20}}>→</div>
        </button>
        {!isResidente&&(
          <button onClick={()=>setSubView("staff")} style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",border:"1px solid #334155",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16}}>
            <div style={{fontSize:40}}>🔑</div>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Panel de Control</div><div style={{color:"#64748b",fontSize:12,marginTop:2}}>Verificar, listar y administrar espacios</div></div>
            <div style={{marginLeft:"auto",color:"#64748b",fontSize:20}}>→</div>
          </button>
        )}
      </div>
      <div style={{...card,marginTop:16,padding:16}}>
        <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Sectores</div>
        {Object.entries(SC).map(([sid,sc2])=>{const ss=SPOTS_DATA.filter(s=>s.sector===Number(sid));const occ=ss.filter(s=>parkRecords[s.id]).length;return(
          <div key={sid} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:10,height:10,borderRadius:2,background:sc2.accent,flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{SECTOR_NAMES[sid]}</div><div style={{height:4,background:"#f1f5f9",borderRadius:99,marginTop:4}}><div style={{height:4,background:sc2.accent,borderRadius:99,width:`${occ/ss.length*100}%`}}/></div></div>
            <div style={{fontSize:11,color:"#64748b"}}>{occ}/{ss.length}</div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ─── INCIDENTES — FIX #5: filtro robusto con sessionReqIds para guests ────────
function IncidentesView({reqs,role,onOpen,setReqs,showToast,addEmail,mob,towers,resps,session,sessionReqIds=[]}){
  const [fi,setFi]=useState({status:"",priority:"",category:"",q:""});
  const [sort,setSort]=useState("date");
  const isGuest=session?.id==="guest-residente";
  const baseReqs=role==="Residente"
    ?(isGuest?reqs.filter(r=>sessionReqIds.includes(r.id)):reqs.filter(r=>session?.email&&r.requesterEmail===session.email))
    :reqs;
  const visible=baseReqs.filter(r=>{
    if(fi.status&&r.status!==fi.status)return false;
    if(fi.priority&&r.priority!==fi.priority)return false;
    if(fi.category&&r.category!==fi.category)return false;
    if(fi.q&&!(r.code+" "+r.requesterName+" "+r.category).toLowerCase().includes(fi.q.toLowerCase()))return false;
    return true;
  }).sort((a,b)=>sort==="priority"?PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority):new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());

  const quickSt=(r,ns)=>{
    if(!can(role,"changeStatus")){showToast("Sin permisos","error");return;}
    const updated={...r,status:ns,history:[...(r.history||[]),{date:new Date().toISOString(),user:role,action:"Estado cambiado",from:r.status,to:ns}]};
    setReqs(p=>p.map(x=>x.id===r.id?updated:x));
    addEmail({requestId:r.id,date:new Date().toISOString(),to:r.requesterEmail,subject:r.code+" Estado: "+ns,type:"Cambio de estado",status:"Enviado",body:"Cambio a: "+ns});
    showToast("Estado actualizado");
  };

  return(
    <div>
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <input style={{...inp,flex:2,minWidth:100}} placeholder="Buscar..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/>
          <select style={{...selSt,flex:1}} value={fi.status} onChange={e=>setFi(p=>({...p,status:e.target.value}))}><option value="">...Estado</option>{STATUSES.map(o=><option key={o}>{o}</option>)}</select>
          <select style={{...selSt,flex:1}} value={fi.priority} onChange={e=>setFi(p=>({...p,priority:e.target.value}))}><option value="">...Prioridad</option>{PRIORITIES.map(o=><option key={o}>{o}</option>)}</select>
          <select style={{...selSt,flex:1}} value={fi.category} onChange={e=>setFi(p=>({...p,category:e.target.value}))}><option value="">...Categoría</option>{Object.keys(DEF_CATS).map(o=><option key={o}>{o}</option>)}</select>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#64748b"}}>Ordenar:</span>
          {[["date","Fecha"],["priority","Prioridad"]].map(([v,l])=><button key={v} style={mkBtn(sort===v?"primary":"secondary",true)} onClick={()=>setSort(v)}>{l}</button>)}
          <span style={{marginLeft:"auto",fontSize:11,color:"#64748b"}}>{visible.length} incidentes</span>
        </div>
      </div>
      {visible.length===0?<Empty msg="Sin incidentes"/>:mob?(
        <div>{visible.map(r=>(
          <div key={r.id} style={{...card,padding:12,marginBottom:8,cursor:"pointer",borderLeft:"4px solid "+(PRIORITY_COLOR[r.priority]||"#e2e8f0"),background:r.priority==="Emergencia"?"#fef2f2":""}} onClick={()=>onOpen(r)}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <div style={{minWidth:0}}><span style={{fontWeight:700,color:"#3b82f6",fontSize:13}}>{r.code}</span><div style={{fontSize:12}}>{r.requesterName}</div><div style={{fontSize:11,color:"#64748b"}}>{r.category}</div></div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}><PBadge p={r.priority}/><SBadge s={r.status}/></div>
            </div>
          </div>
        ))}</div>
      ):(
        <div style={card}><table style={tbl}>
          <thead><tr>{["","ID","Solicitante","Categoría","Torre","Prioridad","Estado","Fecha","Acciones"].map(h=><th key={h} style={thSt}>{h}</th>)}</tr></thead>
          <tbody>{visible.map(r=>(
            <tr key={r.id} style={{background:r.priority==="Emergencia"?"#fef2f2":"",cursor:"pointer"}} onClick={()=>onOpen(r)}>
              <td style={tdSt}>{r.priority==="Emergencia"?"⚠":""}</td>
              <td style={tdSt}><span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span></td>
              <td style={tdSt}>{r.requesterName}</td><td style={tdSt}>{r.category}</td>
              <td style={tdSt}>{r.tower}/{r.unit}</td>
              <td style={tdSt}><PBadge p={r.priority}/></td>
              <td style={tdSt}><SBadge s={r.status}/></td>
              <td style={tdSt}><span style={{fontSize:11,color:"#64748b"}}>{fmtD(r.createdAt)}</span></td>
              <td style={tdSt} onClick={e=>e.stopPropagation()}>
                {can(role,"changeStatus")&&r.status!=="Cerrada"&&r.status!=="Rechazada"&&(
                  <select style={{...selSt,width:120,fontSize:11,padding:"4px 6px"}} value={r.status} onChange={e=>quickSt(r,e.target.value)}>
                    {STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

// ─── NUEVO INCIDENTE — FIX #6: validación de categoría + FIX #5: callback onReqCreated ─
function NewIncModal({role,reqs,setReqs,addEmail,showToast,onClose,onOpen,cats,towers,session,onReqCreated}){
  const actCats=(cats||[]).filter(c=>c.active);
  const actTowers=(towers||[]).filter(t=>t.active);
  const initCat=actCats[0]||{name:"",subs:[]};
  const initTower=actTowers[0]||{name:""};
  const isAdmin=role==="Administrador"||role==="Administrador Edificio";
  const [tipoR,setTipoR]=useState(isAdmin?"Administrativo":"Incidencia");
  const adminCatList=Object.keys(ADMIN_CATS);
  const [adminCat,setAdminCat]=useState(adminCatList[0]);
  const [adminSub,setAdminSub]=useState((ADMIN_CATS[adminCatList[0]]||[])[0]||"");
  const [f,setF]=useState({requesterName:session?.nombre||"",requesterEmail:session?.email||"",requesterPhone:"",tower:initTower.name,unit:"",category:initCat.name,subcategory:(initCat.subs||[])[0]||"",description:"",priority:"Media",accessPermission:false,preferredTimeSlot:"Manana",confirm:false});
  const [errs,setErrs]=useState({}); const [prevs,setPrevs]=useState([]); const [done,setDone]=useState(null);
  const fileRef=useRef();
  const setFld=(k,v)=>setF(p=>({...p,[k]:v}));

  const validate=()=>{
    const e={};
    if(tipoR==="Incidencia"){
      if(!f.requesterName)e["requesterName"]="Requerido";
      if(!f.requesterEmail||!/\S+@\S+\.\S+/.test(f.requesterEmail))e["requesterEmail"]="Email inválido";
      if(!f.unit)e["unit"]="Requerido";
      if(!f.category)e["category"]="Selecciona una categoría"; // FIX #6
    }
    if(!f.description||f.description.length<10)e["description"]="Min. 10 caracteres";
    if(!f.confirm)e["confirm"]="Debe confirmar";
    setErrs(e);return !Object.keys(e).length;
  };
  const handleFiles=e=>Array.from(e.target.files).forEach((fi:any)=>{const r=new FileReader();r.onload=ev=>setPrevs(p=>[...p,{name:fi.name,url:ev.target.result}]);r.readAsDataURL(fi);});
  const submit=()=>{
    if(!validate())return;
    const code=genCode(reqs,"INC-");const now=new Date().toISOString();
    const nr=normalizeReq({id:code,code,createdAt:now,...f,
      category:tipoR==="Administrativo"?adminCat:f.category,
      subcategory:tipoR==="Administrativo"?adminSub:f.subcategory,
      status:"Ingresada",assignedTo:"Sin asignar",
      history:[{date:now,user:f.requesterName||role,action:"Incidente creado",from:null,to:"Ingresada"}],
      isUrgent:f.priority==="Emergencia"});
    setReqs(p=>[nr,...p]);
    if(onReqCreated)onReqCreated(code); // FIX #5: registrar ID en sesión
    addEmail({requestId:code,date:now,to:f.requesterEmail,subject:"[12 Norte] Incidente "+code+" recibido",type:"Creacion",status:"Enviado",body:`Estimado/a ${f.requesterName},\n\nIncidente registrado.\n\nCódigo: ${code}\nCategoría: ${f.category}\nPrioridad: ${f.priority}\nDescripción: ${f.description}\n\nComunidad 12 Norte`});
    setDone(nr);showToast("Incidente "+code+" creado");
  };
  const curCat=actCats.find(c=>c.name===f.category);

  if(done)return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,padding:"24px",marginTop:16,textAlign:"center"}}>
      <h3 style={{margin:"0 0 6px"}}>✅ Incidente registrado</h3>
      <div style={{fontSize:20,fontWeight:700,color:"#3b82f6",marginBottom:14}}>{done.code}</div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        <button style={mkBtn("primary",true)} onClick={()=>{onClose();onOpen(done);}}>Ver detalle</button>
        <button style={mkBtn("secondary",true)} onClick={onClose}>Cerrar</button>
      </div>
    </div></div>
  );

  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:640,padding:"20px",marginTop:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0}}>Nuevo Incidente</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      {isAdmin&&(
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          {["Administrativo","Incidencia"].map(t=>(
            <button key={t} onClick={()=>setTipoR(t)} style={{flex:1,padding:"12px",borderRadius:10,border:"2px solid "+(tipoR===t?(t==="Administrativo"?"#6366f1":"#ef4444"):"#e2e8f0"),background:tipoR===t?(t==="Administrativo"?"#eef2ff":"#fef2f2"):"#f9fafb",color:tipoR===t?(t==="Administrativo"?"#6366f1":"#ef4444"):"#6b7280",fontWeight:tipoR===t?700:400,cursor:"pointer",fontSize:13}}>
              {t==="Administrativo"?"📋 Administrativo":"🚨 Incidencia"}
            </button>
          ))}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {tipoR==="Incidencia"&&<>
          {[["requesterName","Nombre *","text"],["requesterEmail","Correo *","email"],["requesterPhone","Teléfono","text"]].map(([k,l,t])=>(
            <div key={k} style={fg}><label style={lbl}>{l}</label>
              <input type={t} style={{...inp,borderColor:errs[k]?"#ef4444":""}} value={f[k]} onChange={e=>setFld(k,e.target.value)}/>
              {errs[k]&&<div style={{color:"#ef4444",fontSize:10}}>{errs[k]}</div>}
            </div>
          ))}
          <div style={fg}><label style={lbl}>Torre</label>
            <select style={selSt} value={f.tower} onChange={e=>setFld("tower",e.target.value)}>
              {actTowers.map(t=><option key={t.id} value={t.name}>{t.label}</option>)}
            </select>
          </div>
          <div style={fg}><label style={lbl}>Unidad *</label>
            <input style={{...inp,borderColor:errs["unit"]?"#ef4444":""}} value={f.unit} onChange={e=>setFld("unit",e.target.value)} placeholder="ej: A1"/>
            {errs["unit"]&&<div style={{color:"#ef4444",fontSize:10}}>{errs["unit"]}</div>}
          </div>
          <div style={fg}><label style={lbl}>Categoría *</label>
            <select style={{...selSt,borderColor:errs["category"]?"#ef4444":""}} value={f.category} onChange={e=>{const c=actCats.find(x=>x.name===e.target.value);setFld("category",e.target.value);setFld("subcategory",(c?.subs||[])[0]||"");}}>
              <option value="">— Selecciona categoría —</option>
              {actCats.map(c=><option key={c.id}>{c.name}</option>)}
            </select>
            {errs["category"]&&<div style={{color:"#ef4444",fontSize:10}}>{errs["category"]}</div>}
          </div>
          <div style={fg}><label style={lbl}>Subcategoría</label>
            <select style={selSt} value={f.subcategory} onChange={e=>setFld("subcategory",e.target.value)}>
              {(curCat?.subs||[]).map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </>}
        {isAdmin&&tipoR==="Administrativo"&&<>
          <div style={fg}><label style={lbl}>Categoría</label>
            <select style={selSt} value={adminCat} onChange={e=>{setAdminCat(e.target.value);setAdminSub((ADMIN_CATS[e.target.value]||[])[0]||"");}}>
              {adminCatList.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={fg}><label style={lbl}>Subcategoría</label>
            <select style={selSt} value={adminSub} onChange={e=>setAdminSub(e.target.value)}>
              {(ADMIN_CATS[adminCat]||[]).map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </>}
        <div style={{...fg,gridColumn:"1/-1"}}>
          <label style={lbl}>Descripción *</label>
          <textarea style={{...inp,height:80,resize:"vertical",borderColor:errs["description"]?"#ef4444":""}} value={f.description} onChange={e=>setFld("description",e.target.value)} placeholder="Describa el problema o situación..."/>
          {errs["description"]&&<div style={{color:"#ef4444",fontSize:10}}>{errs["description"]}</div>}
        </div>
        {tipoR==="Incidencia"&&<>
          {role!=="Residente"&&<div style={fg}><label style={lbl}>Prioridad</label>
            <select style={{...selSt,color:PRIORITY_COLOR[f.priority]}} value={f.priority} onChange={e=>setFld("priority",e.target.value)}>
              {PRIORITIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>}
          {role!=="Residente"&&<div style={fg}><label style={lbl}>Franja horaria</label>
            <select style={selSt} value={f.preferredTimeSlot} onChange={e=>setFld("preferredTimeSlot",e.target.value)}>
              {["Manana (9-13h)","Tarde (14-18h)","Cualquier hora","Inmediato"].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>}
          <div style={{...fg,gridColumn:"1/-1"}}>
            <label style={lbl}>Imágenes (opcional)</label>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
            <div style={{border:"2px dashed #d1d5db",borderRadius:8,padding:14,textAlign:"center",cursor:"pointer",marginBottom:6}} onClick={()=>fileRef.current.click()}>
              <div style={{fontSize:12,color:"#64748b"}}>📷 Toca para agregar fotos</div>
            </div>
            {prevs.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{prevs.map((p,i)=><img key={i} src={p.url} alt={p.name} style={{...thumb,width:56}}/>)}</div>}
          </div>
          <div style={{...fg,gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}>
            <input type="checkbox" checked={f.accessPermission} onChange={e=>setFld("accessPermission",e.target.checked)}/>
            <label style={{fontSize:12}}>Autorizo ingreso al inmueble</label>
          </div>
        </>}
        {isAdmin&&tipoR==="Administrativo"&&(
          <div style={fg}><label style={lbl}>Prioridad</label>
            <select style={{...selSt,color:PRIORITY_COLOR[f.priority]}} value={f.priority} onChange={e=>setFld("priority",e.target.value)}>
              {PRIORITIES.map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        )}
        <div style={{...fg,gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}>
          <input type="checkbox" checked={f.confirm} onChange={e=>setFld("confirm",e.target.checked)}/>
          <label style={{fontSize:12}}>Confirmo que la información es correcta *</label>
          {errs["confirm"]&&<span style={{color:"#ef4444",fontSize:10}}>{errs["confirm"]}</span>}
        </div>
      </div>
      {tipoR==="Incidencia"&&f.priority==="Emergencia"&&(
        <div style={{...alrt("error"),display:"flex",alignItems:"center",gap:8}}>⚠ <strong>EMERGENCIA — Se notificará de inmediato</strong></div>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
        <button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button>
        <button style={mkBtn(tipoR==="Administrativo"?"purple":"primary",true)} onClick={submit}>Enviar</button>
      </div>
    </div></div>
  );
}

// ─── DETALLE INCIDENTE ────────────────────────────────────────────────────────
function IncDetail({req,reqs,tasks,atts,emails,role,setReqs,setTasks,setAtts,addEmail,showToast,onBack,setSelReq,mob,resps}){
  const r=reqs.find(x=>x.id===req.id)||req;
  const safeHistory=r.history||[]; const safeComments=r.comments||[];
  const myTasks=tasks.filter(t=>t.requestId===r.id);
  const myEmails=emails.filter(e=>e.requestId===r.id);
  const myAtt=type=>atts.filter(a=>a.requestId===r.id&&a.type===type);
  const [comment,setComment]=useState(""); const [ns,setNs]=useState(r.status);
  const [asgn,setAsgn]=useState(r.assignedTo||"Sin asignar");
  const [showTF,setShowTF]=useState(false); const [showEv,setShowEv]=useState(null);
  const [tab,setTab]=useState("info");
  const RESP_LIST=(resps||[]).filter(u=>u.active&&u.rol!=="Residente"&&u.rol!=="Proveedor").map(u=>u.nombre).concat(["Sin asignar"]);

  const upd=(ch,he)=>{
    const updated={...r,...ch,history:he?[...safeHistory,{date:new Date().toISOString(),user:role,...he}]:safeHistory};
    setReqs(p=>p.map(x=>x.id===r.id?updated:x));setSelReq(p=>({...p,...ch}));
  };
  const applyStatus=()=>{
    if(ns===r.status)return;
    upd({status:ns},{action:"Estado cambiado",from:r.status,to:ns});
    addEmail({requestId:r.id,date:new Date().toISOString(),to:r.requesterEmail,subject:r.code+" Estado: "+ns,type:"Cambio de estado",status:"Enviado",body:"Cambio a: "+ns});
    showToast("Estado actualizado");
  };
  const applyAsgn=()=>{
    if(!asgn||asgn==="Sin asignar")return;
    upd({assignedTo:asgn,status:"Asignada"},{action:"Asignado a "+asgn,from:r.status,to:"Asignada"});
    showToast("Asignado");
  };
  const addCmt=()=>{
    if(!comment.trim())return;
    upd({comments:[...safeComments,{id:"c"+uid(),user:role,role,date:new Date().toISOString(),text:comment}]});
    setComment("");showToast("Comentario agregado");
  };
  const tabs=[{id:"info",label:"Info"},{id:"history",label:"Historial"},{id:"tasks",label:"Tareas ("+myTasks.length+")"},{id:"evidence",label:"Evidencias"},{id:"emails",label:"Correos"}];

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontWeight:700,fontSize:mob?16:20}}>{r.code}</span>
            <PBadge p={r.priority}/><SBadge s={r.status}/>
          </div>
          <div style={{fontSize:11,color:"#64748b"}}>{r.category} — Torre {r.tower}/{r.unit}</div>
        </div>
      </div>
      {r.priority==="Emergencia"&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,color:"#dc2626"}}>⚠</span><strong style={{color:"#dc2626"}}>EMERGENCIA ACTIVA</strong></div>}
      {(can(role,"changeStatus")||can(role,"assign"))&&r.status!=="Cerrada"&&r.status!=="Rechazada"&&(
        <div style={{...card,padding:12,marginBottom:12}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            {can(role,"changeStatus")&&(<div><label style={lbl}>Estado</label><div style={{display:"flex",gap:6}}><select style={{...selSt,width:140}} value={ns} onChange={e=>setNs(e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select><button style={mkBtn("primary",true)} onClick={applyStatus}>OK</button></div></div>)}
            {can(role,"assign")&&(<div><label style={lbl}>Responsable</label><div style={{display:"flex",gap:6}}><select style={{...selSt,width:150}} value={asgn} onChange={e=>setAsgn(e.target.value)}>{RESP_LIST.map(s=><option key={s}>{s}</option>)}</select><button style={mkBtn("secondary",true)} onClick={applyAsgn}>Asignar</button></div></div>)}
            {can(role,"createTask")&&<button style={mkBtn("secondary",true)} onClick={()=>setShowTF(true)}>+ Tarea</button>}
            <button style={mkBtn("secondary",true)} onClick={()=>setShowEv("avance")}>Evidencia</button>
          </div>
        </div>
      )}
      <Tabs tabs={tabs} active={tab} onChange={setTab}/>
      {tab==="info"&&(
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
          <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Solicitante</div><IR l="Nombre" v={r.requesterName}/><IR l="Correo" v={r.requesterEmail}/><IR l="Teléfono" v={r.requesterPhone}/><IR l="Torre" v={r.tower}/><IR l="Unidad" v={r.unit}/></div>
          <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Caso</div><IR l="Categoría" v={(r.category||"")+" / "+(r.subcategory||"")}/><IR l="Responsable" v={r.assignedTo}/><IR l="Creación" v={fmt(r.createdAt)}/></div>
          <div style={{...card,gridColumn:"1/-1"}}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Descripción</div><p style={{fontSize:13,color:"#374151",lineHeight:1.6,margin:0}}>{r.description||"Sin descripción."}</p></div>
          <div style={{...card,gridColumn:"1/-1"}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Comentarios ({safeComments.length})</div>
            {safeComments.map((c,i)=>(
              <div key={c.id||i} style={{borderLeft:"3px solid #e2e8f0",paddingLeft:10,marginBottom:10}}>
                <div style={{display:"flex",gap:6,marginBottom:3,flexWrap:"wrap"}}><strong style={{fontSize:12}}>{c.user}</strong><span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{fmt(c.date)}</span></div>
                <p style={{margin:0,fontSize:13}}>{c.text}</p>
              </div>
            ))}
            {can(role,"comment")&&(<div style={{marginTop:10,display:"flex",gap:8}}><input style={{...inp,flex:1}} placeholder="Comentario..." value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCmt()}/><button style={mkBtn("primary",true)} onClick={addCmt}>Enviar</button></div>)}
          </div>
        </div>
      )}
      {tab==="history"&&(
        <div style={card}>{safeHistory.length===0?<Empty msg="Sin historial"/>:(
          <div>{[...safeHistory].reverse().map((h,i)=>(
            <div key={i} style={{paddingBottom:12,borderBottom:"1px solid #f1f5f9",marginBottom:8}}>
              <div style={{fontSize:13,fontWeight:600}}>{h.action}</div>
              {h.from&&h.to&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}><SBadge s={h.from}/> → <SBadge s={h.to}/></div>}
              <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{fmt(h.date)} — {h.user}</div>
            </div>
          ))}</div>
        )}</div>
      )}
      {tab==="tasks"&&(
        <div>
          {showTF&&<TaskForm requestId={r.id} setTasks={setTasks} showToast={showToast} onClose={()=>setShowTF(false)} resps={resps}/>}
          {myTasks.length===0&&!showTF&&<Empty msg="Sin tareas"/>}
          {myTasks.map(t=><TaskCard key={t.id} task={t} role={role} tasks={tasks} setTasks={setTasks} showToast={showToast} atts={atts} setAtts={setAtts}/>)}
          {can(role,"createTask")&&!showTF&&<button style={mkBtn("secondary")} onClick={()=>setShowTF(true)}>+ Nueva tarea</button>}
        </div>
      )}
      {tab==="evidence"&&(
        <div>{["inicial","avance","cierre"].map(type=>(
          <div key={type} style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:12}}>{type==="inicial"?"Inicial":type==="avance"?"Avance":"Cierre"}</div>
              {r.status!=="Cerrada"&&<button style={mkBtn("secondary",true)} onClick={()=>setShowEv(type)}>+ Agregar</button>}
            </div>
            {myAtt(type).length===0?<div style={{color:"#94a3b8",fontSize:12}}>Sin imágenes.</div>:(
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{myAtt(type).map((a,i)=><img key={i} src={a.preview} alt={a.name} style={thumb}/>)}</div>
            )}
          </div>
        ))}</div>
      )}
      {tab==="emails"&&(
        <div style={card}>{myEmails.length===0?<Empty msg="Sin correos"/>:myEmails.map((e,i)=>(
          <div key={e.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"8px 0"}}>
            <div style={{fontWeight:600,fontSize:12}}>{e.subject}</div>
            <div style={{fontSize:10,color:"#64748b"}}>{e.to} — {fmt(e.date)}</div>
            <div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4,marginTop:4}}>{e.body}</div>
          </div>
        ))}</div>
      )}
      {showEv&&<EvidModal type={showEv} requestId={r.id} role={role} atts={atts} setAtts={setAtts} showToast={showToast} onClose={()=>setShowEv(null)}/>}
    </div>
  );
}

function TaskForm({requestId,setTasks,showToast,onClose,resps}){
  const RESP_A=(resps||[]).filter(u=>u.active&&u.rol!=="Residente"&&u.rol!=="Proveedor").map(u=>u.nombre);
  const [f,setF]=useState({title:"",desc:"",responsible:RESP_A[0]||"",ejecutor:"",dueDate:"",priority:"Media"});
  const submit=()=>{if(!f.title){showToast("Ingrese título","error");return;}setTasks(p=>[...p,{id:"t"+uid(),requestId,comments:[],attachments:[],materials:[],status:"Ingresada",...f}]);showToast("Tarea creada");onClose();};
  return(
    <div style={{...card,border:"2px solid #3b82f6",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Nueva Tarea</div><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Trabajo *</label><input style={inp} value={f.title} onChange={e=>setF(p=>({...p,title:e.target.value}))}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Descripción</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.desc} onChange={e=>setF(p=>({...p,desc:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Responsable</label><select style={selSt} value={f.responsible} onChange={e=>setF(p=>({...p,responsible:e.target.value}))}>{RESP_A.map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Ejecutor</label><input style={inp} value={f.ejecutor} onChange={e=>setF(p=>({...p,ejecutor:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Fecha límite</label><input type="date" style={inp} value={f.dueDate} onChange={e=>setF(p=>({...p,dueDate:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Prioridad</label><select style={selSt} value={f.priority} onChange={e=>setF(p=>({...p,priority:e.target.value}))}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
      </div>
      <button style={mkBtn("primary",true)} onClick={submit}>Crear</button>
    </div>
  );
}

function TaskCard({task,role,tasks,setTasks,showToast,atts,setAtts}){
  const [exp,setExp]=useState(false);const [cmt,setCmt]=useState("");
  const upd=ch=>setTasks(p=>p.map(t=>t.id===task.id?{...t,...ch}:t));
  const addC=()=>{if(!cmt.trim())return;upd({comments:[...(task.comments||[]),{user:role,date:new Date().toISOString(),text:cmt}]});setCmt("");};
  return(
    <div style={{...card,marginBottom:10,borderLeft:"4px solid "+(PRIORITY_COLOR[task.priority]||"#e2e8f0")}}>
      <div style={{display:"flex",justifyContent:"space-between",cursor:"pointer",gap:8}} onClick={()=>setExp(p=>!p)}>
        <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{task.title}</div><div style={{fontSize:11,color:"#64748b"}}>{task.responsible} · {task.dueDate?fmtD(task.dueDate):"Sin fecha"}</div></div>
        <div style={{display:"flex",gap:6,flexShrink:0}}><PBadge p={task.priority}/><SBadge s={task.status}/></div>
      </div>
      {exp&&(
        <div style={{marginTop:10,borderTop:"1px solid #f1f5f9",paddingTop:10}}>
          {task.desc&&<p style={{fontSize:12,color:"#374151",marginBottom:8}}>{task.desc}</p>}
          {(task.comments||[]).map((c,i)=><div key={i} style={{fontSize:11,marginBottom:6,paddingLeft:8,borderLeft:"2px solid #e2e8f0"}}><strong>{c.user}</strong> — {fmt(c.date)}<br/>{c.text}</div>)}
          <div style={{display:"flex",gap:6,marginTop:8}}>
            <input style={{...inp,flex:1,fontSize:12}} placeholder="Comentario..." value={cmt} onChange={e=>setCmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addC()}/>
            <button style={mkBtn("secondary",true)} onClick={addC}>Enviar</button>
            {task.status!=="Completada"&&<button style={mkBtn("success",true)} onClick={()=>{upd({status:"Completada"});showToast("Tarea completada");}}>✓</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidModal({type,requestId,role,atts,setAtts,showToast,onClose}){
  const [previews,setPrev]=useState([]);const [comment,setCmt]=useState("");const fileRef=useRef();
  const handleFiles=e=>Array.from(e.target.files).forEach((f:any)=>{const r=new FileReader();r.onload=ev=>setPrev(p=>[...p,{name:f.name,url:ev.target.result}]);r.readAsDataURL(f);});
  const save=()=>{if(!previews.length){showToast("Seleccione imagen","error");return;}const na=previews.map(p=>({id:"a"+uid(),requestId,type,name:p.name,date:new Date().toISOString(),user:role,comment,preview:p.url}));setAtts(prev=>[...prev,...na]);showToast(previews.length+" imagen(es) guardada(s)");onClose();};
  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{margin:0,fontSize:14}}>Evidencia — {type}</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
      <div style={{border:"2px dashed #d1d5db",borderRadius:8,padding:20,textAlign:"center",cursor:"pointer",marginBottom:10}} onClick={()=>fileRef.current.click()}>
        <div style={{fontSize:12,color:"#64748b"}}>Clic para seleccionar imágenes</div>
      </div>
      {previews.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>{previews.map((p,i)=><img key={i} src={p.url} alt={p.name} style={{...thumb,width:70}}/>)}</div>}
      <div style={fg}><label style={lbl}>Comentario</label><input style={inp} value={comment} onChange={e=>setCmt(e.target.value)}/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={save}>Guardar</button></div>
    </div></div>
  );
}

function TasksView({tasks,reqs,role,setTasks,mob}){
  const [fi,setFi]=useState({status:"",q:""});
  const visible=tasks.filter(t=>(!fi.status||t.status===fi.status)&&(!fi.q||(t.title+" "+t.responsible).toLowerCase().includes(fi.q.toLowerCase())));
  return(
    <div>
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input style={{...inp,flex:2,minWidth:100}} placeholder="Buscar..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/>
          <select style={{...selSt,flex:1}} value={fi.status} onChange={e=>setFi(p=>({...p,status:e.target.value}))}>
            <option value="">Todos los estados</option>
            {["Ingresada","En proceso","Completada"].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {visible.length===0?<Empty msg="Sin órdenes de trabajo"/>:visible.map(t=>{
        const req=reqs.find(r=>r.id===t.requestId);
        return(
          <div key={t.id} style={{...card,borderLeft:"4px solid "+(PRIORITY_COLOR[t.priority]||"#e2e8f0"),marginBottom:8,padding:12}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13}}>{t.title}</div>
                {req&&<div style={{fontSize:10,color:"#3b82f6"}}>{req.code} — {req.category}</div>}
                <div style={{fontSize:11,color:"#64748b"}}>{t.responsible} · {t.dueDate?fmtD(t.dueDate):"Sin fecha"}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}><PBadge p={t.priority}/><SBadge s={t.status}/></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InspView({inspections,setInsp,showToast,role,mob,towers}){
  const [sub,setSub]=useState("list");const [sel,setSel]=useState(null);
  const readOnly=!can(role,"inspection");
  if(sub==="new")return <InspForm inspections={inspections} setInsp={setInsp} showToast={showToast} role={role} onBack={()=>setSub("list")} mob={mob} towers={towers}/>;
  if(sub==="detail"&&sel){const ins=inspections.find(i=>i.id===sel.id)||sel;return <InspDetail inspection={normalizeInsp(ins)} onBack={()=>setSub("list")} mob={mob}/>;}
  return(
    <div>
      <Grid cols={4} mob={mob}>
        <Kpi value={inspections.length} label="Total" color="#6366f1" mob={mob}/>
        <Kpi value={inspections.filter(i=>i.status==="Finalizada").length} label="Finalizadas" color="#10b981" mob={mob}/>
        <Kpi value={inspections.reduce((a,i)=>a+Object.values(i.items||{}).filter((v:any)=>v.state==="Malo").length,0)} label="Hallazgos" color="#ef4444" mob={mob}/>
        <Kpi value={inspections.reduce((a,i)=>a+Object.values(i.items||{}).filter((v:any)=>v.state==="Regular").length,0)} label="Regulares" color="#f59e0b" mob={mob}/>
      </Grid>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        {!readOnly&&<button style={mkBtn("primary",true)} onClick={()=>setSub("new")}>+ Nueva novedad</button>}
      </div>
      {inspections.length===0?<Empty msg="Sin novedades registradas"/>:(
        <div>{[...inspections].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map(ins=>{
          const mal=Object.values(ins.items||{}).filter((v:any)=>v.state==="Malo").length;
          return(
            <div key={ins.id} style={{...card,padding:12,marginBottom:8,cursor:"pointer",borderLeft:"4px solid "+(ins.status==="Finalizada"?"#10b981":"#f59e0b")}} onClick={()=>{setSel(ins);setSub("detail");}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div><span style={{fontWeight:700,color:"#6366f1"}}>{ins.id}</span><div style={{fontSize:12,color:"#64748b"}}>{ins.sector}</div><div style={{fontSize:11,color:"#94a3b8"}}>{fmt(ins.date)} — {ins.inspector}</div></div>
                <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                  <span style={bdg(ins.status==="Finalizada"?"#10b981":"#f59e0b",ins.status==="Finalizada"?"#f0fdf4":"#fffbeb")}>{ins.status}</span>
                  {mal>0&&<span style={bdg("#ef4444","#fef2f2")}>{mal} malos</span>}
                </div>
              </div>
            </div>
          );
        })}</div>
      )}
    </div>
  );
}

function InspForm({inspections,setInsp,showToast,role,onBack,mob,towers}){
  const allSectors=(towers||[]).filter(t=>t.active).map(t=>t.label);
  const [meta,setMeta]=useState({date:new Date().toISOString().slice(0,16),inspector:role,sector:allSectors[0]||"General",conclusion:""});
  const [items,setItems]=useState(mkItems());const [actSec,setActSec]=useState("s1");
  const setItem=(sid,name,field,val)=>{const k=sid+"_"+name;setItems(p=>({...p,[k]:{...(p[k]||{}),state:"",obs:"",urgency:"",images:[],...p[k],[field]:val}}));};
  const getItem=(sid,name)=>items[sid+"_"+name]||{state:"",obs:"",urgency:"",images:[]};
  const all=Object.values(items);const answered=all.filter((v:any)=>v.state).length;
  const sec=CL_SECTIONS.find(s=>s.id===actSec);
  const secIdx=CL_SECTIONS.findIndex(s=>s.id===actSec);
  const save=st=>{
    if(st==="Finalizada"&&!meta.conclusion.trim()){showToast("Ingrese conclusión","error");return;}
    const code=genCode(inspections,"INS-");
    setInsp(p=>[{id:code,...meta,status:st,items},...p]);
    showToast(st==="Finalizada"?"Novedad finalizada":"Borrador guardado");onBack();
  };
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button><div style={{fontWeight:700,fontSize:16}}>Nueva Novedad</div></div>
      <div style={card}><div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:10}}>
        <div style={fg}><label style={lbl}>Fecha</label><input type="datetime-local" style={inp} value={meta.date} onChange={e=>setMeta(p=>({...p,date:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Inspector</label><input style={inp} value={meta.inspector} onChange={e=>setMeta(p=>({...p,inspector:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Sector</label><input style={inp} value={meta.sector} onChange={e=>setMeta(p=>({...p,sector:e.target.value}))}/></div>
      </div></div>
      <div style={{...card,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontWeight:600,fontSize:12}}>Progreso: {answered}/{all.length}</span></div>
        <div style={{height:6,background:"#f1f5f9",borderRadius:99}}><div style={{height:6,background:answered===all.length?"#10b981":"#3b82f6",borderRadius:99,width:(answered/all.length*100)+"%"}}/></div>
      </div>
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12}}>
        {CL_SECTIONS.map(s=>{const mal=s.items.map(n=>getItem(s.id,n)).filter((v:any)=>v.state==="Malo").length;return <button key={s.id} style={mkBtn(actSec===s.id?"primary":"secondary",true)} onClick={()=>setActSec(s.id)}>{s.label.split(" ")[0]}{mal>0?" ["+mal+"]":""}</button>;})}
      </div>
      {sec&&(
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>{sec.label}</div>
          {sec.items.map(name=>{
            const it=getItem(sec.id,name);
            return(
              <div key={name} style={{borderBottom:"1px solid #f1f5f9",paddingBottom:10,marginBottom:10}}>
                <div style={{fontWeight:600,fontSize:12,marginBottom:6}}>{name}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                  {ITEM_STATES.map(s=>(
                    <button key={s} onClick={()=>setItem(sec.id,name,"state",s)} style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,cursor:"pointer",border:"2px solid "+(it.state===s?ITEM_COLOR[s]:"#e2e8f0"),background:it.state===s?ITEM_COLOR[s]+"22":"#f9fafb",color:it.state===s?ITEM_COLOR[s]:"#6b7280"}}>{s}</button>
                  ))}
                </div>
                {it.state&&it.state!=="No aplica"&&(<input style={{...inp,fontSize:12}} placeholder="Observación..." value={it.obs||""} onChange={e=>setItem(sec.id,name,"obs",e.target.value)}/>)}
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            {secIdx>0&&<button style={mkBtn("secondary",true)} onClick={()=>setActSec(CL_SECTIONS[secIdx-1].id)}>← Anterior</button>}
            {secIdx<CL_SECTIONS.length-1&&<button style={{...mkBtn("primary",true),marginLeft:"auto"}} onClick={()=>setActSec(CL_SECTIONS[secIdx+1].id)}>Siguiente →</button>}
          </div>
        </div>
      )}
      <div style={card}>
        <label style={lbl}>Conclusión general</label>
        <textarea style={{...inp,height:80,resize:"vertical"}} value={meta.conclusion} onChange={e=>setMeta(p=>({...p,conclusion:e.target.value}))} placeholder="Resuma los hallazgos..."/>
        <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}>
          <button style={mkBtn("secondary",true)} onClick={()=>save("Borrador")}>Guardar borrador</button>
          <button style={mkBtn("primary",true)} onClick={()=>save("Finalizada")}>Finalizar</button>
        </div>
      </div>
    </div>
  );
}

function InspDetail({inspection,onBack,mob}){
  const [tab,setTab]=useState("resumen");
  const safeItems=inspection.items||mkItems();
  const allEntries=Object.entries(safeItems);
  const malos=allEntries.filter(e=>(e[1] as any).state==="Malo");
  const regs=allEntries.filter(e=>(e[1] as any).state==="Regular");
  const bues=allEntries.filter(e=>(e[1] as any).state==="Bueno");
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button>
        <div style={{flex:1}}><span style={{fontWeight:700,fontSize:16}}>{inspection.id}</span><div style={{fontSize:11,color:"#64748b"}}>{inspection.sector} — {fmt(inspection.date)}</div></div>
      </div>
      <Tabs tabs={[{id:"resumen",label:"Resumen"},{id:"hallazgos",label:"Hallazgos ("+(malos.length+regs.length)+")"},{id:"checklist",label:"Checklist"}]} active={tab} onChange={setTab} accent="#6366f1"/>
      {tab==="resumen"&&(
        <div>
          <Grid cols={4} mob={mob}><Kpi value={bues.length} label="Buenos" color="#10b981" mob={mob}/><Kpi value={regs.length} label="Regulares" color="#f59e0b" mob={mob}/><Kpi value={malos.length} label="Malos" color="#ef4444" mob={mob}/><Kpi value={bues.length+regs.length+malos.length} label="Revisados" color="#3b82f6" mob={mob}/></Grid>
          <div style={card}><div style={{fontWeight:600,marginBottom:6}}>Conclusión</div><p style={{fontSize:13,margin:0,lineHeight:1.6}}>{inspection.conclusion||"—"}</p></div>
        </div>
      )}
      {tab==="hallazgos"&&(
        <div>{malos.length+regs.length===0?<Empty msg="Sin hallazgos"/>:[...malos,...regs].map(entry=>{
          const key=entry[0];const it=entry[1] as any;const name=key.split("_").slice(1).join("_");const isMalo=it.state==="Malo";
          return(
            <div key={key} style={{...card,borderLeft:"4px solid "+(isMalo?"#ef4444":"#f59e0b"),padding:12,marginBottom:8}}>
              <div style={{fontWeight:600,fontSize:13}}>{name}</div>
              <span style={bdg(ITEM_COLOR[it.state]||"#94a3b8",(ITEM_COLOR[it.state]||"#94a3b8")+"22")}>{it.state}</span>
              {it.obs&&<p style={{fontSize:12,margin:"4px 0 0"}}>{it.obs}</p>}
            </div>
          );
        })}</div>
      )}
      {tab==="checklist"&&(
        <div>{CL_SECTIONS.map(sec=>(
          <div key={sec.id} style={{...card,marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>{sec.label}</div>
            {sec.items.map(name=>{const it=(safeItems[sec.id+"_"+name]||{}) as any;return(
              <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}>
                <span>{name}</span>
                <span style={bdg(ITEM_COLOR[it.state]||"#94a3b8",(ITEM_COLOR[it.state]||"#94a3b8")+"22")}>{it.state||"—"}</span>
              </div>
            );})}
          </div>
        ))}</div>
      )}
    </div>
  );
}

function InvView({inventory,setInv,role,showToast,mob}){
  const [fi,setFi]=useState({cat:"",q:"",low:false});const [showForm,setShowForm]=useState(false);const [editItem,setEditItem]=useState(null);
  const [movItem,setMovItem]=useState(null);const [movDir,setMovDir]=useState(1);const [movQty,setMovQty]=useState(1);
  if(!can(role,"inventory")&&!can(role,"inventoryRead"))return <Empty msg="Sin acceso a este módulo"/>;
  const readOnly=can(role,"inventoryRead")&&!can(role,"inventory");
  const visible=inventory.filter(i=>(!fi.cat||i.category===fi.cat)&&(!fi.q||(i.name+" "+i.category).toLowerCase().includes(fi.q.toLowerCase()))&&(!fi.low||i.stock<i.minStock));
  const lowStock=inventory.filter(i=>i.stock<i.minStock).length;
  const saveItem=item=>{if(editItem){setInv(p=>p.map(i=>i.id===item.id?item:i));}else{setInv(p=>[...p,{...item,id:"inv"+uid()}]);}showToast("Guardado");setShowForm(false);setEditItem(null);};
  const adjStock=(id,delta)=>{setInv(p=>p.map(i=>i.id===id?{...i,stock:Math.max(0,i.stock+delta)}:i));showToast("Stock actualizado");setMovItem(null);};
  return(
    <div>
      <Grid cols={3} mob={mob}>
        <Kpi value={inventory.length} label="Total insumos" color="#6366f1" mob={mob}/>
        <Kpi value={lowStock} label="Stock crítico" color="#ef4444" mob={mob}/>
        <Kpi value={"$"+(inventory.reduce((s,i)=>s+(i.stock*(i.cost||0)),0)).toLocaleString("es-CL")} label="Valor total" color="#3b82f6" mob={mob}/>
      </Grid>
      {lowStock>0&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:12}} onClick={()=>setFi(p=>({...p,low:true}))}><span style={{color:"#dc2626",fontWeight:700}}>⚠</span><strong style={{color:"#dc2626"}}>{lowStock} insumo(s) bajo el mínimo</strong></div>}
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input style={{...inp,flex:2}} placeholder="Buscar..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/>
          <select style={{...selSt,flex:1}} value={fi.cat} onChange={e=>setFi(p=>({...p,cat:e.target.value}))}><option value="">Todas las categorías</option>{INV_CATS.map(c=><option key={c}>{c}</option>)}</select>
          <button style={mkBtn(fi.low?"warning":"secondary",true)} onClick={()=>setFi(p=>({...p,low:!p.low}))}>Crítico</button>
          {!readOnly&&<button style={mkBtn("primary",true)} onClick={()=>{setEditItem(null);setShowForm(true);}}>+ Agregar</button>}
        </div>
      </div>
      {visible.length===0?<Empty msg="Sin insumos"/>:(
        <div>{visible.map(item=>{
          const low=item.stock<item.minStock;
          return(
            <div key={item.id} style={{...card,borderLeft:"4px solid "+(low?"#ef4444":"#10b981"),padding:12,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{item.name}</div><div style={{fontSize:11,color:"#64748b"}}>{item.category} — {item.location||"—"}</div></div>
                <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:700,fontSize:16,color:low?"#ef4444":"#1e293b"}}>{item.stock} <span style={{fontSize:11,fontWeight:400}}>{item.unit}</span></div><div style={{fontSize:10,color:"#94a3b8"}}>min: {item.minStock}</div>{low&&<span style={bdg("#ef4444","#fef2f2")}>Bajo</span>}</div>
              </div>
              {!readOnly&&(
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  <button style={mkBtn("secondary",true)} onClick={()=>{setMovItem(item);setMovDir(1);setMovQty(1);}}>+ Stock</button>
                  <button style={mkBtn("secondary",true)} onClick={()=>{setMovItem(item);setMovDir(-1);setMovQty(1);}}>- Stock</button>
                  <button style={mkBtn("ghost",true)} onClick={()=>{setEditItem(item);setShowForm(true);}}>Editar</button>
                  <button style={{...mkBtn("ghost",true),color:"#ef4444"}} onClick={()=>setInv(p=>p.filter(i=>i.id!==item.id))}>🗑</button>
                </div>
              )}
            </div>
          );
        })}</div>
      )}
      {showForm&&<InvForm item={editItem} onSave={saveItem} onClose={()=>{setShowForm(false);setEditItem(null);}}/>}
      {movItem&&(
        <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:340,padding:20,marginTop:40}}>
          <h3 style={{margin:"0 0 12px"}}>{movDir>0?"Ingreso":"Egreso"} — {movItem.name}</h3>
          <div style={{...alrt("success"),marginBottom:10}}>Stock actual: <strong>{movItem.stock} {movItem.unit}</strong></div>
          <div style={fg}><label style={lbl}>Cantidad</label><input type="number" min={1} max={movDir<0?movItem.stock:9999} style={inp} value={movQty} onChange={e=>setMovQty(Math.max(1,parseInt(e.target.value)||1))}/></div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Resultante: <strong>{movItem.stock+(movDir>0?movQty:-movQty)} {movItem.unit}</strong></div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button style={mkBtn("secondary",true)} onClick={()=>setMovItem(null)}>Cancelar</button>
            <button style={mkBtn(movDir>0?"success":"danger",true)} disabled={movDir<0&&movQty>movItem.stock} onClick={()=>adjStock(movItem.id,movDir*movQty)}>{movDir>0?"Confirmar ingreso":"Confirmar egreso"}</button>
          </div>
        </div></div>
      )}
    </div>
  );
}

function InvForm({item,onSave,onClose}){
  const [f,setF]=useState({name:"",category:INV_CATS[0],unit:INV_UNITS[0],stock:0,minStock:1,location:"Bodega",cost:0,supplier:"",...(item||{})});
  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{item?"Editar":"Nuevo"} insumo</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Nombre *</label><input style={inp} value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Categoría</label><select style={selSt} value={f.category} onChange={e=>setF(p=>({...p,category:e.target.value}))}>{INV_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Unidad</label><select style={selSt} value={f.unit} onChange={e=>setF(p=>({...p,unit:e.target.value}))}>{INV_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Stock actual</label><input type="number" min="0" style={inp} value={f.stock} onChange={e=>setF(p=>({...p,stock:Math.max(0,+e.target.value)}))}/></div>
        <div style={fg}><label style={lbl}>Stock mínimo</label><input type="number" min="0" style={inp} value={f.minStock} onChange={e=>setF(p=>({...p,minStock:Math.max(0,+e.target.value)}))}/></div>
        <div style={fg}><label style={lbl}>Costo unit.</label><input type="number" min="0" style={inp} value={f.cost} onChange={e=>setF(p=>({...p,cost:Math.max(0,+e.target.value)}))}/></div>
        <div style={fg}><label style={lbl}>Ubicación</label><input style={inp} value={f.location} onChange={e=>setF(p=>({...p,location:e.target.value}))}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Proveedor</label><input style={inp} value={f.supplier} onChange={e=>setF(p=>({...p,supplier:e.target.value}))}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.name.trim())return;onSave(f);}}>Guardar</button></div>
    </div></div>
  );
}

function MantView({mant,setMant,role,showToast,mob,resps,towers}){
  const [sub,setSub]=useState("list");const [sel,setSel]=useState(null);
  const [showForm,setShowForm]=useState(false);const [editItem,setEdit]=useState(null);
  const [fi,setFi]=useState({cat:"",q:""});
  const canEdit=can(role,"mantencion");
  const enriched=mant.map(m=>({...m,computedStatus:getMantStatus(m)}));
  const visible=enriched.filter(m=>(!fi.cat||m.category===fi.cat)&&(!fi.q||((m.asset||"")+(m.provider||"")).toLowerCase().includes(fi.q.toLowerCase())));
  const vencidas=enriched.filter(m=>m.computedStatus==="Vencida").length;
  const porVencer=enriched.filter(m=>m.computedStatus==="Por vencer").length;
  const saveMant=item=>{
    if(editItem){setMant(p=>p.map(m=>m.id===item.id?item:m));showToast("Actualizado");}
    else{const code=genCode(mant,"MAN-");const nr=normalizeMant({...item,id:code,code,createdAt:new Date().toISOString()});setMant(p=>[nr,...p]);showToast("Mantención "+code+" creada");}
    setShowForm(false);setEdit(null);
  };
  if(sub==="detail"&&sel){const item=normalizeMant(mant.find(m=>m.id===sel.id)||sel);return <MantDetail item={item} mant={mant} setMant={setMant} role={role} showToast={showToast} mob={mob} readOnly={!canEdit} onBack={()=>setSub("list")} resps={resps}/>;}
  return(
    <div>
      {vencidas>0&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{color:"#dc2626",fontWeight:700}}>✗</span><strong style={{color:"#dc2626"}}>{vencidas} mantención(es) vencida(s)</strong></div>}
      {porVencer>0&&<div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{color:"#92400e",fontWeight:700}}>!</span><strong style={{color:"#92400e"}}>{porVencer} vencen pronto</strong></div>}
      <Grid cols={4} mob={mob}>
        <Kpi value={vencidas} label="Vencidas" color="#ef4444" mob={mob}/>
        <Kpi value={porVencer} label="Por vencer" color="#f59e0b" mob={mob}/>
        <Kpi value={enriched.filter(m=>m.computedStatus==="En ejecucion").length} label="En ejecución" color="#6366f1" mob={mob}/>
        <Kpi value={enriched.filter(m=>m.computedStatus==="Vigente").length} label="Vigentes" color="#10b981" mob={mob}/>
      </Grid>
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input style={{...inp,flex:2}} placeholder="Buscar activo, proveedor..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/>
          <select style={{...selSt,flex:1}} value={fi.cat} onChange={e=>setFi(p=>({...p,cat:e.target.value}))}><option value="">Todas las categorías</option>{MANT_CATS.map(c=><option key={c}>{c}</option>)}</select>
          {canEdit&&<button style={mkBtn("primary",true)} onClick={()=>{setEdit(null);setShowForm(true);}}>+ Nueva</button>}
        </div>
      </div>
      {visible.length===0?<Empty msg="Sin mantenciones registradas"/>:(
        <div>{visible.map(m=>{
          const daysLeft=m.nextDate?Math.ceil((new Date(m.nextDate).getTime()-Date.now())/86400000):null;
          const dayColor=daysLeft===null?"#374151":daysLeft<0?"#ef4444":daysLeft<=30?"#f59e0b":"#374151";
          return(
            <div key={m.id} style={{...card,borderLeft:"4px solid "+(MANT_SC[m.computedStatus]||"#e2e8f0"),marginBottom:10,padding:14,cursor:"pointer"}} onClick={()=>{setSel(m);setSub("detail");}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div style={{flex:1,minWidth:0}}><span style={{fontWeight:700,color:"#6366f1",fontSize:11}}>{m.code}</span><div style={{fontWeight:700,fontSize:14}}>{m.asset}</div><div style={{fontSize:11,color:"#64748b"}}>{m.subcategory} — {m.location||"—"}</div></div>
                <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}><MBadge m={m}/>{m.nextDate&&<div style={{fontSize:11,color:dayColor,fontWeight:600}}>{daysLeft!==null&&(daysLeft<0?Math.abs(daysLeft)+" días vencida":daysLeft+" días")}</div>}</div>
              </div>
            </div>
          );
        })}</div>
      )}
      {showForm&&<MantForm item={editItem} onSave={saveMant} onClose={()=>{setShowForm(false);setEdit(null);}} resps={resps}/>}
    </div>
  );
}

function MantDetail({item,mant,setMant,role,showToast,mob,readOnly,onBack,resps}){
  const m=normalizeMant(mant.find(x=>x.id===item.id)||item);
  const [tab,setTab]=useState("info");const [cmt,setCmt]=useState("");const [showHF,setShowHF]=useState(false);
  const upd=ch=>setMant(p=>p.map(x=>x.id===m.id?{...x,...ch}:x));
  const addCmt=()=>{if(!cmt.trim())return;upd({comments:[...m.comments,{user:role,date:new Date().toISOString(),text:cmt}]});setCmt("");showToast("Comentario agregado");};
  const addHist=h=>{upd({history:[...m.history,{id:"h"+uid(),...h}],lastDate:h.date});showToast("Ejecución registrada");setShowHF(false);};
  const daysLeft=m.nextDate?Math.ceil((new Date(m.nextDate).getTime()-Date.now())/86400000):null;
  const tabs=[{id:"info",label:"Información"},{id:"history",label:"Historial ("+m.history.length+")"},{id:"comments",label:"Comentarios ("+m.comments.length+")"}];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button><div style={{flex:1}}><span style={{fontWeight:700,fontSize:16}}>{m.asset}</span><div style={{fontSize:11,color:"#64748b"}}>{m.code}</div></div><MBadge m={m}/></div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} accent="#6366f1"/>
      {tab==="info"&&(
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
          <div style={card}><IR l="Categoría" v={m.category}/><IR l="Tipo" v={m.tipo}/><IR l="Responsable" v={m.responsible}/><IR l="Proveedor" v={m.provider}/></div>
          <div style={card}><IR l="Última mantención" v={m.lastDate?fmtD(m.lastDate):"No registrada"}/><IR l="Próximo vencimiento" v={m.nextDate?fmtD(m.nextDate):"No definida"}/><IR l="Días restantes" v={daysLeft===null?"—":daysLeft<0?Math.abs(daysLeft)+" vencida":daysLeft+" días"}/></div>
          {m.description&&<div style={{...card,gridColumn:"1/-1"}}><p style={{fontSize:13,margin:0}}>{m.description}</p></div>}
          {!readOnly&&(<div style={{gridColumn:"1/-1"}}><button style={mkBtn("success",true)} onClick={()=>setShowHF(true)}>+ Registrar ejecución</button>{showHF&&<HistForm onSave={addHist} onClose={()=>setShowHF(false)} resps={resps}/>}</div>)}
        </div>
      )}
      {tab==="history"&&(
        <div>
          {!readOnly&&!showHF&&<button style={{...mkBtn("success",true),marginBottom:12}} onClick={()=>setShowHF(true)}>+ Registrar ejecución</button>}
          {showHF&&<HistForm onSave={addHist} onClose={()=>setShowHF(false)} resps={resps}/>}
          {m.history.length===0&&!showHF?<Empty msg="Sin historial"/>:m.history.map(h=>(
            <div key={h.id||h.date} style={{...card,borderLeft:"4px solid #6366f1",marginBottom:8}}><div style={{fontWeight:600,fontSize:13}}>{h.tipo} — {fmtD(h.date)}</div><div style={{fontSize:11,color:"#64748b"}}>{h.responsible}</div>{h.notes&&<p style={{fontSize:12,margin:"6px 0 0"}}>{h.notes}</p>}</div>
          ))}
        </div>
      )}
      {tab==="comments"&&(
        <div style={card}>
          {m.comments.map((c,i)=>(<div key={i} style={{borderLeft:"3px solid #e2e8f0",paddingLeft:10,marginBottom:10}}><strong style={{fontSize:12}}>{c.user}</strong><span style={{fontSize:10,color:"#94a3b8",marginLeft:8}}>{fmt(c.date)}</span><p style={{margin:"4px 0 0",fontSize:13}}>{c.text}</p></div>))}
          {!readOnly&&(<div style={{marginTop:10,display:"flex",gap:8}}><input style={{...inp,flex:1}} placeholder="Comentario..." value={cmt} onChange={e=>setCmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCmt()}/><button style={mkBtn("primary",true)} onClick={addCmt}>Enviar</button></div>)}
        </div>
      )}
    </div>
  );
}

function MantForm({item,onSave,onClose,resps}){
  const RESP_LIST=(resps||[]).filter(u=>u.active&&u.rol!=="Residente"&&u.rol!=="Proveedor").map(u=>u.nombre).concat(["Sin asignar"]);
  const defCat=MANT_CATS[0];
  const [f,setF]=useState({asset:"",category:defCat,subcategory:(MANT_SUBCATS[defCat]||[])[0]||"",location:"",tipo:MANT_TIPOS[0],responsible:RESP_LIST[0]||"",provider:"",lastDate:"",nextDate:"",costEstimated:"",description:"",...(item||{})});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:560,padding:"20px",marginTop:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{item?"Editar":"Nueva"} mantención</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Activo *</label><input style={inp} value={f.asset} onChange={e=>set("asset",e.target.value)}/></div>
        <div style={fg}><label style={lbl}>Categoría</label><select style={selSt} value={f.category} onChange={e=>{set("category",e.target.value);set("subcategory",(MANT_SUBCATS[e.target.value]||[])[0]||"");}}>{MANT_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Subcategoría</label><select style={selSt} value={f.subcategory} onChange={e=>set("subcategory",e.target.value)}>{(MANT_SUBCATS[f.category]||[]).map(s=><option key={s}>{s}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Tipo</label><select style={selSt} value={f.tipo} onChange={e=>set("tipo",e.target.value)}>{MANT_TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Responsable</label><select style={selSt} value={f.responsible} onChange={e=>set("responsible",e.target.value)}>{RESP_LIST.map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Proveedor</label><input style={inp} value={f.provider} onChange={e=>set("provider",e.target.value)}/></div>
        <div style={fg}><label style={lbl}>Última mantención</label><input type="date" style={inp} value={f.lastDate} onChange={e=>set("lastDate",e.target.value)}/></div>
        <div style={fg}><label style={lbl}>Próximo vencimiento</label><input type="date" style={inp} value={f.nextDate} onChange={e=>set("nextDate",e.target.value)}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Descripción</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.description} onChange={e=>set("description",e.target.value)}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.asset.trim())return;onSave(f);}}>Guardar</button></div>
    </div></div>
  );
}

function HistForm({onSave,onClose,resps}){
  const RESP_LIST=(resps||[]).filter(u=>u.active&&u.rol!=="Residente"&&u.rol!=="Proveedor").map(u=>u.nombre).concat(["Sin asignar"]);
  const [f,setF]=useState({date:new Date().toISOString().slice(0,10),tipo:MANT_TIPOS[0],responsible:RESP_LIST[0]||"",notes:"",costReal:0});
  return(
    <div style={{...card,border:"2px solid #6366f1",marginBottom:12,marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600}}>Registrar ejecución</div><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={fg}><label style={lbl}>Fecha</label><input type="date" style={inp} value={f.date} onChange={e=>setF(p=>({...p,date:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Tipo</label><select style={selSt} value={f.tipo} onChange={e=>setF(p=>({...p,tipo:e.target.value}))}>{MANT_TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Responsable</label><select style={selSt} value={f.responsible} onChange={e=>setF(p=>({...p,responsible:e.target.value}))}>{RESP_LIST.map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Costo real</label><input type="number" min="0" style={inp} value={f.costReal} onChange={e=>setF(p=>({...p,costReal:Math.max(0,+e.target.value)}))}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Notas</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.notes} onChange={e=>setF(p=>({...p,notes:e.target.value}))}/></div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("success",true)} onClick={()=>{if(!f.date)return;onSave(f);}}>Registrar</button></div>
    </div>
  );
}

function EmailsView({logs,setEmails,role}){
  const [q,setQ]=useState("");
  const visible=[...logs].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).filter(e=>!q||((e.to||"")+(e.subject||"")).toLowerCase().includes(q.toLowerCase()));
  return(
    <div>
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input style={{...inp,flex:1}} placeholder="Buscar..." value={q} onChange={e=>setQ(e.target.value)}/>
          {can(role,"manageConfig")&&logs.length>0&&<button style={mkBtn("danger",true)} onClick={()=>{if(window.confirm("¿Limpiar todos los correos?"))setEmails([]);}}>🗑 Limpiar</button>}
        </div>
      </div>
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Bandeja de correos</div><span style={bdg("#10b981","#f0fdf4")}>{logs.length} enviados</span></div>
        {visible.length===0?<Empty msg="Sin correos"/>:visible.map((e,i)=>(
          <div key={e.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0"}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
              <span style={{fontWeight:600,fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.subject}</span>
              <span style={bdg("#6366f1","#eef2ff")}>{e.type}</span>
              <span style={bdg("#10b981","#f0fdf4")}>{e.status}</span>
            </div>
            <div style={{fontSize:10,color:"#64748b"}}>{e.to} — {fmt(e.date)}</div>
            <div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4,marginTop:3}}>{e.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsView({reqs,tasks,inventory,mob}){
  const byCat=Object.keys(DEF_CATS).map(c=>({c,n:reqs.filter(r=>r.category===c).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  const maxCat=Math.max(...byCat.map(x=>x.n),1);
  return(
    <div>
      <Grid cols={4} mob={mob}>{PRIORITIES.map(p=><Kpi key={p} value={reqs.filter(r=>r.priority===p).length} label={p} color={PRIORITY_COLOR[p]} mob={mob}/>)}</Grid>
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
        <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Por estado</div>{STATUSES.map(s=>{const c=reqs.filter(r=>r.status===s).length;return c?<div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><SBadge s={s}/><span style={{fontWeight:600}}>{c}</span></div>:null;})}</div>
        <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Por categoría</div>{byCat.length===0?<Empty msg="Sin datos"/>:byCat.map(x=>(
          <div key={x.c} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{x.c}</span><span style={{fontWeight:600}}>{x.n}</span></div><div style={{height:5,background:"#f1f5f9",borderRadius:99}}><div style={{height:5,background:"#6366f1",borderRadius:99,width:(x.n/maxCat*100)+"%"}}/></div></div>
        ))}</div>
        <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Resumen general</div><IR l="Total incidentes" v={reqs.length}/><IR l="Activos" v={reqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status)).length}/><IR l="Cerrados" v={reqs.filter(r=>r.status==="Cerrada").length}/><IR l="Emergencias" v={reqs.filter(r=>r.priority==="Emergencia").length}/><IR l="Órdenes de trabajo" v={tasks.length}/><IR l="Stock crítico" v={(inventory||[]).filter(i=>i.stock<i.minStock).length}/></div>
      </div>
    </div>
  );
}

// FIX #9: ConfigView — headers corregidos, no usar SUPA_KEY como Bearer
function ConfigView({cats,setCats,towers,setTowers,showToast,session,setUsuarios:setUsuariosParent}){
  const [tab,setTab]=useState("cats");
  const [editCat,setEditCat]=useState(null);const [showCF,setShowCF]=useState(false);
  const [editTow,setEditTow]=useState(null);const [showTF,setShowTF]=useState(false);
  const [usuarios,setU]=useState([]);const [showUF,setShowUF]=useState(false);const [editUser,setEditUser]=useState(null);

  // FIX #9: solo usar token de usuario autenticado; si no hay token, solo apikey
  const authH=()=>({
    "Content-Type":"application/json",
    "apikey":SUPA_KEY,
    ...(session?.token?{"Authorization":`Bearer ${session.token}`}:{}),
  });

  useEffect(()=>{if(tab==="usuarios")loadU();},[tab]);

  const loadU=async()=>{
    try{
      const res=await fetch(`${SUPA_URL}/rest/v1/usuarios?order=created_at.asc&select=*`,{headers:authH()});
      const data=await res.json();
      setU(Array.isArray(data)?data:[]);
      if(setUsuariosParent)setUsuariosParent(Array.isArray(data)?data:[]);
    }catch(e){console.error(e);}
  };
  const saveU=async u=>{
    try{
      if(u.isNew){
        await fetch(`${SUPA_URL}/rest/v1/usuarios`,{method:"POST",headers:{...authH(),"Prefer":"return=representation"},body:JSON.stringify({email:u.email,nombre:u.nombre,rol:u.rol,active:true})});
        showToast("Usuario creado");
      }else{
        await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${u.id}`,{method:"PATCH",headers:authH(),body:JSON.stringify({nombre:u.nombre,rol:u.rol,active:u.active??true})});
        showToast("Usuario actualizado");
      }
      loadU();
    }catch(e){showToast("Error: "+e.message,"error");}
    setShowUF(false);setEditUser(null);
  };
  const toggleU=async u=>{
    try{
      await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${u.id}`,{method:"PATCH",headers:authH(),body:JSON.stringify({active:!u.active})});
      loadU();showToast(u.active?"Desactivado":"Activado");
    }catch{showToast("Error","error");}
  };
  const deleteU=async u=>{
    if(!window.confirm("¿Eliminar usuario "+u.nombre+"?"))return;
    try{
      await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${u.id}`,{method:"DELETE",headers:authH()});
      loadU();showToast("Eliminado");
    }catch{showToast("Error","error");}
  };
  const toggleCat=id=>setCats(p=>p.map(c=>c.id===id?{...c,active:!c.active}:c));
  const saveCat=cat=>{if(editCat){setCats(p=>p.map(c=>c.id===cat.id?cat:c));}else{setCats(p=>[...p,{...cat,id:"cat"+uid(),order:p.length}]);}showToast("Guardada");setShowCF(false);setEditCat(null);};
  const toggleTow=id=>setTowers(p=>p.map(t=>t.id===id?{...t,active:!t.active}:t));
  const saveTow=t=>{if(editTow){setTowers(p=>p.map(x=>x.id===t.id?t:x));}else{setTowers(p=>[...p,{...t,id:"t"+uid()}]);}showToast("Guardada");setShowTF(false);setEditTow(null);};
  const sla={Emergencia:"4h",Alta:"24h",Media:"72h",Baja:"7 días"};

  return(
    <div>
      <Tabs tabs={[{id:"cats",label:"Categorías"},{id:"towers",label:"Torres"},{id:"usuarios",label:"Usuarios"},{id:"sla",label:"SLA"}]} active={tab} onChange={setTab}/>
      {tab==="cats"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,color:"#64748b"}}>{cats.filter(c=>c.active).length} activas</div>
            <button style={mkBtn("primary",true)} onClick={()=>{setEditCat(null);setShowCF(true);}}>+ Nueva</button>
          </div>
          <div style={card}>{cats.map(cat=>(
            <div key={cat.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:cat.active?1:.5,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{cat.name}</div><div style={{fontSize:11,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(cat.subs||[]).join(", ")}</div></div>
              <div style={{display:"flex",gap:4}}>
                <button style={mkBtn("secondary",true)} onClick={()=>{setEditCat(cat);setShowCF(true);}}>Editar</button>
                <button style={mkBtn(cat.active?"warning":"success",true)} onClick={()=>toggleCat(cat.id)}>{cat.active?"Desact.":"Activar"}</button>
                <button style={mkBtn("danger",true)} onClick={()=>setCats(p=>p.filter(c=>c.id!==cat.id))}>✕</button>
              </div>
            </div>
          ))}</div>
          {showCF&&<CatForm cat={editCat} onSave={saveCat} onClose={()=>{setShowCF(false);setEditCat(null);}}/>}
        </div>
      )}
      {tab==="towers"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,color:"#64748b"}}>{towers.filter(t=>t.active).length} activas</div>
            <button style={mkBtn("primary",true)} onClick={()=>{setEditTow(null);setShowTF(true);}}>+ Nueva torre</button>
          </div>
          <div style={card}>{towers.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:t.active?1:.5}}>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{t.label}</div></div>
              <div style={{display:"flex",gap:4}}>
                <button style={mkBtn("secondary",true)} onClick={()=>{setEditTow(t);setShowTF(true);}}>Editar</button>
                <button style={mkBtn(t.active?"warning":"success",true)} onClick={()=>toggleTow(t.id)}>{t.active?"Desact.":"Activar"}</button>
                <button style={mkBtn("danger",true)} onClick={()=>setTowers(p=>p.filter(x=>x.id!==t.id))}>✕</button>
              </div>
            </div>
          ))}</div>
          {showTF&&<TowerForm tower={editTow} onSave={saveTow} onClose={()=>{setShowTF(false);setEditTow(null);}}/>}
        </div>
      )}
      {tab==="usuarios"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,color:"#64748b"}}>{usuarios.filter(u=>u.active).length} activos</div>
            <button style={mkBtn("primary",true)} onClick={()=>{setEditUser(null);setShowUF(true);}}>+ Nuevo</button>
          </div>
          {showUF&&<UserForm user={editUser} onSave={saveU} onClose={()=>{setShowUF(false);setEditUser(null);}}/>}
          <div>{usuarios.map(u=>(
            <div key={u.id} style={{...card,marginBottom:8,opacity:u.active?1:.6}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                <div><div style={{fontWeight:700,fontSize:13}}>{u.nombre}</div><div style={{fontSize:11,color:"#64748b"}}>{u.email}</div><span style={bdg("#6366f1","#eef2ff")}>{u.rol}</span></div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  <button style={mkBtn("secondary",true)} onClick={()=>{setEditUser(u);setShowUF(true);}}>Editar</button>
                  <button style={mkBtn(u.active?"warning":"success",true)} onClick={()=>toggleU(u)}>{u.active?"Desact.":"Activar"}</button>
                  <button style={mkBtn("danger",true)} onClick={()=>deleteU(u)}>Eliminar</button>
                </div>
              </div>
            </div>
          ))}</div>
        </div>
      )}
      {tab==="sla"&&(
        <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>SLA por prioridad</div>
          {Object.entries(sla).map(([p,t])=><div key={p} style={{display:"flex",justifyContent:"space-between",marginBottom:10,alignItems:"center"}}><PBadge p={p}/><span style={{fontWeight:600}}>{t}</span></div>)}
        </div>
      )}
    </div>
  );
}

function CatForm({cat,onSave,onClose}){
  const [name,setName]=useState(cat?.name||"");
  const [subs,setSubs]=useState(cat?(cat.subs||[]).join("\n"):"");
  const save=()=>{if(!name.trim())return;const subsArr=subs.split("\n").map(s=>s.trim()).filter(Boolean);if(!subsArr.length)return;onSave({...(cat||{}),name:name.trim(),subs:subsArr,active:cat?cat.active:true});};
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:440,padding:"20px",marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{margin:0,fontSize:15}}>{cat?"Editar":"Nueva"} categoría</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div><div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={name} onChange={e=>setName(e.target.value)}/></div><div style={fg}><label style={lbl}>Subcategorías (una por línea)</label><textarea style={{...inp,height:120,resize:"vertical"}} value={subs} onChange={e=>setSubs(e.target.value)}/></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={save}>Guardar</button></div></div></div>);
}

function TowerForm({tower,onSave,onClose}){
  const [name,setName]=useState(tower?.name||"");const [label,setLabel]=useState(tower?.label||"");
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:380,padding:"20px",marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{margin:0,fontSize:15}}>{tower?"Editar":"Nueva"} torre</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div><div style={fg}><label style={lbl}>Código</label><input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="ej: 1036"/></div><div style={fg}><label style={lbl}>Nombre</label><input style={inp} value={label} onChange={e=>setLabel(e.target.value)} placeholder="ej: Torre 1036"/></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!name.trim()||!label.trim())return;onSave({...(tower||{}),name:name.trim(),label:label.trim(),active:tower?tower.active:true});}}>Guardar</button></div></div></div>);
}

function UserForm({user,onSave,onClose}){
  const [f,setF]=useState(user?{...user,isNew:false}:{nombre:"",email:"",rol:"Residente",active:true,isNew:true});
  const [rol,setRol]=useState(user?.rol||"Residente");
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:440,padding:"20px",marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><h3 style={{margin:0,fontSize:15}}>{user?"Editar":"Nuevo"} usuario</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div><div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={f.nombre} onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/></div><div style={fg}><label style={lbl}>Correo *</label><input type="email" style={inp} value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))} disabled={!!user}/></div><div style={fg}><label style={lbl}>Rol</label><select style={selSt} value={rol} onChange={e=>{setRol(e.target.value);setF(p=>({...p,rol:e.target.value}));}}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>{!user&&<div style={{...alrt("info"),fontSize:11,marginTop:4}}>Recuerde crear el usuario en Supabase Auth con el mismo correo.</div>}<div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.nombre.trim()||!f.email.trim())return;onSave({...f,rol});}}>Guardar</button></div></div></div>);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({reqs,tasks,mant,role,onOpen,onNew,mob}){
  const emerg=reqs.filter(r=>r.priority==="Emergencia"&&!["Cerrada","Rechazada"].includes(r.status));
  const recent=[...reqs].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,5);
  const mv=mant.filter(m=>getMantStatus(m)==="Vencida").length;
  const mp=mant.filter(m=>getMantStatus(m)==="Por vencer").length;
  return(
    <div>
      {emerg.map(e=>(
        <div key={e.id} style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",cursor:"pointer",display:"flex",alignItems:"center",gap:10}} onClick={()=>onOpen(e)}>
          <span style={{fontWeight:700,color:"#dc2626"}}>⚠</span>
          <div><strong style={{color:"#dc2626"}}>EMERGENCIA: {e.code}</strong><div style={{fontSize:12,color:"#ef4444"}}>{e.category}</div></div>
        </div>
      ))}
      {(mv>0||mp>0)&&(
        <div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:"#92400e",fontWeight:700}}>!</span>
          <div><strong style={{color:"#92400e"}}>{mv>0?mv+" vencida(s)":""}{mv>0&&mp>0?" / ":""}{mp>0?mp+" por vencer":""}</strong><div style={{fontSize:11,color:"#b45309"}}>Revisar módulo Mantención</div></div>
        </div>
      )}
      <Grid cols={4} mob={mob}>
        <Kpi value={reqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status)).length} label="Incidentes activos" color="#3b82f6" mob={mob}/>
        <Kpi value={reqs.filter(r=>r.priority==="Emergencia").length} label="Emergencias" color="#ef4444" mob={mob}/>
        <Kpi value={reqs.filter(r=>r.status==="En proceso").length} label="En proceso" color="#8b5cf6" mob={mob}/>
        <Kpi value={mv+mp} label="Mant. urgentes" color="#f97316" mob={mob}/>
      </Grid>
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"2fr 1fr",gap:14}}>
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:600,fontSize:13}}>Incidentes recientes</div>
            {can(role,"create")&&<button style={mkBtn("primary",true)} onClick={onNew}>+ Nuevo</button>}
          </div>
          {recent.length===0?<Empty msg="Sin incidentes aún"/>:mob?(
            <div>{recent.map(r=>(
              <div key={r.id} style={{padding:"8px 0",borderBottom:"1px solid #f1f5f9",cursor:"pointer",display:"flex",justifyContent:"space-between"}} onClick={()=>onOpen(r)}>
                <div><span style={{fontWeight:600,color:"#3b82f6",fontSize:12}}>{r.code}</span><div style={{fontSize:11,color:"#64748b"}}>{r.category}</div></div>
                <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}><PBadge p={r.priority}/><SBadge s={r.status}/></div>
              </div>
            ))}</div>
          ):(
            <table style={tbl}><thead><tr>{["ID","Categoría","Prioridad","Estado","Fecha"].map(h=><th key={h} style={thSt}>{h}</th>)}</tr></thead>
            <tbody>{recent.map(r=>(
              <tr key={r.id} style={{cursor:"pointer"}} onClick={()=>onOpen(r)}>
                <td style={tdSt}><span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span></td>
                <td style={tdSt}>{r.category}</td>
                <td style={tdSt}><PBadge p={r.priority}/></td>
                <td style={tdSt}><SBadge s={r.status}/></td>
                <td style={tdSt}><span style={{fontSize:11,color:"#64748b"}}>{fmtD(r.createdAt)}</span></td>
              </tr>
            ))}</tbody></table>
          )}
        </div>
        <div style={card}>
          <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Accesos rápidos</div>
          <a href="https://app.comunidadfeliz.com/" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"12px",borderRadius:8,background:"#f0fdf4",border:"1px solid #86efac",textDecoration:"none",marginBottom:8}}>
            <span style={{fontSize:24}}>🏘</span>
            <div><div style={{fontSize:13,fontWeight:600,color:"#16a34a"}}>Comunidad Feliz</div><div style={{fontSize:11,color:"#64748b"}}>Portal de pagos en línea</div></div>
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App(){
  const mob=useMob();
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("dashboard");
  const [reqs,setReqs]=useState([]);
  const [tasks,setTasks]=useState([]);
  const [atts,setAtts]=useState([]);
  const [emails,setEmails]=useState([]);
  const [inspections,setInsp]=useState([]);
  const [inventory,setInv]=useState([]);
  const [mant,setMant]=useState([]);
  const [cats,setCats]=useState(Object.entries(DEF_CATS).map(([name,subs],i)=>({id:"cat"+i,name,subs,active:true,order:i})));
  const [towers,setTowers]=useState([
    {id:"t1",name:"1036",label:"12 Norte 1036",active:true},
    {id:"t2",name:"1038",label:"12 Norte 1038",active:true},
    {id:"t3",name:"1052",label:"12 Norte 1052",active:true},
    {id:"t4",name:"1054",label:"12 Norte 1054",active:true},
    {id:"t5",name:"1060",label:"3 Oriente 1060",active:true},
    {id:"t6",name:"1061",label:"4 Oriente 1061",active:true},
    {id:"t7",name:"1080",label:"3 Oriente 1080",active:true},
    {id:"t8",name:"1081",label:"4 Oriente 1081",active:true},
  ]);
  const [usuarios,setUsuarios]=useState([]);
  const [selReq,setSelReq]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [toast,setToast]=useState(null);
  const [navOpen,setNavOpen]=useState(false);
  // FIX #5: IDs de incidentes creados en la sesión actual (para guests)
  const [sessionReqIds,setSessionReqIds]=useState([]);

  const er=session?.rol||"Residente";
  const showToast=(msg,type?)=>{setToast({msg,type:type||"success"});setTimeout(()=>setToast(null),3200);};

  const handleLogin=(user)=>{
    setSession(user);
    if(user.openNewReq)setShowNew(true);
    if(user.startView)setView(user.startView);
  };
  const handleLogout=async()=>{
    if(session?.token)authSignOut(session.token).catch(()=>{});
    setSession(null);setView("dashboard");setSessionReqIds([]);
  };

  useEffect(()=>{setLoading(false);},[]);

  useEffect(()=>{
    if(!session)return;
    (async()=>{
      try{
        const [rR,rT,rI,rM,rIn,rE,rU]=await Promise.all([
          dbGet("solicitudes","?order=created_at.desc"),
          dbGet("tareas","?order=id.asc"),
          dbGet("inventario","?order=id.asc"),
          dbGet("mantenciones","?order=id.asc"),
          dbGet("inspecciones","?order=id.asc"),
          dbGet("correos","?order=id.asc"),
          fetch(`${SUPA_URL}/rest/v1/usuarios?active=eq.true&select=*`,{headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`}}).then(r=>r.json()),
        ]);
        if(rR)setReqs(rR.map(r=>normalizeReq(r.data)).filter(Boolean));
        if(rT)setTasks(rT.map(r=>normalizeTask(r.data)).filter(Boolean));
        if(rI)setInv(rI.map(r=>r.data).filter(Boolean));
        if(rM)setMant(rM.map(r=>normalizeMant(r.data)).filter(Boolean));
        if(rIn)setInsp(rIn.map(r=>normalizeInsp(r.data)).filter(Boolean));
        if(rE)setEmails(rE.map(r=>r.data).filter(Boolean));
        if(rU)setUsuarios(Array.isArray(rU)?rU:[]);
      }catch(e){console.error("Error cargando datos:",e);}
    })();
  },[session]);

  // FIX #8: persistencia con updatedAt en lugar de JSON.stringify completo
  const persistReq  = async item=>{try{await dbUpsert("solicitudes",{id:item.id,code:item.code,created_at:item.createdAt,data:item});}catch(e){console.error(e);}};
  const persistTask = async item=>{try{await dbPost("tareas",{id:item.id,request_id:item.requestId,data:item});}catch{try{await dbPatch("tareas",item.id,{data:item});}catch(e){console.error(e);}}};
  const persistInv  = async item=>{try{await dbPost("inventario",{id:item.id,data:item});}catch{try{await dbPatch("inventario",item.id,{data:item});}catch(e){console.error(e);}}};
  const persistMant = async item=>{try{await dbPost("mantenciones",{id:item.id,data:item});}catch{try{await dbPatch("mantenciones",item.id,{data:item});}catch(e){console.error(e);}}};
  const persistInsp = async item=>{try{await dbPost("inspecciones",{id:item.id,data:item});}catch{try{await dbPatch("inspecciones",item.id,{data:item});}catch(e){console.error(e);}}};
  const persistEmail= async item=>{try{await dbPost("correos",{id:item.id,request_id:item.requestId||"",data:item});}catch(e){console.error(e);}};

  // FIX #8: comparar por updatedAt/createdAt en vez de JSON.stringify
  const hasChanged=(oldItem,newItem)=>{
    if(!oldItem)return true;
    return (newItem.updatedAt||newItem.createdAt||"")!==(oldItem.updatedAt||oldItem.createdAt||"");
  };
  const setReqsDB  = updater=>setReqs(prev=>{const next=typeof updater==="function"?updater(prev):updater;next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(hasChanged(old,item))persistReq(item);});return next;});
  const setTasksDB = updater=>setTasks(prev=>{const next=typeof updater==="function"?updater(prev):updater;next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(hasChanged(old,item))persistTask(item);});return next;});
  const setInvDB   = updater=>setInv(prev=>{const next=typeof updater==="function"?updater(prev):updater;next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(hasChanged(old,item))persistInv(item);});return next;});
  const setMantDB  = updater=>setMant(prev=>{const next=typeof updater==="function"?updater(prev):updater;next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(hasChanged(old,item))persistMant(item);});return next;});
  const setInspDB  = updater=>setInsp(prev=>{const next=typeof updater==="function"?updater(prev):updater;next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(hasChanged(old,item))persistInsp(item);});return next;});

  const addEmail=async log=>{
    const item={id:"e"+uid(),...log};
    setEmails(p=>[item,...p]);
    await persistEmail(item);
    await sendRealEmail(log.to,log.subject,log.body);
  };

  const go=id=>{setView(id);setSelReq(null);setNavOpen(false);};
  const openReq=r=>{setSelReq(r);setView("detail");setNavOpen(false);};

  const NAV_ITEMS=[
    {id:"dashboard",    label:"🏠 Dashboard",          roles:["Administrador","Administrador Edificio","Conserjeria","Comite"]},
    {id:"requests",     label:"🚨 Incidentes",          roles:["Administrador","Administrador Edificio","Conserjeria","Residente","Comite"]},
    {id:"estacionamientos",label:"🅿 Estacionamientos", roles:["Administrador","Administrador Edificio","Conserjeria","Residente"]},
    {id:"bodegas",      label:"🏪 Bodegas",             roles:["Administrador","Administrador Edificio","Conserjeria"]},
    {id:"gastos",       label:"💰 Gastos Comunes",      roles:["Administrador","Administrador Edificio","Conserjeria","Residente"]},
    {id:"tasks",        label:"🔧 Órdenes de Trabajo",  roles:["Administrador","Administrador Edificio","Conserjeria"]},
    {id:"inspections",  label:"📋 Novedades",           roles:["Administrador","Administrador Edificio","Conserjeria","Comite"]},
    {id:"inventory",    label:"📦 Inventario",          roles:["Administrador","Administrador Edificio","Conserjeria","Comite"]},
    {id:"mantencion",   label:"⚙ Mantención",           roles:["Administrador","Administrador Edificio","Conserjeria","Comite"]},
    {id:"emails",       label:"📧 Correos",             roles:["Administrador","Administrador Edificio"]},
    {id:"reports",      label:"📊 Reportes",            roles:["Administrador","Administrador Edificio","Comite"]},
    {id:"config",       label:"⚙ Config",               roles:["Administrador"]},
  ].filter(n=>n.roles.includes(er));

  const isAct=id=>view===id||(view==="detail"&&id==="requests");

  if(loading)return <Loader/>;
  if(!session)return <LoginScreen onLogin={handleLogin}/>;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",fontFamily:"system-ui,sans-serif",background:"#f1f5f9",color:"#1e293b",overflow:"hidden"}}>
      {mob&&(
        <div style={{background:"#0f172a",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:60}}>
          <div onClick={()=>go("dashboard")} style={{color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>🏢 Comunidad 12 Norte</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={bdg("#fff","#1e3a5f")}>{er}</span>
            <button style={{background:"none",border:"none",color:"#fff",fontSize:22,cursor:"pointer"}} onClick={()=>setNavOpen(p=>!p)}>{navOpen?"✕":"☰"}</button>
          </div>
        </div>
      )}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {(!mob||navOpen)&&(
          <div style={{width:220,background:"#0f172a",display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto",position:mob?"absolute":"relative" as const,top:mob?40:0,left:0,bottom:0,zIndex:50}}>
            {!mob&&(
              <div onClick={()=>go("dashboard")} style={{padding:"18px 14px 14px",borderBottom:"1px solid #1e293b",cursor:"pointer"}}>
                <div style={{color:"#fff",fontWeight:700,fontSize:14}}>🏢 Comunidad 12 Norte</div>
                <div style={{color:"#64748b",fontSize:11,marginTop:2}}>Sistema de Gestión</div>
              </div>
            )}
            <nav style={{padding:"6px 0",flex:1}}>
              {NAV_ITEMS.map(n=>(
                <div key={n.id} onClick={()=>go(n.id)} style={{padding:"10px 14px",cursor:"pointer",userSelect:"none",fontSize:13,color:isAct(n.id)?"#fff":"#94a3b8",background:isAct(n.id)?"#1e3a5f":"transparent",borderLeft:isAct(n.id)?"3px solid #3b82f6":"3px solid transparent",fontWeight:isAct(n.id)?600:400}}>
                  {n.label}
                </div>
              ))}
            </nav>
            <div style={{padding:"10px 14px",borderTop:"1px solid #1e293b"}}>
              <div style={{marginBottom:10}}>
                <div style={{color:"#fff",fontSize:12,fontWeight:600,marginBottom:2}}>{session.nombre}</div>
                <div style={{color:"#64748b",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.email}</div>
                <span style={bdg("#93c5fd","#1e3a5f")}>{session.rol}</span>
              </div>
              <button style={{...mkBtn("danger",true),width:"100%",justifyContent:"center"}} onClick={handleLogout}>Cerrar sesión</button>
            </div>
          </div>
        )}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
            <div style={{fontWeight:700,fontSize:mob?15:17,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {view==="detail"?"Detalle Incidente":(NAV_ITEMS.find(n=>n.id===view)||{label:view.charAt(0).toUpperCase()+view.slice(1)}).label}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
              {can(er,"create")&&<button style={mkBtn("primary",mob)} onClick={()=>setShowNew(true)}>{mob?"+ Inc.":"+ Nuevo Incidente"}</button>}
              {!mob&&<span style={{...bdg("#fff","#1e3a5f"),fontSize:12,padding:"5px 10px"}}>{er}</span>}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
            {view==="dashboard"      &&<Dashboard reqs={reqs} tasks={tasks} mant={mant} role={er} onOpen={openReq} onNew={()=>setShowNew(true)} mob={mob}/>}
            {view==="requests"       &&<IncidentesView reqs={reqs} role={er} onOpen={openReq} setReqs={setReqsDB} showToast={showToast} addEmail={addEmail} mob={mob} towers={towers} resps={usuarios} session={session} sessionReqIds={sessionReqIds}/>}
            {view==="detail"&&selReq &&<IncDetail req={selReq} reqs={reqs} tasks={tasks} atts={atts} emails={emails} role={er} setReqs={setReqsDB} setTasks={setTasksDB} setAtts={setAtts} addEmail={addEmail} showToast={showToast} onBack={()=>setView("requests")} setSelReq={setSelReq} mob={mob} resps={usuarios}/>}
            {view==="estacionamientos"&&<EstacionamientosView mob={mob} showToast={showToast} role={er}/>}
            {view==="bodegas"        &&<BodegasView showToast={showToast} mob={mob}/>}
            {view==="gastos"         &&<GastosPagos addEmail={addEmail} showToast={showToast} mob={mob}/>}
            {view==="tasks"          &&<TasksView tasks={tasks} reqs={reqs} role={er} setTasks={setTasksDB} mob={mob}/>}
            {view==="inspections"    &&<InspView inspections={inspections} setInsp={setInspDB} showToast={showToast} role={er} mob={mob} towers={towers}/>}
            {view==="inventory"      &&<InvView inventory={inventory} setInv={setInvDB} role={er} showToast={showToast} mob={mob}/>}
            {view==="mantencion"     &&<MantView mant={mant} setMant={setMantDB} role={er} showToast={showToast} mob={mob} resps={usuarios} towers={towers}/>}
            {view==="emails"         &&<EmailsView logs={emails} setEmails={setEmails} role={er}/>}
            {view==="reports"        &&<ReportsView reqs={reqs} tasks={tasks} inventory={inventory} mob={mob}/>}
            {view==="config"         &&<ConfigView cats={cats} setCats={setCats} towers={towers} setTowers={setTowers} showToast={showToast} session={session} setUsuarios={setUsuarios}/>}
          </div>
        </div>
      </div>

      {showNew&&(
        <NewIncModal role={er} reqs={reqs} setReqs={setReqsDB} addEmail={addEmail} showToast={showToast}
          onClose={()=>{setShowNew(false);if(er==="Residente")handleLogout();else setView("requests");}}
          onOpen={openReq} cats={cats} towers={towers} session={session}
          onReqCreated={(code)=>setSessionReqIds(p=>[...p,code])}/>
      )}
      {toast&&(
        <div style={{...alrt(toast.type),position:"fixed",bottom:20,right:16,left:mob?16:"auto",zIndex:2000,boxShadow:"0 4px 12px rgba(0,0,0,.15)",minWidth:mob?undefined:260}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
