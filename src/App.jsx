import { useState, useEffect, useRef } from "react";

const SUPA_URL = "https://ijefrrtdtjshfquuytic.supabase.co";
const SUPA_KEY = "sb_publishable_sZTDO3ROm8IEnzbWuEUK-w_DeOz65XG";

const dbFetch = async (table, method="GET", body=null, filter="") => {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`, {
    method,
    headers: {
      "Content-Type":"application/json",
      "apikey": SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
      "Prefer": method==="POST"?"return=representation":method==="PATCH"?"return=representation":"",
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
const dbUpsert = (t, b)     => fetch(`${SUPA_URL}/rest/v1/${t}`,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify(b)});

const authSignIn = async (email, password) => {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{
    method:"POST", headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
    body: JSON.stringify({email,password}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description||data.msg||"Error al iniciar sesion");
  return data;
};
const authSignOut = async (token) => {
  await fetch(`${SUPA_URL}/auth/v1/logout`,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${token}`}});
};

const normalizeReq = (r) => ({
  comments:[], history:[], relatedTasks:[], attachmentsInitial:[],
  attachmentsProgress:[], attachmentsClosure:[], emailLogIds:[],
  assignedTo:"Sin asignar", dueDate:null, isUrgent:false,
  ...(r||{}),
});
const normalizeTask = (t) => ({
  comments:[], attachments:[], materials:[], status:"Ingresada",
  ...(t||{}),
});
const normalizeMant = (m) => ({
  history:[], comments:[], documents:[],
  ...(m||{}),
});
const normalizeInsp = (i) => ({
  items: mkItems(),
  ...(i||{}),
  items: mkItems((i||{}).items),
});
const normalizeOrder = (o) => ({
  photoBefore:[], photoAfter:[], history:[],
  ...(o||{}),
});

const ROLES      = ["Administrador","Administrador Edificio","Conserjeria","Residente","Comite","Proveedor"];
const ADMIN_CATS = {
  "Gestión":["Circular informativa","Acta de reunión","Carta a residente","Aviso general","Otro"],
  "Finanzas":["Pago de gastos comunes","Deuda morosa","Cotización","Factura proveedor","Fondo de reserva","Otro"],
  "Documentos":["Solicitud de certificado","Reglamento interno","Contrato proveedor","Permiso municipal","Otro"],
  "Comité":["Convocatoria reunión","Acuerdo de comité","Votación","Otro"],
  "Legal":["Reclamo residente","Infracción reglamento","Denuncia","Mediación","Otro"],
  "Proveedores":["Solicitud de cotización","Evaluación proveedor","Término de contrato","Otro"],
};
const STATUSES   = ["Ingresada","En revision","Asignada","En proceso","Resuelta","Cerrada","Rechazada"];
const PRIORITIES = ["Emergencia","Alta","Media","Baja"];
const STATUS_COLOR   = {Ingresada:"#6366f1","En revision":"#f59e0b",Asignada:"#3b82f6","En proceso":"#8b5cf6",Resuelta:"#10b981",Cerrada:"#6b7280",Rechazada:"#ef4444"};
const PRIORITY_COLOR = {Emergencia:"#ef4444",Alta:"#f97316",Media:"#f59e0b",Baja:"#6b7280"};
const PRIORITY_BG    = {Emergencia:"#fef2f2",Alta:"#fff7ed",Media:"#fffbeb",Baja:"#f9fafb"};
const WS_LABEL = {Pendiente:"Pendiente",Aceptado:"Aceptado",Diagnostico:"Diagnostico",Ejecucion:"Ejecucion",Ejecutado:"Ejecutado",Cerrado:"Cerrado",Rechazado:"Rechazado"};
const WS_COLOR = {Pendiente:"#f59e0b",Aceptado:"#3b82f6",Diagnostico:"#8b5cf6",Ejecucion:"#6366f1",Ejecutado:"#10b981",Cerrado:"#6b7280",Rechazado:"#ef4444"};
const MAT_STATUS = ["Por adquirir","Adquirido","Entregado"];
const MAT_COLOR  = {"Por adquirir":"#f59e0b",Adquirido:"#6366f1",Entregado:"#10b981"};
const INV_CATS   = ["Herramientas","Electrico","Plomeria","Pintura","Limpieza","Jardines","Perimetral","Motor","Otros"];
const INV_UNITS  = ["unidad","caja","kg","litro","metro","rollo","par","juego"];
const RESP_LIST_DEFAULT  = ["Carlos Munoz","Ana Garcia","Pedro Soto","Maria Lopez","Jose Fernandez","Sin asignar"];
const RESP_ASSIGNABLE_DEFAULT = RESP_LIST_DEFAULT.filter(r=>r!=="Sin asignar");
const getRespList  = (resps) => resps&&resps.length ? [...resps.filter(r=>r.active).map(r=>r.name),"Sin asignar"] : RESP_LIST_DEFAULT;
const getRespAssignable = (resps) => resps&&resps.length ? resps.filter(r=>r.active).map(r=>r.name) : RESP_ASSIGNABLE_DEFAULT;
const SECTOR_LIST= ["Torre A","Torre B","Torre C","Zona norte","Zona sur","Estacionamientos","Perimetro exterior","Jardines","Techumbres"];
const URGENCY_LEVELS = ["Baja","Media","Alta","Critica"];
const URGENCY_COLOR  = {Baja:"#6b7280",Media:"#f59e0b",Alta:"#f97316",Critica:"#ef4444"};
const ITEM_STATES= ["Bueno","Regular","Malo","No aplica"];
const ITEM_COLOR = {Bueno:"#10b981",Regular:"#f59e0b",Malo:"#ef4444","No aplica":"#94a3b8","":"#d1d5db"};
const ALL_MODS   = ["Solicitudes","Tareas","Novedades","Inventario","Correos","Reportes","Mantencion","Config"];
const MANT_CATS  = ["Equipos/Maquinaria","Infraestructura","Sistemas"];
const MANT_SUBCATS = {
  "Equipos/Maquinaria":["Ascensor","Motor porton","Bomba agua","Bomba calor","Generador","Otro"],
  "Infraestructura":["Techumbres","Fachadas","Piscina","Quincho","Sala eventos","Otro"],
  "Sistemas":["Electrico","Gas","Agua potable","Citofonia","Camaras","Otro"],
};
const MANT_TIPOS   = ["Preventiva","Correctiva","Certificacion","Revision tecnica"];
const MANT_ESTADOS = ["Vigente","Por vencer","Vencida","En ejecucion","Completada"];
const MANT_SC = {Vigente:"#10b981","Por vencer":"#f59e0b",Vencida:"#ef4444","En ejecucion":"#6366f1",Completada:"#6b7280"};
const MANT_SB = {Vigente:"#f0fdf4","Por vencer":"#fffbeb",Vencida:"#fef2f2","En ejecucion":"#eef2ff",Completada:"#f9fafb"};
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
const CL_SECTIONS = [
  {id:"s1",label:"Cierres perimetrales",items:["Reja perimetral","Porton peatonal","Porton vehicular","Cerraduras","Bisagras","Automatizacion","Citofonia","Senaletica"]},
  {id:"s2",label:"Jardines",items:["Cesped","Arboles","Arbustos","Macizos","Sistema riego","Podas","Maleza","Estado general"]},
  {id:"s3",label:"Iluminacion",items:["Luminarias ext","Luminarias pasillos","Luces acceso","Luces estacionamiento","Alumbrado perimetral","Cableado visible","Interruptores"]},
  {id:"s4",label:"Mobiliario",items:["Bancas","Basureros","Juegos infantiles","Bicicleteros","Senaletica interior","Barandas","Rejas interiores"]},
  {id:"s5",label:"Canerias y drenajes",items:["Canerias visibles","Filtraciones","Goteras","Llaves de paso","Sumideros","Canaletas","Bajadas de agua","Acumulacion agua"]},
  {id:"s6",label:"Techumbres",items:["Techo principal","Cubiertas","Tejas","Sellos","Senales humedad","Riesgo desprendimiento"]},
  {id:"s7",label:"Muros y fachadas",items:["Muros perimetrales","Fachadas","Grietas","Humedad","Pintura deteriorada","Revestimientos","Vandalismo"]},
  {id:"s8",label:"Circulaciones",items:["Veredas","Pavimentos","Escaleras","Rampas","Pasamanos","Estacionamientos","Senalizacion","Obstaculos"]},
  {id:"s9",label:"Aseo",items:["Limpieza areas comunes","Basura","Escombros","Graffitis","Olores"]},
];
const PERMS = {
  Administrador:["create","viewAll","assign","changeStatus","closeCases","createTask","viewReports","viewEmails","manageConfig","comment","inspection","inventory","viewAs","manageWork","mantencion","mantRead"],
  "Administrador Edificio":["create","viewAll","assign","changeStatus","closeCases","createTask","viewReports","viewEmails","comment","inspection","inventory","manageWork","mantencion","mantRead"],
  Conserjeria:["create","viewOps","changeStatusLimited","comment","inspection","inventory","manageWork","mantencion","mantRead"],
  Residente:["create","viewOwn"],
  Comite:["viewAll","viewReports","inspectionRead","inventoryRead","mantRead"],
  Proveedor:["viewAssigned","recordProgress","uploadEvidence","resolveTask","comment","providerDash"],
};
const can = (role, action) => (PERMS[role]||[]).includes(action);

const fmt   = d => { try { return new Date(d).toLocaleString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); } catch { return String(d); }};
const fmtD  = d => { try { return new Date(d).toLocaleDateString("es-CL"); } catch { return String(d); }};
const uid   = () => Math.random().toString(36).slice(2,9);
const genCode = (arr,pfx) => { const nums=(arr||[]).map(r=>parseInt(((r.id||r.code||"")).replace(/\D/g,""))||0); return pfx+String((nums.length?Math.max(0,...nums):0)+1).padStart(3,"0"); };
const addDays = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r.toISOString().slice(0,10); };

function getMantStatus(m) {
  if (!m) return "Vigente";
  if (m.status==="En ejecucion"||m.status==="Completada") return m.status;
  if (!m.nextDate) return "Vigente";
  const diff = (new Date(m.nextDate)-new Date())/86400000;
  if (diff<0)  return "Vencida";
  if (diff<=30) return "Por vencer";
  return "Vigente";
}
const mkItems = (ov) => {
  const o=ov||{}, items={};
  CL_SECTIONS.forEach(s=>s.items.forEach(n=>{
    const k=s.id+"_"+n;
    items[k]={state:"",obs:"",urgency:"",images:[],reqId:null,...(o[k]||{})};
  }));
  return items;
};

const bdg  = (c,bg) => ({display:"inline-flex",alignItems:"center",padding:"2px 6px",borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,whiteSpace:"nowrap"});
const mkBtn= (v,sm) => {
  const base={display:"inline-flex",alignItems:"center",gap:4,padding:sm?"4px 8px":"7px 12px",borderRadius:6,fontSize:sm?11:13,fontWeight:600,cursor:"pointer",border:"none",lineHeight:1.2};
  const vs={primary:{background:"#3b82f6",color:"#fff"},secondary:{background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0"},danger:{background:"#ef4444",color:"#fff"},success:{background:"#10b981",color:"#fff"},ghost:{background:"transparent",color:"#6b7280"},warning:{background:"#f59e0b",color:"#fff"},purple:{background:"#8b5cf6",color:"#fff"}};
  return {...base,...(vs[v||"primary"])};
};
const card ={background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px",marginBottom:12};
const inp  ={width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box"};
const selSt={width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box"};
const lbl  ={fontSize:12,fontWeight:600,color:"#374151",marginBottom:3,display:"block"};
const fg   ={marginBottom:10};
const thSt ={textAlign:"left",padding:"6px 8px",borderBottom:"2px solid #e2e8f0",fontWeight:600,fontSize:10,color:"#6b7280",textTransform:"uppercase",whiteSpace:"nowrap"};
const tdSt ={padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",fontSize:12};
const tbl  ={width:"100%",borderCollapse:"collapse",fontSize:12};
const kpiSt={background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px"};
const alrt = t=>({padding:"8px 12px",borderRadius:6,fontSize:12,marginBottom:10,background:t==="error"?"#fef2f2":t==="success"?"#f0fdf4":t==="warning"?"#fffbeb":"#eff6ff",color:t==="error"?"#dc2626":t==="success"?"#16a34a":t==="warning"?"#92400e":"#1d4ed8",border:"1px solid "+(t==="error"?"#fca5a5":t==="success"?"#86efac":t==="warning"?"#fde68a":"#bfdbfe")});
const modal={position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"8px",overflowY:"auto"};
const thumb={width:64,height:48,objectFit:"cover",borderRadius:6,border:"1px solid #e2e8f0"};

function useMob() {
  const [m,setM]=useState(window.innerWidth<768);
  useEffect(()=>{const h=()=>setM(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return m;
}

function SBadge({s}){const c=STATUS_COLOR[s]||WS_COLOR[s]||"#64748b";return <span style={bdg(c,c+"22")}>{WS_LABEL[s]||s}</span>;}
function PBadge({p}){return <span style={{...bdg(PRIORITY_COLOR[p]||"#64748b",PRIORITY_BG[p]||"#f9fafb"),fontWeight:700}}>{p==="Emergencia"?"⚠ ":""}{p}</span>;}
function MBadge({m}){const st=getMantStatus(m);const dot=st==="Vigente"?"✓":st==="Por vencer"?"!":st==="Vencida"?"✗":st==="En ejecucion"?"~":"-";return <span style={bdg(MANT_SC[st]||"#64748b",MANT_SB[st]||"#f9fafb")}>{dot} {st}</span>;}
function IR({l,v}){return <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600}}>{v==null?"---":String(v)}</span></div>;}
function Empty({msg}){return <div style={{textAlign:"center",padding:"40px 20px",color:"#94a3b8",fontSize:13}}>{msg}</div>;}
function Kpi({value,label,color,mob}){return <div style={{...kpiSt,borderTop:"3px solid "+color}}><div style={{fontSize:mob?18:24,fontWeight:700,color}}>{value}</div><div style={{fontSize:11,color:"#64748b",marginTop:3}}>{label}</div></div>;}
function Grid({cols,mob,children}){return <div style={{display:"grid",gridTemplateColumns:"repeat("+(mob?2:cols)+",1fr)",gap:12,marginBottom:16}}>{children}</div>;}
function Tabs({tabs,active,onChange,accent}){
  const ac=accent||"#3b82f6";
  return <div style={{display:"flex",borderBottom:"2px solid #e2e8f0",marginBottom:12,overflowX:"auto"}}>{tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{...mkBtn("ghost"),borderRadius:0,padding:"8px 12px",whiteSpace:"nowrap",borderBottom:active===t.id?"2px solid "+ac:"2px solid transparent",marginBottom:-2,color:active===t.id?ac:"#64748b",fontWeight:active===t.id?700:400}}>{t.label}</button>)}</div>;
}
function Loader(){return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16,background:"#f1f5f9"}}><div style={{width:40,height:40,border:"4px solid #e2e8f0",borderTop:"4px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{color:"#64748b",fontSize:14}}>Cargando datos...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;}

function LoginScreen({onLogin}) {
  const [mode,setMode]=useState(null); // null | "residente" | "personal"
  const [email,setEmail]=useState("");
  const [pass,setPass]  =useState("");
  const [load,setLoad]  =useState(false);
  const [err,setErr]    =useState("");

  const submit = async () => {
    if (!email||!pass){setErr("Ingrese correo y contraseña");return;}
    setLoad(true);setErr("");
    try {
      const auth = await authSignIn(email,pass);
      const res  = await fetch(`${SUPA_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&active=eq.true`,{headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${auth.access_token}`}});
      const users= await res.json();
      if (!users||users.length===0) throw new Error("Usuario no encontrado o inactivo");
      onLogin({...users[0],token:auth.access_token});
    } catch(e){setErr(e.message||"Credenciales incorrectas");}
    setLoad(false);
  };

  const enterResidente = () => {
    onLogin({id:"guest-residente",nombre:"Residente",email:"",rol:"Residente",token:null,openNewReq:true});
  };

  // ── PANTALLA INICIAL ────────────────────────────────────────────────────────
  if (!mode) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{background:"#0f172a",borderRadius:16,width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:28}}>🏢</div>
          <div style={{fontWeight:700,fontSize:24,color:"#0f172a"}}>CondoAdmin</div>
          <div style={{color:"#64748b",fontSize:14,marginTop:4}}>Sistema de Gestión de Condominios</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={()=>setMode("residente")} style={{background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(59,130,246,.35)",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
            <div style={{fontSize:36,flexShrink:0}}>🏠</div>
            <div style={{textAlign:"left"}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:17}}>Soy Residente</div>
              <div style={{color:"#bfdbfe",fontSize:12,marginTop:2}}>Crea o consulta tus solicitudes fácilmente</div>
            </div>
            <div style={{marginLeft:"auto",color:"#bfdbfe",fontSize:20}}>→</div>
          </button>
          <button onClick={()=>setMode("personal")} style={{background:"linear-gradient(135deg,#0f172a,#1e3a5f)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(0,0,0,.25)",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
            <div style={{fontSize:36,flexShrink:0}}>🔑</div>
            <div style={{textAlign:"left"}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:17}}>Acceso Personal</div>
              <div style={{color:"#94a3b8",fontSize:12,marginTop:2}}>Administración, Conserjería, Comité</div>
            </div>
            <div style={{marginLeft:"auto",color:"#94a3b8",fontSize:20}}>→</div>
          </button>
        </div>
      </div>
    </div>
  );

  // ── LOGIN RESIDENTE ─────────────────────────────────────────────────────────
  if (mode==="residente") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"linear-gradient(160deg,#1d4ed8,#3b82f6)",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>setMode(null)} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",marginBottom:24,display:"flex",alignItems:"center",gap:6}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:12}}>🏠</div>
          <div style={{fontWeight:700,fontSize:22,color:"#fff"}}>Acceso Residentes</div>
          <div style={{color:"#bfdbfe",fontSize:13,marginTop:4}}>Ingresa directo para crear tu solicitud</div>
        </div>
        <button onClick={enterResidente} style={{width:"100%",padding:"16px",background:"#fff",color:"#1d4ed8",border:"none",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
          Ingresar como Residente →
        </button>
        <div style={{color:"#bfdbfe",fontSize:11,textAlign:"center",marginTop:16}}>No necesitas contraseña</div>
      </div>
    </div>
  );

  // ── LOGIN PERSONAL ──────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",fontFamily:"system-ui,sans-serif",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>{setMode(null);setErr("");}} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#94a3b8",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",marginBottom:24,display:"flex",alignItems:"center",gap:6}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:12}}>🔑</div>
          <div style={{fontWeight:700,fontSize:22,color:"#fff"}}>Acceso Personal</div>
          <div style={{color:"#64748b",fontSize:13,marginTop:4}}>Administración · Conserjería · Comité</div>
        </div>
        {err&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",color:"#dc2626",padding:"8px 12px",borderRadius:8,fontSize:13,marginBottom:16}}>{err}</div>}
        <div style={{marginBottom:14}}><label style={{...lbl,color:"#94a3b8"}}>Correo electrónico</label><input style={{...inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo@ejemplo.cl" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
        <div style={{marginBottom:24}}><label style={{...lbl,color:"#94a3b8"}}>Contraseña</label><input style={{...inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
        <button style={{width:"100%",padding:"13px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer"}} onClick={submit} disabled={load}>{load?"Ingresando...":"Ingresar"}</button>
      </div>
    </div>
  );
}

export default function App() {
  const mob = useMob();
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
  const [orders,setOrders]=useState([]);
  const [dispatch,setDispatch]=useState([]);
  const [mant,setMant]=useState([]);
  const [cats,setCats]=useState(Object.entries(DEF_CATS).map(([name,subs],i)=>({id:"cat"+i,name,subs,active:true,order:i})));
  const [towers,setTowers]=useState([{id:"t1",name:"A",label:"Torre A",active:true},{id:"t2",name:"B",label:"Torre B",active:true},{id:"t3",name:"C",label:"Torre C",active:true},{id:"t4",name:"D",label:"Torre D",active:true},{id:"t5",name:"Comun",label:"Area Comun",active:true}]);
  const [resps,setResps]=useState([{id:"r1",name:"Carlos Munoz",email:"carlos@condo.cl",phone:"56912341111",modules:["Solicitudes","Tareas","Novedades"],active:true},{id:"r2",name:"Ana Garcia",email:"ana@condo.cl",phone:"56912342222",modules:["Solicitudes","Tareas"],active:true},{id:"r3",name:"Pedro Soto",email:"pedro@condo.cl",phone:"56912343333",modules:["Tareas","Novedades"],active:true}]);
  const [selReq,setSelReq]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [toast,setToast]=useState(null);
  const [navOpen,setNavOpen]=useState(false);

  const er = session ? (viewAs||session.rol) : "Residente";
  const showToast = (msg,type) => { setToast({msg,type:type||"success"}); setTimeout(()=>setToast(null),3200); };
  const handleLogin  = (user) => { setSession(user); if(user.openNewReq) setShowNew(true); };
  const handleLogout = async () => {
    if (session?.token) authSignOut(session.token).catch(()=>{});
    setSession(null); setViewAs(null); setView("dashboard");
  };

  useEffect(()=>{ setLoading(false); },[]);

  useEffect(()=>{
    if (!session) return;
    (async()=>{
      try {
        const [rR,rT,rI,rM,rIn,rE,rD,rCfg]=await Promise.all([
          dbGet("solicitudes","?order=created_at.desc"),
          dbGet("tareas","?order=id.asc"),
          dbGet("inventario","?order=id.asc"),
          dbGet("mantenciones","?order=id.asc"),
          dbGet("inspecciones","?order=id.asc"),
          dbGet("correos","?order=id.asc"),
          dbGet("despachos","?order=id.asc"),
          dbGet("config","?select=*"),
        ]);
        if(rR)  setReqs(rR.map(r=>normalizeReq(r.data)).filter(Boolean));
        if(rT)  setTasks(rT.map(r=>normalizeTask(r.data)).filter(Boolean));
        if(rI)  setInv(rI.map(r=>r.data).filter(Boolean));
        if(rM)  setMant(rM.map(r=>normalizeMant(r.data)).filter(Boolean));
        if(rIn) setInsp(rIn.map(r=>normalizeInsp(r.data)).filter(Boolean));
        if(rE)  setEmails(rE.map(r=>r.data).filter(Boolean));
        if(rD)  setDispatch(rD.map(r=>r.data).filter(Boolean));
        if(rCfg&&rCfg.length>0) rCfg.forEach(c=>{
          if(!c||!c.data) return;
          if(c.key==="cats")   setCats(c.data);
          if(c.key==="towers") setTowers(c.data);
          if(c.key==="resps")  setResps(c.data);
        });
      } catch(e){ console.error("Error cargando datos:",e); }
    })();
  },[session]);

  const persistReq  = async(item)=>{
    try { await dbUpsert("solicitudes",{id:item.id,code:item.code,created_at:item.createdAt,data:item}); }
    catch(e){ console.error("persistReq",e); }
  };
  const persistTask = async(item)=>{
    try { await dbPost("tareas",{id:item.id,request_id:item.requestId,data:item}); }
    catch { try { await dbPatch("tareas",item.id,{data:item}); } catch(e){ console.error("persistTask",e); } }
  };
  const persistInv  = async(item)=>{
    try { await dbPost("inventario",{id:item.id,data:item}); }
    catch { try { await dbPatch("inventario",item.id,{data:item}); } catch(e){ console.error("persistInv",e); } }
  };
  const persistMant = async(item)=>{
    try { await dbPost("mantenciones",{id:item.id,data:item}); }
    catch { try { await dbPatch("mantenciones",item.id,{data:item}); } catch(e){ console.error("persistMant",e); } }
  };
  const persistInsp = async(item)=>{
    try { await dbPost("inspecciones",{id:item.id,data:item}); }
    catch { try { await dbPatch("inspecciones",item.id,{data:item}); } catch(e){ console.error("persistInsp",e); } }
  };
  const persistEmail= async(item)=>{ try { await dbPost("correos",{id:item.id,request_id:item.requestId||"",data:item}); } catch(e){ console.error("persistEmail",e); } };
  const persistDis  = async(item)=>{ try { await dbPost("despachos",{id:item.id,data:item}); } catch(e){ console.error("persistDis",e); } };
  const persistCfg  = async(key,data)=>{ try { await dbUpsert("config",{key,data}); } catch(e){ console.error("persistCfg",e); } };

  const setReqsDB = updater => setReqs(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old||JSON.stringify(old)!==JSON.stringify(item))persistReq(item);});
    return next;
  });
  const setTasksDB = updater => setTasks(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old||JSON.stringify(old)!==JSON.stringify(item))persistTask(item);});
    return next;
  });
  const setInvDB = updater => setInv(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old||JSON.stringify(old)!==JSON.stringify(item))persistInv(item);});
    return next;
  });
  const setMantDB = updater => setMant(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old||JSON.stringify(old)!==JSON.stringify(item))persistMant(item);});
    return next;
  });
  const setInspDB = updater => setInsp(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old||JSON.stringify(old)!==JSON.stringify(item))persistInsp(item);});
    return next;
  });
  const setDispatchDB = updater => setDispatch(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old)persistDis(item);});
    return next;
  });
  const setCatsDB   = updater => setCats(prev=>{const next=typeof updater==="function"?updater(prev):updater;persistCfg("cats",next);return next;});
  const setTowersDB = updater => setTowers(prev=>{const next=typeof updater==="function"?updater(prev):updater;persistCfg("towers",next);return next;});
  const setRespsDB  = updater => setResps(prev=>{const next=typeof updater==="function"?updater(prev):updater;persistCfg("resps",next);return next;});

  const sendWhatsApp = async (phone, apikey, message) => {
    if (!phone || !apikey) return;
    try {
      const encoded = encodeURIComponent(message);
      await fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encoded}&apikey=${apikey}`);
    } catch(e) { console.error("Error enviando WhatsApp:", e); }
  };

  const EMAILJS_SERVICE_ID  = "service_vxhdrlx";
  const EMAILJS_TEMPLATE_ID = "template_90tjafk";
  const EMAILJS_PUBLIC_KEY  = "wKxD2rJHuftU7W-WE";

  const sendRealEmail = async (to, subject, body) => {
    if (!to || !to.includes("@")) return;
    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id:  EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id:     EMAILJS_PUBLIC_KEY,
          template_params: {
            to_email: to,
            subject:  subject,
            message:  body,
            name:     "CondoAdmin",
            email:    "no-reply@condoadmin.cl",
          },
        }),
      });
      if (!res.ok) { const t=await res.text(); console.error("EmailJS error:",res.status,t); }
      else console.log("Email enviado OK a",to);
    } catch(e) { console.error("Error enviando email:", e); }
  };

  const addEmail = async (log) => {
    const item = { id: "e"+uid(), ...log };
    setEmails(p => [item, ...p]);
    await persistEmail(item);
    await sendRealEmail(log.to, log.subject, log.body);
  };

  const go      = id => { setView(id); setSelReq(null); setNavOpen(false); };
  const openReq = r  => { setSelReq(r); setView("detail"); setNavOpen(false); };

  const navItems=[
    {id:"dashboard",   label:"Dashboard"},
    {id:"requests",    label:"Solicitudes"},
    {id:"tasks",       label:"Tareas"},
    {id:"provider",    label:"Mis Trabajos"},
    {id:"inspections", label:"Novedades"},
    {id:"inventory",   label:"Inventario"},
    {id:"mantencion",  label:"Mantencion"},
    {id:"emails",      label:"Correos"},
    {id:"reports",     label:"Reportes"},
    {id:"config",      label:"Config"},
  ].filter(n=>{
    if(n.id==="config"      &&!can(er,"manageConfig"))                              return false;
    if(n.id==="emails"      &&!can(er,"viewEmails"))                                return false;
    if(n.id==="reports"     &&!can(er,"viewReports")&&er!=="Comite")                return false;
    if(n.id==="inspections" &&!can(er,"inspection")&&!can(er,"inspectionRead"))     return false;
    if(n.id==="inventory"   &&!can(er,"inventory")&&!can(er,"inventoryRead"))       return false;
    if(n.id==="mantencion"  &&!can(er,"mantencion")&&!can(er,"mantRead"))           return false;
    if(n.id==="provider"    &&!can(er,"providerDash")&&er!=="Administrador"&&er!=="Conserjeria") return false;
    if(n.id==="tasks"       &&er==="Proveedor") return false;
    if(n.id==="dashboard"   &&er==="Proveedor") return false;
    return true;
  });
  const isAct = id => view===id||(view==="detail"&&id==="requests");
  useEffect(()=>{if(er==="Proveedor"&&view==="dashboard")setView("provider");},[er]);

  if (loading) return <Loader/>;
  if (!session) return <LoginScreen onLogin={handleLogin}/>;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",fontFamily:"system-ui,sans-serif",background:"#f1f5f9",color:"#1e293b",overflow:"hidden"}}>
      {viewAs&&<div style={{background:"#7c3aed",color:"#fff",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:100,fontSize:13}}><span>Visualizando como: <strong>{viewAs}</strong></span><button style={{...mkBtn("ghost",true),color:"#fff",border:"1px solid rgba(255,255,255,.4)"}} onClick={()=>{setViewAs(null);setView("dashboard");}}>Salir</button></div>}
      {mob&&<div style={{background:"#0f172a",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,zIndex:60}}><div onClick={()=>go(er==="Proveedor"?"provider":"dashboard")} style={{color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer"}}>CondoAdmin</div><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={bdg("#fff","#1e3a5f")}>{er}</span><button style={{background:"none",border:"none",color:"#fff",fontSize:22,cursor:"pointer"}} onClick={()=>setNavOpen(p=>!p)}>{navOpen?"✕":"☰"}</button></div></div>}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {(!mob||navOpen)&&(
          <div style={{width:220,background:"#0f172a",display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto",position:mob?"absolute":"relative",top:mob?40:0,left:0,bottom:0,zIndex:50}}>
            {!mob&&<div onClick={()=>go(er==="Proveedor"?"provider":"dashboard")} style={{padding:"18px 14px 14px",borderBottom:"1px solid #1e293b",cursor:"pointer"}}><div style={{color:"#fff",fontWeight:700,fontSize:15}}>CondoAdmin</div><div style={{color:"#64748b",fontSize:11,marginTop:2}}>Sistema de Gestion</div></div>}
            <nav style={{padding:"6px 0",flex:1}}>
              {navItems.map(n=>(
                <div key={n.id} onClick={()=>go(n.id)} style={{padding:"10px 14px",cursor:"pointer",userSelect:"none",fontSize:13,color:isAct(n.id)?"#fff":"#94a3b8",background:isAct(n.id)?"#1e3a5f":"transparent",borderLeft:isAct(n.id)?"3px solid #3b82f6":"3px solid transparent",fontWeight:isAct(n.id)?600:400}}>
                  {n.label}
                </div>
              ))}
            </nav>
            <div style={{padding:"10px 14px",borderTop:"1px solid #1e293b"}}>
              <div style={{marginBottom:10}}>
                <div style={{color:"#fff",fontSize:12,fontWeight:600,marginBottom:2}}>{session.nombre}</div>
                <div style={{color:"#64748b",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{session.email}</div>
                <span style={bdg("#93c5fd","#1e3a5f")}>{session.rol}</span>
              </div>
              {can(session.rol,"viewAs")&&!viewAs&&(
                <>
                  <div style={{color:"#64748b",fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Ver como</div>
                  <select style={{width:"100%",background:"#1e293b",color:"#a78bfa",border:"1px solid #4c1d95",borderRadius:6,padding:"6px 8px",fontSize:12,marginBottom:8}} defaultValue="" onChange={e=>{if(e.target.value){setViewAs(e.target.value);setView(e.target.value==="Proveedor"?"provider":"dashboard");}}}>
                    <option value="">Seleccionar perfil...</option>
                    {ROLES.filter(r=>r!==session.rol).map(r=><option key={r}>{r}</option>)}
                  </select>
                </>
              )}
              {viewAs&&<button style={{...mkBtn("secondary",true),width:"100%",justifyContent:"center",marginBottom:8}} onClick={()=>{setViewAs(null);setView("dashboard");}}>Salir de vista</button>}
              <button style={{...mkBtn("danger",true),width:"100%",justifyContent:"center"}} onClick={handleLogout}>Cerrar sesion</button>
            </div>
          </div>
        )}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:8}}>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:mob?15:17,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{view==="detail"?"Detalle":(navItems.find(n=>n.id===view)||{label:view}).label}</div>
              {!mob&&<div style={{color:"#64748b",fontSize:11,marginTop:1}}>{new Date().toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
              {can(er,"create")&&!viewAs&&<button style={mkBtn("primary",mob)} onClick={()=>setShowNew(true)}>{mob?"+ Sol.":"+ Nueva Solicitud"}</button>}
              {!mob&&<span style={{...bdg("#fff",viewAs?"#7c3aed":"#1e3a5f"),fontSize:12,padding:"5px 10px"}}>{er}</span>}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px"}}>
            {view==="dashboard"   &&<Dashboard reqs={reqs} tasks={tasks} mant={mant} role={er} onOpen={openReq} onNew={()=>setShowNew(true)} mob={mob} session={session}/>}
            {view==="requests"    &&<ReqList reqs={reqs} role={er} onOpen={openReq} setReqs={setReqsDB} showToast={showToast} addEmail={addEmail} mob={mob} towers={towers} resps={resps} session={session}/>}
            {view==="detail"&&selReq&&<ReqDetail req={selReq} reqs={reqs} tasks={tasks} atts={atts} emails={emails} role={er} setReqs={setReqsDB} setTasks={setTasksDB} setAtts={setAtts} addEmail={addEmail} showToast={showToast} onBack={()=>setView("requests")} setSelReq={setSelReq} mob={mob} resps={resps}/>}
            {view==="tasks"       &&<TasksView tasks={tasks} reqs={reqs} role={er} setTasks={setTasksDB} showToast={showToast} mob={mob} resps={resps}/>}
            {view==="provider"    &&<ProviderDash orders={orders} setOrders={setOrders} role={er} showToast={showToast} mob={mob} reqs={reqs} session={session}/>}
            {view==="inspections" &&<Inspections inspections={inspections} setInsp={setInspDB} reqs={reqs} setReqs={setReqsDB} addEmail={addEmail} showToast={showToast} role={er} mob={mob} towers={towers}/>}
            {view==="inventory"   &&<InvView inventory={inventory} setInv={setInvDB} dispatch={dispatch} setDispatch={setDispatchDB} reqs={reqs} role={er} showToast={showToast} mob={mob} resps={resps}/>}
            {view==="mantencion"  &&<MantView mant={mant} setMant={setMantDB} reqs={reqs} role={er} showToast={showToast} addEmail={addEmail} mob={mob} resps={resps}/>}
            {view==="emails"      &&<EmailsView logs={emails} setEmails={setEmails} role={er}/>}
            {view==="reports"     &&<Reports reqs={reqs} tasks={tasks} inventory={inventory} mob={mob} resps={resps}/>}
            {view==="config"      &&<ConfigView cats={cats} setCats={setCatsDB} towers={towers} setTowers={setTowersDB} resps={resps} setResps={setRespsDB} showToast={showToast} session={session}/>}
          </div>
        </div>
      </div>
      {showNew&&<NewReqModal role={er} reqs={reqs} setReqs={setReqsDB} addEmail={addEmail} showToast={showToast} onClose={()=>{setShowNew(false);if(er==="Residente")setView("requests");}} onOpen={openReq} cats={cats} towers={towers} resps={resps} session={session}/>}
      {toast&&<div style={{...alrt(toast.type),position:"fixed",bottom:20,right:16,left:mob?16:"auto",zIndex:2000,boxShadow:"0 4px 12px rgba(0,0,0,.15)",minWidth:mob?undefined:260}}>{toast.msg}</div>}
    </div>
  );
}

function Dashboard({reqs,tasks,mant,role,onOpen,onNew,mob,session}){
  const emerg=reqs.filter(r=>r.priority==="Emergencia"&&!["Cerrada","Rechazada"].includes(r.status));
  const recent=[...reqs].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
  const byCat=Object.keys(DEF_CATS).map(c=>({c,n:reqs.filter(r=>r.category===c).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,6);
  const mv=mant.filter(m=>getMantStatus(m)==="Vencida").length;
  const mp=mant.filter(m=>getMantStatus(m)==="Por vencer").length;
  return(
    <div>
      {emerg.map(e=><div key={e.id} style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",cursor:"pointer",display:"flex",alignItems:"center",gap:10}} onClick={()=>onOpen(e)}><span style={{fontWeight:700,color:"#dc2626"}}>⚠</span><div style={{flex:1}}><strong style={{color:"#dc2626"}}>EMERGENCIA: {e.code}</strong><div style={{fontSize:12,color:"#ef4444"}}>{e.category} - Torre {e.tower}/{e.unit}</div></div></div>)}
      {(mv>0||mp>0)&&<div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,color:"#92400e"}}>!</span><div><strong style={{color:"#92400e"}}>{mv>0?mv+" vencida(s)":""}{mv>0&&mp>0?" / ":""}{mp>0?mp+" por vencer":""}</strong><div style={{fontSize:11,color:"#b45309"}}>Revisar modulo Mantencion</div></div></div>}
      <Grid cols={5} mob={mob}>
        <Kpi value={reqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status)).length} label="Abiertas" color="#3b82f6" mob={mob}/>
        <Kpi value={reqs.filter(r=>r.priority==="Emergencia").length} label="Emergencias" color="#ef4444" mob={mob}/>
        <Kpi value={reqs.filter(r=>r.status==="En proceso").length} label="En proceso" color="#8b5cf6" mob={mob}/>
        <Kpi value={reqs.filter(r=>r.status==="Cerrada").length} label="Cerradas" color="#10b981" mob={mob}/>
        <Kpi value={mv+mp} label="Mant. urgentes" color="#f97316" mob={mob}/>
      </Grid>
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"2fr 1fr",gap:14}}>
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:600,fontSize:13}}>Solicitudes recientes</div>
            {can(role,"create")&&<button style={mkBtn("primary",true)} onClick={onNew}>+ Nueva</button>}
          </div>
          {recent.length===0?<Empty msg="Sin solicitudes aun"/>:mob?(
            <div>{recent.map(r=><div key={r.id} style={{padding:"8px 0",borderBottom:"1px solid #f1f5f9",cursor:"pointer",display:"flex",justifyContent:"space-between"}} onClick={()=>onOpen(r)}><div><span style={{fontWeight:600,color:"#3b82f6",fontSize:12}}>{r.code}</span><div style={{fontSize:11,color:"#64748b"}}>{r.category}</div></div><div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}><PBadge p={r.priority}/><SBadge s={r.status}/></div></div>)}</div>
          ):(
            <table style={tbl}><thead><tr>{["ID","Categoria","Prioridad","Estado","Fecha"].map(h=><th key={h} style={thSt}>{h}</th>)}</tr></thead>
            <tbody>{recent.map(r=><tr key={r.id} style={{cursor:"pointer"}} onClick={()=>onOpen(r)}><td style={tdSt}><span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span></td><td style={tdSt}>{r.category}</td><td style={tdSt}><PBadge p={r.priority}/></td><td style={tdSt}><SBadge s={r.status}/></td><td style={tdSt}><span style={{fontSize:11,color:"#64748b"}}>{fmtD(r.createdAt)}</span></td></tr>)}</tbody></table>
          )}
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
    </div>
  );
}

function ReqList({reqs,role,onOpen,setReqs,showToast,addEmail,mob,towers,resps,session}){
  const [fi,setFi]=useState({status:"",priority:"",category:"",tower:"",q:""});
  const [sort,setSort]=useState("date");
  const actTowers=(towers||[]).filter(t=>t.active).map(t=>t.name);

  // Residentes solo ven sus propias solicitudes
  const baseReqs = role==="Residente"
    ? reqs.filter(r=>r.requesterEmail===session?.email||r.requesterName===session?.nombre)
    : reqs;

  const visible=baseReqs.filter(r=>{
    if(fi.status&&r.status!==fi.status)return false;
    if(fi.priority&&r.priority!==fi.priority)return false;
    if(fi.category&&r.category!==fi.category)return false;
    if(fi.tower&&r.tower!==fi.tower)return false;
    if(fi.q&&!(r.code+" "+r.requesterName+" "+r.category).toLowerCase().includes(fi.q.toLowerCase()))return false;
    return true;
  }).sort((a,b)=>sort==="priority"?PRIORITIES.indexOf(a.priority)-PRIORITIES.indexOf(b.priority):sort==="due"?new Date(a.dueDate||"9999")-new Date(b.dueDate||"9999"):new Date(b.createdAt)-new Date(a.createdAt));
  const quickSt=(r,ns)=>{
    if(!can(role,"changeStatus")){showToast("Sin permisos","error");return;}
    if(ns==="Cerrada"&&r.status!=="Resuelta"){showToast("Debe estar Resuelta primero","error");return;}
    const updated={...r,status:ns,history:[...(r.history||[]),{date:new Date().toISOString(),user:role,action:"Estado cambiado",from:r.status,to:ns}]};
    setReqs(p=>p.map(x=>x.id===r.id?updated:x));
    addEmail({requestId:r.id,date:new Date().toISOString(),to:r.requesterEmail,subject:r.code+" Estado: "+ns,type:"Cambio de estado",status:"Enviado",body:"Solicitud cambio a: "+ns});
    showToast("Estado actualizado");
  };
  return(
    <div>
      <div style={{...card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
          <input style={{...inp,flex:2,minWidth:100}} placeholder="Buscar..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/>
          {[["status","Estado",STATUSES],["priority","Prioridad",PRIORITIES],["category","Categoria",Object.keys(DEF_CATS)],["tower","Torre",actTowers]].map(([k,l,opts])=>(
            <select key={k} style={{...selSt,flex:1}} value={fi[k]} onChange={e=>setFi(p=>({...p,[k]:e.target.value}))}><option value="">...{l}</option>{opts.map(o=><option key={o}>{o}</option>)}</select>
          ))}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:11,color:"#64748b"}}>Ordenar:</span>
          {[["date","Fecha"],["priority","Prioridad"],["due","Vencimiento"]].map(([v,l])=><button key={v} style={mkBtn(sort===v?"primary":"secondary",true)} onClick={()=>setSort(v)}>{l}</button>)}
          <span style={{marginLeft:"auto",fontSize:11,color:"#64748b"}}>{visible.length} solicitudes</span>
        </div>
      </div>
      {visible.length===0?<Empty msg="Sin solicitudes"/>:mob?(
        <div>{visible.map(r=>(
          <div key={r.id} style={{...card,padding:12,marginBottom:8,cursor:"pointer",borderLeft:"4px solid "+(PRIORITY_COLOR[r.priority]||"#e2e8f0"),background:r.priority==="Emergencia"?"#fef2f2":""}} onClick={()=>onOpen(r)}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <div style={{minWidth:0}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>{r.priority==="Emergencia"&&<span style={{color:"#dc2626",fontWeight:700}}>⚠</span>}<span style={{fontWeight:700,color:"#3b82f6",fontSize:13}}>{r.code}</span></div><div style={{fontSize:12,fontWeight:500}}>{r.requesterName}</div><div style={{fontSize:11,color:"#64748b"}}>{r.category} - Torre {r.tower}/{r.unit}</div></div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}><PBadge p={r.priority}/><SBadge s={r.status}/></div>
            </div>
          </div>
        ))}</div>
      ):(
        <div style={card}><table style={tbl}><thead><tr>{["","ID","Solicitante","Categoria","Torre","Prioridad","Estado","Responsable","Fecha","Acciones"].map(h=><th key={h} style={thSt}>{h}</th>)}</tr></thead>
        <tbody>{visible.map(r=>(
          <tr key={r.id} style={{background:r.priority==="Emergencia"?"#fef2f2":"",cursor:"pointer"}} onClick={()=>onOpen(r)}>
            <td style={tdSt}>{r.priority==="Emergencia"?"⚠":""}</td>
            <td style={tdSt}><span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span></td>
            <td style={tdSt}><div>{r.requesterName}</div><div style={{fontSize:10,color:"#94a3b8"}}>{r.requesterEmail}</div></td>
            <td style={tdSt}><div>{r.category}</div><div style={{fontSize:10,color:"#94a3b8"}}>{r.subcategory}</div></td>
            <td style={tdSt}>{r.tower}/{r.unit}</td>
            <td style={tdSt}><PBadge p={r.priority}/></td>
            <td style={tdSt}><SBadge s={r.status}/></td>
            <td style={tdSt}>{r.assignedTo}</td>
            <td style={tdSt}><span style={{fontSize:11,color:"#64748b"}}>{fmtD(r.createdAt)}</span></td>
            <td style={tdSt} onClick={e=>e.stopPropagation()}>
              {can(role,"changeStatus")&&r.status!=="Cerrada"&&r.status!=="Rechazada"&&<select style={{...selSt,width:120,fontSize:11,padding:"4px 6px"}} value={r.status} onChange={e=>quickSt(r,e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>}
              {can(role,"manageConfig")&&<button style={{...mkBtn("danger",true),marginLeft:4}} onClick={()=>{if(window.confirm("¿Eliminar solicitud "+r.code+"?"))setReqs(p=>p.filter(x=>x.id!==r.id));}}>🗑</button>}
            </td>
          </tr>
        ))}</tbody></table></div>
      )}
    </div>
  );
}

function ReqDetail({req,reqs,tasks,atts,emails,role,setReqs,setTasks,setAtts,addEmail,showToast,onBack,setSelReq,mob,resps}){
  const RESP_LIST=getRespList(resps);
  const r=reqs.find(x=>x.id===req.id)||req;
  const safeHistory=r.history||[];
  const safeComments=r.comments||[];
  const myTasks=tasks.filter(t=>t.requestId===r.id);
  const myEmails=emails.filter(e=>e.requestId===r.id);
  const myAtt=type=>atts.filter(a=>a.requestId===r.id&&a.type===type);
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
    setSelReq(p=>({...p,...ch}));
  };
  const applyStatus=()=>{
    if(ns===r.status)return;
    if(ns==="Cerrada"){setShowCl(true);return;}
    upd({status:ns},{action:"Estado cambiado",from:r.status,to:ns});
    addEmail({requestId:r.id,date:new Date().toISOString(),to:r.requesterEmail,subject:r.code+" Estado: "+ns,type:"Cambio de estado",status:"Enviado",body:"Cambio a: "+ns});
    showToast("Estado actualizado");
  };
  const applyAsgn=async()=>{
    if(!asgn||asgn==="Sin asignar"){showToast("Seleccione responsable","error");return;}
    upd({assignedTo:asgn,status:"Asignada"},{action:"Asignada a "+asgn,from:r.status,to:"Asignada"});
    showToast("Responsable asignado");
    // Buscar el correo del usuario asignado en Supabase
    try {
      const res = await fetch(`${SUPA_URL}/rest/v1/usuarios?nombre=eq.${encodeURIComponent(asgn)}&active=eq.true&select=*`,{
        headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`}
      });
      const usuarios = await res.json();
      const usuario = usuarios&&usuarios[0];
      if(usuario?.email){
        addEmail({
          requestId:r.id,date:new Date().toISOString(),to:usuario.email,
          subject:"[CondoAdmin] Se te asignó la solicitud "+r.code,
          type:"Asignacion",status:"Enviado",
          body:`Hola ${usuario.nombre},\n\nSe te ha asignado una nueva solicitud:\n\n📋 DETALLE\n──────────────────────────\nCódigo: ${r.code}\nSolicitante: ${r.requesterName}\nTeléfono: ${r.requesterPhone||"No indicado"}\nTorre: ${r.tower} / Unidad: ${r.unit}\nCategoría: ${r.category} - ${r.subcategory}\nPrioridad: ${r.priority}\n\nDescripción:\n${r.description}\n──────────────────────────\nIngresa a CondoAdmin para gestionar esta solicitud.`
        });
      }
    } catch(e){ console.error("Error buscando usuario asignado:",e); }
  };
  const addCmt=()=>{
    if(!comment.trim())return;
    upd({comments:[...safeComments,{id:"c"+uid(),user:role,role,date:new Date().toISOString(),text:comment}]});
    setComment("");showToast("Comentario agregado");
  };
  const closeFinal=()=>{
    if(!atts.filter(a=>a.requestId===r.id&&a.type==="cierre").length){showToast("Cargue evidencia de cierre","error");return false;}
    if(r.status!=="Resuelta"){showToast("Debe estar en Resuelta","error");return false;}
    upd({status:"Cerrada"},{action:"Caso cerrado",from:"Resuelta",to:"Cerrada"});
    showToast("Solicitud cerrada");setShowCl(false);return true;
  };
  const tabs=[
    {id:"info",label:"Info"},
    {id:"history",label:"Historial ("+safeHistory.length+")"},
    {id:"tasks",label:"Tareas ("+myTasks.length+")"},
    {id:"evidence",label:"Evidencias"},
    {id:"emails",label:"Correos ("+myEmails.length+")"},
  ];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:mob?16:20}}>{r.code}</span><PBadge p={r.priority}/><SBadge s={r.status}/>{r.isUrgent&&<span style={bdg("#f97316","#fff7ed")}>URGENTE</span>}</div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{r.category} - {r.subcategory} - Torre {r.tower}/{r.unit}</div>
        </div>
      </div>
      {r.priority==="Emergencia"&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,color:"#dc2626"}}>⚠</span><strong style={{color:"#dc2626"}}>EMERGENCIA ACTIVA</strong></div>}
      {(can(role,"changeStatus")||can(role,"assign"))&&r.status!=="Cerrada"&&r.status!=="Rechazada"&&(
        <div style={{...card,padding:12,marginBottom:12}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            {can(role,"changeStatus")&&<div><label style={lbl}>Estado</label><div style={{display:"flex",gap:6}}><select style={{...selSt,width:140}} value={ns} onChange={e=>setNs(e.target.value)}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select><button style={mkBtn("primary",true)} onClick={applyStatus}>OK</button></div></div>}
            {can(role,"assign")&&<div><label style={lbl}>Responsable</label><div style={{display:"flex",gap:6}}><select style={{...selSt,width:150}} value={asgn} onChange={e=>setAsgn(e.target.value)}>{RESP_LIST.map(s=><option key={s}>{s}</option>)}</select><button style={mkBtn("secondary",true)} onClick={applyAsgn}>Asignar</button></div></div>}
            {can(role,"createTask")&&<button style={mkBtn("secondary",true)} onClick={()=>setShowTF(true)}>+ Tarea</button>}
            {can(role,"closeCases")&&r.status==="Resuelta"&&<button style={mkBtn("success",true)} onClick={()=>setShowCl(true)}>Cerrar</button>}
            <button style={mkBtn("secondary",true)} onClick={()=>setShowEv("avance")}>Evidencia</button>
          </div>
        </div>
      )}
      <Tabs tabs={tabs} active={tab} onChange={setTab}/>
      {tab==="info"&&(
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
          <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Solicitante</div><IR l="Nombre" v={r.requesterName}/><IR l="Correo" v={r.requesterEmail}/><IR l="Telefono" v={r.requesterPhone}/><IR l="Torre" v={r.tower}/><IR l="Unidad" v={r.unit}/></div>
          <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Caso</div><IR l="Categoria" v={(r.category||"")+" / "+(r.subcategory||"")}/><IR l="Responsable" v={r.assignedTo}/><IR l="Creacion" v={fmt(r.createdAt)}/><IR l="Compromiso" v={r.dueDate?fmtD(r.dueDate):"No definida"}/></div>
          <div style={{...card,gridColumn:"1/-1"}}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Descripcion</div><p style={{fontSize:13,color:"#374151",lineHeight:1.6,margin:0}}>{r.description||"Sin descripcion."}</p></div>
          <div style={{...card,gridColumn:"1/-1"}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Comentarios ({safeComments.length})</div>
            {safeComments.length===0&&<div style={{color:"#94a3b8",fontSize:13}}>Sin comentarios.</div>}
            {safeComments.map((c,i)=><div key={c.id||i} style={{borderLeft:"3px solid #e2e8f0",paddingLeft:10,marginBottom:10}}><div style={{display:"flex",gap:6,marginBottom:3,flexWrap:"wrap"}}><strong style={{fontSize:12}}>{c.user}</strong><span style={bdg("#6b7280","#f1f5f9")}>{c.role}</span><span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{fmt(c.date)}</span></div><p style={{margin:0,fontSize:13}}>{c.text}</p></div>)}
            {can(role,"comment")&&<div style={{marginTop:10,display:"flex",gap:8}}><input style={{...inp,flex:1}} placeholder="Comentario..." value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCmt()}/><button style={mkBtn("primary",true)} onClick={addCmt}>Enviar</button></div>}
          </div>
        </div>
      )}
      {tab==="history"&&<div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Bitacora</div>{safeHistory.length===0?<Empty msg="Sin historial"/>:<div style={{position:"relative",paddingLeft:20}}>{[...safeHistory].reverse().map((h,i)=><div key={i} style={{position:"relative",paddingLeft:16,paddingBottom:14}}><div style={{width:9,height:9,borderRadius:"50%",background:h.to?STATUS_COLOR[h.to]:"#3b82f6",position:"absolute",left:0,top:4}}/>{i<safeHistory.length-1&&<div style={{position:"absolute",left:4,top:13,bottom:0,width:2,background:"#e2e8f0"}}/>}<div style={{fontSize:13,fontWeight:600}}>{h.action}</div>{h.from&&h.to&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}><SBadge s={h.from}/> → <SBadge s={h.to}/></div>}<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{fmt(h.date)} - {h.user}</div></div>)}</div>}</div>}
      {tab==="tasks"&&<div>{showTF&&<TaskForm requestId={r.id} setTasks={setTasks} showToast={showToast} onClose={()=>setShowTF(false)} resps={resps}/>}{myTasks.length===0&&!showTF&&<Empty msg="Sin tareas"/>}{myTasks.map(t=><TaskCard key={t.id} task={t} role={role} tasks={tasks} setTasks={setTasks} showToast={showToast} atts={atts} setAtts={setAtts}/>)}{can(role,"createTask")&&!showTF&&<button style={mkBtn("secondary")} onClick={()=>setShowTF(true)}>+ Nueva tarea</button>}</div>}
      {tab==="evidence"&&<div>{["inicial","avance","cierre"].map(type=><div key={type} style={card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Imagenes {type==="inicial"?"iniciales":type==="avance"?"de avance":"de cierre"}</div>{r.status!=="Cerrada"&&<button style={mkBtn("secondary",true)} onClick={()=>setShowEv(type)}>+ Agregar</button>}</div>{myAtt(type).length===0?<div style={{color:"#94a3b8",fontSize:13}}>Sin imagenes.</div>:<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{myAtt(type).map((a,i)=><div key={a.id||i} style={{textAlign:"center"}}><img src={a.preview} alt={a.name} style={thumb} onError={e=>e.target.style.display="none"}/><div style={{fontSize:10,color:"#64748b",marginTop:3,maxWidth:70,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div></div>)}</div>}</div>)}</div>}
      {tab==="emails"&&<div style={card}>{myEmails.length===0?<Empty msg="Sin correos"/>:myEmails.map((e,i)=><div key={e.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0"}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}><span style={{fontWeight:600,fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.subject}</span><span style={bdg("#6366f1","#eef2ff")}>{e.type}</span><span style={bdg("#10b981","#f0fdf4")}>{e.status}</span></div><div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{e.to} - {fmt(e.date)}</div><div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4}}>{e.body}</div></div>)}</div>}
      {showEv&&<EvidModal type={showEv} requestId={r.id} role={role} atts={atts} setAtts={setAtts} showToast={showToast} onClose={()=>setShowEv(null)}/>}
      {showCl&&<CloseModal req={r} atts={atts} setAtts={setAtts} role={role} onClose={()=>setShowCl(false)} onConfirm={closeFinal} showToast={showToast}/>}
    </div>
  );
}

function TaskCard({task,role,tasks,setTasks,showToast,atts,setAtts}){
  const [exp,setExp]=useState(false);
  const [cmt,setCmt]=useState("");
  const [showEv,setShowEv]=useState(false);
  const safeComments=task.comments||[];
  const safeMaterials=task.materials||[];
  const safeAtts=task.attachments||[];
  const upd=ch=>setTasks(p=>p.map(t=>t.id===task.id?{...t,...ch}:t));
  const addC=()=>{if(!cmt.trim())return;upd({comments:[...safeComments,{user:role,date:new Date().toISOString(),text:cmt}]});setCmt("");};
  const resolve=()=>{
    if(!safeAtts.some(a=>a.type==="cierre")){showToast("Cargue imagen de cierre","error");return;}
    upd({status:"Completada"});showToast("Tarea completada");
  };
  return(
    <div style={{...card,marginBottom:10,borderLeft:"4px solid "+(PRIORITY_COLOR[task.priority]||"#e2e8f0")}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer",gap:8}} onClick={()=>setExp(p=>!p)}>
        <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{task.responsible} - {task.dueDate?fmtD(task.dueDate):"Sin fecha"}</div></div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}><PBadge p={task.priority}/><SBadge s={task.status}/><span style={{color:"#94a3b8",fontSize:12}}>{exp?"▲":"▼"}</span></div>
      </div>
      {exp&&<div style={{marginTop:10,borderTop:"1px solid #f1f5f9",paddingTop:10}}>
        <p style={{fontSize:12,color:"#374151",marginBottom:10}}>{task.desc}</p>
        {safeComments.map((c,i)=><div key={i} style={{fontSize:11,marginBottom:6,paddingLeft:8,borderLeft:"2px solid #e2e8f0"}}><strong>{c.user}</strong> - <span style={{color:"#94a3b8"}}>{fmt(c.date)}</span><br/>{c.text}</div>)}
        <MatPanel materials={safeMaterials} setMaterials={ms=>upd({materials:ms})} readOnly={!can(role,"changeStatus")&&!can(role,"resolveTask")}/>
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
          <input style={{...inp,flex:1,minWidth:100,fontSize:12}} placeholder="Comentario..." value={cmt} onChange={e=>setCmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addC()}/>
          <button style={mkBtn("secondary",true)} onClick={addC}>Enviar</button>
          <button style={mkBtn("secondary",true)} onClick={()=>setShowEv(true)}>Foto</button>
          {task.status!=="Completada"&&(can(role,"resolveTask")||can(role,"changeStatus"))&&<button style={mkBtn("success",true)} onClick={resolve}>Completar</button>}
        </div>
      </div>}
      {showEv&&<EvidModal type="cierre" requestId={task.requestId} role={role} atts={atts} setAtts={setAtts} showToast={showToast} onClose={()=>setShowEv(false)} taskId={task.id} setTasks={setTasks}/>}
    </div>
  );
}
function TaskForm({requestId,setTasks,showToast,onClose,resps}){
  const RESP_ASSIGNABLE=getRespAssignable(resps);
  const [f,setF]=useState({title:"",desc:"",responsible:RESP_ASSIGNABLE[0]||"",dueDate:"",priority:"Media"});
  const submit=()=>{
    if(!f.title){showToast("Ingrese titulo","error");return;}
    setTasks(p=>[...p,{id:"t"+uid(),requestId,comments:[],attachments:[],materials:[],status:"Ingresada",...f}]);
    showToast("Tarea creada");onClose();
  };
  return(
    <div style={{...card,border:"2px solid #3b82f6",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Nueva tarea</div><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Titulo *</label><input style={inp} value={f.title} onChange={e=>setF(p=>({...p,title:e.target.value}))}/></div>
        <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Descripcion</label><textarea style={{...inp,height:70,resize:"vertical"}} value={f.desc} onChange={e=>setF(p=>({...p,desc:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Responsable</label><select style={selSt} value={f.responsible} onChange={e=>setF(p=>({...p,responsible:e.target.value}))}>{RESP_ASSIGNABLE.map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={fg}><label style={lbl}>Fecha</label><input type="date" style={inp} value={f.dueDate} onChange={e=>setF(p=>({...p,dueDate:e.target.value}))}/></div>
        <div style={fg}><label style={lbl}>Prioridad</label><select style={selSt} value={f.priority} onChange={e=>setF(p=>({...p,priority:e.target.value}))}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
      </div>
      <button style={mkBtn("primary",true)} onClick={submit}>Crear tarea</button>
    </div>
  );
}
function MatPanel({materials,setMaterials,readOnly}){
  const [showAdd,setShowAdd]=useState(false);
  const [nm,setNm]=useState({name:"",qty:1,unit:INV_UNITS[0],cost:0,status:"Por adquirir",notes:""});
  const addMat=()=>{if(!nm.name)return;setMaterials(p=>[...p,{id:"m"+uid(),...nm}]);setNm({name:"",qty:1,unit:INV_UNITS[0],cost:0,status:"Por adquirir",notes:""});setShowAdd(false);};
  const safeMat=materials||[];
  const total=safeMat.reduce((s,m)=>s+(m.qty*m.cost),0);
  return(
    <div style={{marginTop:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontWeight:600,fontSize:12}}>Materiales ({safeMat.length}){total>0?" - $"+total.toLocaleString("es-CL"):""}</span>{!readOnly&&<button style={mkBtn("secondary",true)} onClick={()=>setShowAdd(p=>!p)}>+ Agregar</button>}</div>
      {showAdd&&!readOnly&&<div style={{background:"#f8fafc",borderRadius:8,padding:10,marginBottom:10,border:"1px solid #e2e8f0"}}><div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,marginBottom:8}}><input style={inp} placeholder="Material *" value={nm.name} onChange={e=>setNm(p=>({...p,name:e.target.value}))}/><input type="number" style={inp} value={nm.qty} min="1" onChange={e=>setNm(p=>({...p,qty:Math.max(1,+e.target.value)}))}/><select style={selSt} value={nm.unit} onChange={e=>setNm(p=>({...p,unit:e.target.value}))}>{INV_UNITS.map(u=><option key={u}>{u}</option>)}</select><input type="number" style={inp} placeholder="Costo" min="0" value={nm.cost} onChange={e=>setNm(p=>({...p,cost:Math.max(0,+e.target.value)}))}/></div><div style={{display:"flex",gap:8}}><input style={{...inp,flex:1}} placeholder="Notas" value={nm.notes} onChange={e=>setNm(p=>({...p,notes:e.target.value}))}/><button style={mkBtn("primary",true)} onClick={addMat}>Agregar</button><button style={mkBtn("ghost",true)} onClick={()=>setShowAdd(false)}>✕</button></div></div>}
      {safeMat.length===0&&!showAdd&&<div style={{fontSize:12,color:"#94a3b8"}}>Sin materiales.</div>}
      {safeMat.map(m=>(
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:100}}><div style={{fontSize:12,fontWeight:600}}>{m.name}</div><div style={{fontSize:11,color:"#64748b"}}>{m.qty} {m.unit}{m.cost>0?" - $"+(m.qty*m.cost).toLocaleString("es-CL"):""}</div></div>
          {readOnly?<span style={{...bdg(MAT_COLOR[m.status],MAT_COLOR[m.status]+"18"),fontSize:10}}>{m.status}</span>:<div style={{display:"flex",gap:4}}>{MAT_STATUS.map(s=><button key={s} onClick={()=>setMaterials(p=>p.map(x=>x.id===m.id?{...x,status:s}:x))} style={{padding:"3px 8px",borderRadius:99,fontSize:10,border:"1.5px solid "+(m.status===s?MAT_COLOR[s]:"#e2e8f0"),color:m.status===s?MAT_COLOR[s]:"#94a3b8",fontWeight:m.status===s?700:400,background:m.status===s?MAT_COLOR[s]+"18":"transparent",cursor:"pointer"}}>{s}</button>)}<button style={mkBtn("ghost",true)} onClick={()=>setMaterials(p=>p.filter(x=>x.id!==m.id))}>✕</button></div>}
        </div>
      ))}
    </div>
  );
}

function EvidModal({type,requestId,role,atts,setAtts,showToast,onClose,taskId,setTasks}){
  const [previews,setPrev]=useState([]);const [comment,setCmt]=useState("");const fileRef=useRef();
  const handleFiles=e=>Array.from(e.target.files).forEach(f=>{const r=new FileReader();r.onload=ev=>setPrev(p=>[...p,{name:f.name,url:ev.target.result}]);r.readAsDataURL(f);});
  const save=()=>{
    if(!previews.length){showToast("Seleccione imagen","error");return;}
    const na=previews.map(p=>({id:"a"+uid(),requestId,type,name:p.name,date:new Date().toISOString(),user:role,comment,preview:p.url}));
    setAtts(prev=>[...prev,...na]);
    if(taskId&&setTasks)setTasks(prev=>prev.map(t=>t.id===taskId?{...t,attachments:[...(t.attachments||[]),...na]}:t));
    showToast(previews.length+" imagen(es) guardada(s)");onClose();
  };
  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:14}}>Subir evidencia - {type}</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
      <div style={{border:"2px dashed #d1d5db",borderRadius:8,padding:20,textAlign:"center",cursor:"pointer",marginBottom:12}} onClick={()=>fileRef.current.click()}><div style={{fontSize:12,color:"#64748b"}}>Clic para seleccionar imagenes</div></div>
      {previews.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{previews.map((p,i)=><div key={i} style={{position:"relative"}}><img src={p.url} alt={p.name} style={{...thumb,width:80,height:64}}/><button onClick={()=>setPrev(pr=>pr.filter((_,j)=>j!==i))} style={{position:"absolute",top:-4,right:-4,background:"#ef4444",color:"#fff",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",fontSize:9}}>✕</button></div>)}</div>}
      <div style={fg}><label style={lbl}>Comentario</label><input style={inp} value={comment} onChange={e=>setCmt(e.target.value)} placeholder="Descripcion..."/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={save}>Guardar</button></div>
    </div></div>
  );
}
function CloseModal({req,atts,setAtts,role,onClose,onConfirm,showToast}){
  const closure=atts.filter(a=>a.requestId===req.id&&a.type==="cierre");
  const [showEv,setShowEv]=useState(false);
  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:440,padding:"20px",marginTop:16}}>
      <h3 style={{margin:"0 0 10px",fontSize:14}}>Cerrar solicitud {req.code}</h3>
      {closure.length===0?<div><div style={alrt("error")}>Cargue al menos una imagen de cierre.</div><button style={mkBtn("primary",true)} onClick={()=>setShowEv(true)}>Cargar evidencia</button></div>:<div><div style={alrt("success")}>{closure.length} imagen(es) de cierre.</div><p style={{fontSize:13}}>Confirma el cierre definitivo?</p></div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button>{closure.length>0&&<button style={mkBtn("success",true)} onClick={onConfirm}>Confirmar cierre</button>}</div>
    </div>{showEv&&<EvidModal type="cierre" requestId={req.id} role={role} atts={atts} setAtts={setAtts} showToast={showToast} onClose={()=>setShowEv(false)}/>}</div>
  );
}
function NewReqModal({role,reqs,setReqs,addEmail,showToast,onClose,onOpen,cats,towers,resps,session}){
  const actCats=cats.filter(c=>c.active);
  const actTowers=towers.filter(t=>t.active);
  const initCat=actCats[0]||{name:"",subs:[""]};
  const initTower=actTowers[0]||{name:""};
  const isAdminRole=role==="Administrador"||role==="Administrador Edificio";
  const [tipoReporte,setTipoReporte]=useState(isAdminRole?"Administrativo":"Incidencia");

  // Categorías según tipo
  const adminCatList=Object.keys(ADMIN_CATS);
  const initAdminCat=adminCatList[0];
  const [adminCat,setAdminCat]=useState(initAdminCat);
  const [adminSub,setAdminSub]=useState(ADMIN_CATS[initAdminCat][0]);

  const [f,setF]=useState({
    requesterName:session?.nombre||"",
    requesterEmail:session?.email||"",
    requesterPhone:session?.phone||"",
    tower:initTower.name,unit:"",
    category:initCat.name,subcategory:initCat.subs[0]||"",
    description:"",priority:"Media",
    accessPermission:false,preferredTimeSlot:"Manana",confirm:false
  });
  const [errs,setErrs]=useState({});const [prevs,setPrevs]=useState([]);const [done,setDone]=useState(null);const fileRef=useRef();
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const validate=()=>{
    const e={};
    if(tipoReporte==="Incidencia"){
      if(!f.requesterName)e.requesterName="Requerido";
      if(!f.requesterEmail||!/\S+@\S+\.\S+/.test(f.requesterEmail))e.requesterEmail="Email invalido";
      if(!f.unit)e.unit="Requerido";
    }
    if(!f.description||f.description.length<10)e.description="Min. 10 caracteres";
    if(!f.confirm)e.confirm="Debe confirmar";
    setErrs(e);return !Object.keys(e).length;
  };
  const handleFiles=e=>Array.from(e.target.files).forEach(fi=>{const r=new FileReader();r.onload=ev=>setPrevs(p=>[...p,{name:fi.name,url:ev.target.result}]);r.readAsDataURL(fi);});
  const submit=()=>{
    if(!validate())return;
    const code=genCode(reqs,"SOL-");const now=new Date().toISOString();
    const nr=normalizeReq({id:code,code,createdAt:now,...f,
      category:tipoReporte==="Administrativo"?adminCat:f.category,
      subcategory:tipoReporte==="Administrativo"?adminSub:f.subcategory,
      status:"Ingresada",assignedTo:"Sin asignar",
      history:[{date:now,user:f.requesterName||role,action:"Solicitud creada",from:null,to:"Ingresada"}],
      attachmentsInitial:prevs.map(p=>({id:"a"+uid(),requestId:code,type:"inicial",name:p.name,date:now,user:f.requesterName,preview:p.url,comment:""})),
      dueDate:null,isUrgent:f.priority==="Emergencia"});
    setReqs(p=>[nr,...p]);
    addEmail({requestId:code,date:now,to:f.requesterEmail,
      subject:"[CondoAdmin] Solicitud "+code+" recibida",
      type:"Creacion",status:"Enviado",
      body:`Estimado/a ${f.requesterName},\n\nSu solicitud ha sido registrada exitosamente.\n\n📋 DETALLE DE LA SOLICITUD\n──────────────────────────\nCódigo: ${code}\nCategoría: ${f.category} - ${f.subcategory}\nTorre: ${f.tower} / Unidad: ${f.unit}\nPrioridad: ${f.priority}\nFranja horaria: ${f.preferredTimeSlot}\n\nDescripción:\n${f.description}\n\n──────────────────────────\nNuestro equipo revisará su solicitud a la brevedad.\n\nCondoAdmin`
    });
    const notif=(resps||[]).filter(rr=>rr.active&&rr.email&&(rr.modules||[]).includes("Solicitudes"));
    notif.forEach(rr=>{addEmail({
      requestId:code,date:now,to:rr.email,
      subject:"[CondoAdmin] Nueva solicitud "+code+" - "+f.category,
      type:"Aviso responsable",status:"Enviado",
      body:`Nueva solicitud recibida:\n\nCódigo: ${code}\nSolicitante: ${f.requesterName}\nTorre: ${f.tower} / Unidad: ${f.unit}\nCategoría: ${f.category} - ${f.subcategory}\nPrioridad: ${f.priority}\nDescripción: ${f.description}\n\nIngresa a CondoAdmin para gestionar esta solicitud.`
    });});
    setDone(nr);showToast("Solicitud "+code+" creada");
  };
  const curCat=actCats.find(c=>c.name===f.category);
  if(done)return <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,padding:"24px",marginTop:16,textAlign:"center"}}><h3 style={{margin:"0 0 6px"}}>Solicitud registrada</h3><div style={{...bdg("#10b981","#f0fdf4"),fontSize:15,padding:"5px 14px",display:"inline-flex",marginBottom:14}}>{done.code}</div><div style={{display:"flex",gap:8,justifyContent:"center"}}><button style={mkBtn("primary",true)} onClick={()=>{onClose();onOpen(done);}}>Ver detalle</button><button style={mkBtn("secondary",true)} onClick={onClose}>Cerrar</button></div></div></div>;
  return(
    <div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:680,padding:"20px",marginTop:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:15}}>Nueva solicitud</h3>
        <button style={mkBtn("ghost",true)} onClick={onClose}>✕</button>
      </div>

      {/* Selector tipo reporte - solo admins */}
      {isAdminRole&&(
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          {["Administrativo","Incidencia"].map(t=>(
            <button key={t} onClick={()=>setTipoReporte(t)} style={{flex:1,padding:"12px",borderRadius:10,border:"2px solid "+(tipoReporte===t?(t==="Administrativo"?"#6366f1":"#ef4444"):"#e2e8f0"),background:tipoReporte===t?(t==="Administrativo"?"#eef2ff":"#fef2f2"):"#f9fafb",color:tipoReporte===t?(t==="Administrativo"?"#6366f1":"#ef4444"):"#6b7280",fontWeight:tipoReporte===t?700:400,cursor:"pointer",fontSize:14}}>
              {t==="Administrativo"?"📋 Administrativo":"🚨 Incidencia"}
            </button>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>

        {/* Datos solicitante - solo en Incidencia */}
        {tipoReporte==="Incidencia"&&<>
          {[["requesterName","Nombre *","text"],["requesterEmail","Correo *","email"],["requesterPhone","Telefono","text"]].map(([k,l,t])=><div key={k} style={fg}><label style={lbl}>{l}</label><input type={t} style={{...inp,borderColor:errs[k]?"#ef4444":""}} value={f[k]} onChange={e=>set(k,e.target.value)}/>{errs[k]&&<div style={{color:"#ef4444",fontSize:10,marginTop:2}}>{errs[k]}</div>}</div>)}
          <div style={fg}><label style={lbl}>Torre</label><select style={selSt} value={f.tower} onChange={e=>set("tower",e.target.value)}>{actTowers.map(t=><option key={t.id} value={t.name}>{t.label}</option>)}</select></div>
          <div style={fg}><label style={lbl}>Unidad *</label><input style={{...inp,borderColor:errs.unit?"#ef4444":""}} value={f.unit} onChange={e=>set("unit",e.target.value)} placeholder="ej: 401"/>{errs.unit&&<div style={{color:"#ef4444",fontSize:10}}>{errs.unit}</div>}</div>
          <div style={fg}><label style={lbl}>Categoria</label><select style={selSt} value={f.category} onChange={e=>{const c=actCats.find(x=>x.name===e.target.value);set("category",e.target.value);set("subcategory",c&&c.subs.length?c.subs[0]:"");}}>{actCats.map(c=><option key={c.id}>{c.name}</option>)}</select></div>
          <div style={fg}><label style={lbl}>Subcategoria</label><select style={selSt} value={f.subcategory} onChange={e=>set("subcategory",e.target.value)}>{(curCat?curCat.subs:[]).map(s=><option key={s}>{s}</option>)}</select></div>
        </>}

        {/* Categorías administrativas */}
        {isAdminRole&&tipoReporte==="Administrativo"&&<>
          <div style={fg}><label style={lbl}>Categoría</label><select style={selSt} value={adminCat} onChange={e=>{setAdminCat(e.target.value);setAdminSub(ADMIN_CATS[e.target.value][0]);}}>{adminCatList.map(c=><option key={c}>{c}</option>)}</select></div>
          <div style={fg}><label style={lbl}>Subcategoría</label><select style={selSt} value={adminSub} onChange={e=>setAdminSub(e.target.value)}>{(ADMIN_CATS[adminCat]||[]).map(s=><option key={s}>{s}</option>)}</select></div>
        </>}

        {/* Descripcion siempre visible */}
        <div style={{...fg,gridColumn:"1/-1"}}>
          <label style={lbl}>{tipoReporte==="Administrativo"?"Descripcion / Nota *":"Descripcion *"}</label>
          <textarea style={{...inp,height:tipoReporte==="Administrativo"?140:80,resize:"vertical",borderColor:errs.description?"#ef4444":""}} value={f.description} onChange={e=>set("description",e.target.value)} placeholder={tipoReporte==="Administrativo"?"Ingrese el detalle administrativo...":"Describa el problema..."}/>
          {errs.description&&<div style={{color:"#ef4444",fontSize:10}}>{errs.description}</div>}
        </div>

        {/* Prioridad y franja - solo Incidencia o admin */}
        {tipoReporte==="Incidencia"&&<>
          <div style={fg}><label style={lbl}>Prioridad</label><select style={{...selSt,color:PRIORITY_COLOR[f.priority]}} value={f.priority} onChange={e=>set("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
          <div style={fg}><label style={lbl}>Franja horaria</label><select style={selSt} value={f.preferredTimeSlot} onChange={e=>set("preferredTimeSlot",e.target.value)}>{["Manana (9-13h)","Tarde (14-18h)","Cualquier hora","Inmediato"].map(s=><option key={s}>{s}</option>)}</select></div>
        </>}
        {isAdminRole&&tipoReporte==="Administrativo"&&<>
          <div style={fg}><label style={lbl}>Prioridad</label><select style={{...selSt,color:PRIORITY_COLOR[f.priority]}} value={f.priority} onChange={e=>set("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
        </>}

        {/* Imágenes - solo Incidencia */}
        {tipoReporte==="Incidencia"&&<div style={{...fg,gridColumn:"1/-1"}}>
          <label style={lbl}>Imagenes (opcional)</label>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles}/>
          <div style={{border:"2px dashed #d1d5db",borderRadius:8,padding:16,textAlign:"center",cursor:"pointer",marginBottom:8,background:"#f8fafc"}} onClick={()=>fileRef.current.click()}>
            <div style={{fontSize:24,marginBottom:4}}>📷</div>
            <div style={{fontSize:12,color:"#64748b"}}>Toca para agregar fotos</div>
          </div>
          {prevs.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{prevs.map((p,i)=><div key={i} style={{position:"relative"}}><img src={p.url} alt={p.name} style={{...thumb,width:72,height:56}}/><button onClick={()=>setPrevs(pr=>pr.filter((_,j)=>j!==i))} style={{position:"absolute",top:-4,right:-4,background:"#ef4444",color:"#fff",border:"none",borderRadius:"50%",width:18,height:18,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button></div>)}</div>}
        </div>}

        {tipoReporte==="Incidencia"&&<div style={{...fg,gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" id="acc" checked={f.accessPermission} onChange={e=>set("accessPermission",e.target.checked)}/><label htmlFor="acc" style={{fontSize:12,cursor:"pointer"}}>Autorizo ingreso al inmueble</label></div>}
        <div style={{...fg,gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" id="conf" checked={f.confirm} onChange={e=>set("confirm",e.target.checked)}/><label htmlFor="conf" style={{fontSize:12,cursor:"pointer"}}>Confirmo que la informacion es correcta *</label>{errs.confirm&&<span style={{color:"#ef4444",fontSize:10}}>{errs.confirm}</span>}</div>
      </div>
      {tipoReporte==="Incidencia"&&f.priority==="Emergencia"&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,color:"#dc2626"}}>⚠</span><strong style={{color:"#dc2626",fontSize:13}}>Prioridad EMERGENCIA - Se notificara de inmediato.</strong></div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn(tipoReporte==="Administrativo"?"purple":"primary",true)} onClick={submit}>Enviar {tipoReporte==="Administrativo"?"nota":"solicitud"}</button></div>
    </div></div>
  );
}

function TasksView({tasks,reqs,role,setTasks,showToast,mob,resps}){
  const RESP_ASSIGNABLE=getRespAssignable(resps);
  const [fi,setFi]=useState({status:"",responsible:"",q:""});
  const visible=tasks.filter(t=>(!fi.status||t.status===fi.status)&&(!fi.responsible||t.responsible===fi.responsible)&&(!fi.q||(t.title+" "+t.responsible).toLowerCase().includes(fi.q.toLowerCase())));
  return(
    <div>
      <div style={{...card,padding:12,marginBottom:12}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input style={{...inp,flex:2,minWidth:100}} placeholder="Buscar tareas..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/><select style={{...selSt,flex:1}} value={fi.status} onChange={e=>setFi(p=>({...p,status:e.target.value}))}><option value="">Todos los estados</option>{["Ingresada","En proceso","Resuelta","Completada"].map(s=><option key={s}>{s}</option>)}</select><select style={{...selSt,flex:1}} value={fi.responsible} onChange={e=>setFi(p=>({...p,responsible:e.target.value}))}><option value="">Todos los responsables</option>{RESP_ASSIGNABLE.map(r=><option key={r}>{r}</option>)}</select></div></div>
      {visible.length===0?<Empty msg="Sin tareas"/>:visible.map(t=>{const req=reqs.find(r=>r.id===t.requestId);const pm=(t.materials||[]).filter(m=>m.status==="Por adquirir").length;return(<div key={t.id} style={{...card,borderLeft:"4px solid "+(PRIORITY_COLOR[t.priority]||"#e2e8f0"),marginBottom:8,padding:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}><div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>{req&&<div style={{fontSize:10,color:"#3b82f6",marginTop:2}}>{req.code} - {req.category}</div>}<div style={{fontSize:11,color:"#64748b",marginTop:2}}>{t.responsible} - {t.dueDate?fmtD(t.dueDate):"Sin fecha"}{pm>0&&<span style={{marginLeft:8,...bdg("#f59e0b","#fffbeb"),fontSize:10}}>{pm} mat. pendiente(s)</span>}</div></div><div style={{display:"flex",gap:6,flexShrink:0}}><PBadge p={t.priority}/><SBadge s={t.status}/></div></div></div>);})}
    </div>
  );
}

function ProviderDash({orders,setOrders,role,showToast,mob,reqs,session}){
  const [selOrder,setSelOrder]=useState(null);
  // Solicitudes asignadas al proveedor (por nombre o email)
  const myReqs=reqs.filter(r=>r.assignedTo&&(r.assignedTo===session?.nombre||r.assignedTo===session?.email));
  if(selOrder){const order=orders.find(o=>o.id===selOrder.id)||selOrder;return <WorkDetail order={order} setOrders={setOrders} showToast={showToast} role={role} mob={mob} onBack={()=>setSelOrder(null)}/>;}
  return(
    <div>
      <div style={{...card,background:"#1e3a5f",marginBottom:16}}>
        <div style={{color:"#fff",fontWeight:700,fontSize:16,marginBottom:4}}>Mis Trabajos Asignados</div>
        <div style={{color:"#94a3b8",fontSize:12}}>Solicitudes asignadas a {session?.nombre||"ti"}</div>
      </div>
      <Grid cols={3} mob={mob}>
        <Kpi value={myReqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status)).length} label="Activas" color="#3b82f6" mob={mob}/>
        <Kpi value={myReqs.filter(r=>r.status==="Resuelta").length} label="Resueltas" color="#10b981" mob={mob}/>
        <Kpi value={myReqs.filter(r=>r.status==="Cerrada").length} label="Cerradas" color="#6b7280" mob={mob}/>
      </Grid>
      {myReqs.length===0
        ?<Empty msg="No tienes solicitudes asignadas aún"/>
        :<div>{myReqs.map(r=>(
          <div key={r.id} style={{...card,borderLeft:"4px solid "+(PRIORITY_COLOR[r.priority]||"#e2e8f0"),marginBottom:10,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,color:"#3b82f6",fontSize:13}}>{r.code}</span>
                  <PBadge p={r.priority}/>
                  <SBadge s={r.status}/>
                </div>
                <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{r.category} - {r.subcategory}</div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Torre {r.tower} / Unidad {r.unit}</div>
                <div style={{fontSize:12,color:"#374151"}}>{r.description}</div>
              </div>
              <div style={{fontSize:11,color:"#94a3b8",flexShrink:0}}>{fmtD(r.createdAt)}</div>
            </div>
            {r.comments&&r.comments.length>0&&(
              <div style={{marginTop:10,borderTop:"1px solid #f1f5f9",paddingTop:8}}>
                <div style={{fontSize:11,fontWeight:600,color:"#64748b",marginBottom:4}}>Último comentario</div>
                <div style={{fontSize:12,color:"#374151"}}>{r.comments[r.comments.length-1].text}</div>
              </div>
            )}
          </div>
        ))}</div>
      }
    </div>
  );
}
function WorkDetail({order,setOrders,showToast,role,mob,onBack}){
  const [o,setO]=useState(normalizeOrder(order));
  const fileRefB=useRef();const fileRefA=useRef();
  const isAdmin=role==="Administrador"||role==="Conserjeria";
  const canEdit=!["Cerrado","Rechazado"].includes(o.status);
  const upd=ch=>{const u={...o,...ch};setO(u);setOrders(p=>p.map(x=>x.id===o.id?u:x));};
  const advance=ns=>{upd({status:ns,history:[...o.history,{date:new Date().toISOString(),action:"Estado: "+(WS_LABEL[ns]||ns)}]});showToast("Estado: "+(WS_LABEL[ns]||ns));};
  const addPhoto=(field,e)=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>upd({[field]:[...o[field],ev.target.result]});r.readAsDataURL(f);e.target.value="";};
  const closeOrder=()=>{if(!o.photoAfter.length){showToast("Cargue foto del trabajo terminado","error");return;}upd({status:"Cerrado",history:[...o.history,{date:new Date().toISOString(),action:"Trabajo cerrado"}]});showToast("Orden cerrada","success");};
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}><button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:mob?15:18,color:"#6366f1"}}>{o.id}</span><PBadge p={o.priority}/><SBadge s={o.status}/></div></div></div>
      {canEdit&&(isAdmin||role==="Proveedor")&&<div style={{...card,padding:12,marginBottom:12}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {o.status==="Pendiente"&&<><button style={mkBtn("success")} onClick={()=>upd({status:"Aceptado",history:[...o.history,{date:new Date().toISOString(),action:"Aceptada"}]})}>Aceptar</button><button style={mkBtn("danger")} onClick={()=>upd({status:"Rechazado",history:[...o.history,{date:new Date().toISOString(),action:"Rechazada"}]})}>Rechazar</button></>}
        {o.status==="Aceptado"&&<button style={mkBtn("purple")} onClick={()=>advance("Diagnostico")}>Iniciar diagnostico</button>}
        {o.status==="Diagnostico"&&<button style={mkBtn("primary")} onClick={()=>advance("Ejecucion")}>Iniciar ejecucion</button>}
        {o.status==="Ejecucion"&&<button style={mkBtn("success")} onClick={()=>advance("Ejecutado")}>Marcar ejecutado</button>}
        {o.status==="Ejecutado"&&(isAdmin?<button style={mkBtn("success")} onClick={closeOrder}>Cerrar orden</button>:<span style={{fontSize:12,color:"#64748b"}}>Esperando cierre por administracion</span>)}
      </div></div>}
      <div style={card}><IR l="Titulo" v={o.title||"---"}/><IR l="Categoria" v={o.category||"---"}/><IR l="Ubicacion" v={o.location||"---"}/><IR l="Proveedor" v={o.provider||"---"}/></div>
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div style={{fontWeight:600,fontSize:13}}>Fotos ANTES ({o.photoBefore.length})</div>{canEdit&&<><input ref={fileRefB} type="file" accept="image/*" style={{display:"none"}} onChange={e=>addPhoto("photoBefore",e)}/><button style={mkBtn("secondary",true)} onClick={()=>fileRefB.current.click()}>+ Foto</button></>}</div>
        {o.photoBefore.length===0?<div style={{fontSize:12,color:"#94a3b8"}}>Sin fotos.</div>:<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{o.photoBefore.map((img,i)=><img key={i} src={img} alt="antes" style={{...thumb,width:100,height:80}}/>)}</div>}
      </div>
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div style={{fontWeight:600,fontSize:13}}>Fotos DESPUES ({o.photoAfter.length})</div>{canEdit&&<><input ref={fileRefA} type="file" accept="image/*" style={{display:"none"}} onChange={e=>addPhoto("photoAfter",e)}/><button style={mkBtn("primary",true)} onClick={()=>fileRefA.current.click()}>+ Foto</button></>}</div>
        {o.photoAfter.length===0?<div style={alrt("warning")}>Suba al menos una foto para cerrar la orden.</div>:<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{o.photoAfter.map((img,i)=><img key={i} src={img} alt="despues" style={{...thumb,width:100,height:80}}/>)}</div>}
        {canEdit&&isAdmin&&o.status==="Ejecutado"&&<button style={{...mkBtn("success"),marginTop:10,width:"100%",justifyContent:"center"}} onClick={closeOrder}>Cerrar orden de trabajo</button>}
      </div>
    </div>
  );
}

function Inspections({inspections,setInsp,reqs,setReqs,addEmail,showToast,role,mob,towers}){
  const [sub,setSub]=useState("list");const [selIns,setSelIns]=useState(null);
  const readOnly=!can(role,"inspection");
  if(sub==="new")return <InspForm inspections={inspections} setInsp={setInsp} reqs={reqs} setReqs={setReqs} addEmail={addEmail} showToast={showToast} role={role} onBack={()=>setSub("list")} mob={mob} towers={towers}/>;
  if(sub==="detail"&&selIns){const ins=inspections.find(i=>i.id===selIns.id)||selIns;return <InspDetail inspection={normalizeInsp(ins)} inspections={inspections} setInsp={setInsp} reqs={reqs} setReqs={setReqs} showToast={showToast} role={role} onBack={()=>setSub("list")} readOnly={readOnly} mob={mob} towers={towers}/>;}
  return(
    <div>
      <Grid cols={4} mob={mob}>
        <Kpi value={inspections.length} label="Total" color="#6366f1" mob={mob}/>
        <Kpi value={inspections.filter(i=>i.status==="Finalizada").length} label="Finalizadas" color="#10b981" mob={mob}/>
        <Kpi value={inspections.reduce((a,i)=>a+Object.values(i.items||{}).filter(v=>v.state==="Malo").length,0)} label="Hallazgos malos" color="#ef4444" mob={mob}/>
        <Kpi value={inspections.reduce((a,i)=>a+Object.values(i.items||{}).filter(v=>v.state==="Regular").length,0)} label="Regulares" color="#f59e0b" mob={mob}/>
      </Grid>
      <div style={{...card,padding:12,marginBottom:12,display:"flex",justifyContent:"flex-end"}}>{!readOnly&&<button style={mkBtn("primary",true)} onClick={()=>setSub("new")}>+ Nueva inspeccion</button>}</div>
      {inspections.length===0?<Empty msg="Sin inspecciones registradas"/>:<div>{[...inspections].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(ins=>{
        const items=ins.items||{};
        const mal=Object.values(items).filter(v=>v.state==="Malo").length;
        const reg=Object.values(items).filter(v=>v.state==="Regular").length;
        const bue=Object.values(items).filter(v=>v.state==="Bueno").length;
        return(<div key={ins.id} style={{...card,padding:12,marginBottom:8,cursor:"pointer",borderLeft:"4px solid "+(ins.status==="Finalizada"?"#10b981":"#f59e0b")}} onClick={()=>{setSelIns(ins);setSub("detail");}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div><span style={{fontWeight:700,color:"#6366f1",fontSize:13}}>{ins.id}</span><div style={{fontSize:12,color:"#64748b"}}>{ins.sector}</div><div style={{fontSize:11,color:"#94a3b8"}}>{fmt(ins.date)} - {ins.inspector}</div></div>
            <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}><span style={bdg(ins.status==="Finalizada"?"#10b981":"#f59e0b",ins.status==="Finalizada"?"#f0fdf4":"#fffbeb")}>{ins.status}</span><div style={{display:"flex",gap:4}}>{mal>0&&<span style={bdg("#ef4444","#fef2f2")}>{mal} malos</span>}{reg>0&&<span style={bdg("#f59e0b","#fffbeb")}>{reg} reg.</span>}{bue>0&&<span style={bdg("#10b981","#f0fdf4")}>{bue} ok</span>}</div></div>
          </div>
        </div>);
      })}</div>}
    </div>
  );
}
function InspForm({inspections,setInsp,reqs,setReqs,addEmail,showToast,role,onBack,mob,towers}){
  const nowStr=new Date().toISOString().slice(0,16);
  const towerSectors=(towers||[]).filter(t=>t.active).map(t=>t.label);
  const allSectors=[...towerSectors,...SECTOR_LIST.filter(s=>!towerSectors.includes(s))];
  const [meta,setMeta]=useState({date:nowStr,inspector:role,sector:allSectors[0]||SECTOR_LIST[0],conclusion:""});
  const [items,setItems]=useState(mkItems());const [actSec,setActSec]=useState("s1");
  const fileRef=useRef();const [pendImg,setPendImg]=useState(null);
  const setItem=(sid,name,field,val)=>{const k=sid+"_"+name;setItems(p=>({...p,[k]:{...p[k],[field]:val}}));};
  const getItem=(sid,name)=>items[sid+"_"+name]||{state:"",obs:"",urgency:"",images:[],reqId:null};
  const all=Object.values(items);const answered=all.filter(v=>v.state).length;const pct=Math.round((answered/all.length)*100);
  const handleImg=e=>{if(!pendImg)return;const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const{sid,name}=pendImg;setItem(sid,name,"images",[...(getItem(sid,name).images||[]),ev.target.result]);};r.readAsDataURL(f);e.target.value="";};
  const createReq=(sid,name)=>{
    const it=getItem(sid,name);const sec=CL_SECTIONS.find(s=>s.id===sid);
    const code=genCode(reqs,"SOL-");const now=new Date().toISOString();
    const pr=it.urgency==="Critica"?"Emergencia":it.urgency==="Alta"?"Alta":it.urgency==="Media"?"Media":"Baja";
    const nr=normalizeReq({id:code,code,createdAt:now,requesterName:meta.inspector,requesterEmail:"admin@condo.cl",requesterPhone:"",tower:"Comun",unit:meta.sector,category:"Espacios comunes",subcategory:sec?sec.label:"",description:"[Insp "+meta.sector+"] "+name+": "+(it.obs||""),priority:pr,status:"Ingresada",assignedTo:"Sin asignar",accessPermission:true,preferredTimeSlot:"Manana",history:[{date:now,user:meta.inspector,action:"Solicitud desde inspeccion",from:null,to:"Ingresada"}],dueDate:null,isUrgent:it.urgency==="Critica"});
    setReqs(p=>[nr,...p]);setItem(sid,name,"reqId",code);showToast("Solicitud "+code+" creada");
  };
  const save=st=>{
    if(!meta.sector||!meta.inspector){showToast("Complete sector e inspector","error");return;}
    if(st==="Finalizada"&&!meta.conclusion.trim()){showToast("Ingrese conclusion general","error");return;}
    const code=genCode(inspections,"INS-");
    setInsp(p=>[{id:code,date:meta.date,inspector:meta.inspector,sector:meta.sector,status:st,conclusion:meta.conclusion,items},...p]);
    showToast(st==="Finalizada"?"Inspeccion finalizada":"Borrador guardado");onBack();
  };
  const secIdx=CL_SECTIONS.findIndex(s=>s.id===actSec);const sec=CL_SECTIONS[secIdx];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button><div style={{fontWeight:700,fontSize:mob?15:18}}>Nueva Inspeccion</div></div>
      <div style={card}><div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:10}}><div style={fg}><label style={lbl}>Fecha y hora</label><input type="datetime-local" style={inp} value={meta.date} onChange={e=>setMeta(p=>({...p,date:e.target.value}))}/></div><div style={fg}><label style={lbl}>Inspector</label><input style={inp} value={meta.inspector} onChange={e=>setMeta(p=>({...p,inspector:e.target.value}))}/></div><div style={fg}><label style={lbl}>Sector</label><select style={selSt} value={meta.sector} onChange={e=>setMeta(p=>({...p,sector:e.target.value}))}>{allSectors.map(s=><option key={s}>{s}</option>)}</select></div></div></div>
      <div style={{...card,padding:14,marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><div style={{fontWeight:600,fontSize:12}}>Progreso: {answered}/{all.length}</div><div style={{display:"flex",gap:6}}><span style={bdg("#10b981","#f0fdf4")}>{all.filter(v=>v.state==="Bueno").length} ok</span><span style={bdg("#f59e0b","#fffbeb")}>{all.filter(v=>v.state==="Regular").length} reg.</span><span style={bdg("#ef4444","#fef2f2")}>{all.filter(v=>v.state==="Malo").length} malos</span></div></div><div style={{height:7,background:"#f1f5f9",borderRadius:99}}><div style={{height:7,background:pct===100?"#10b981":"#3b82f6",borderRadius:99,width:pct+"%",transition:"width .3s"}}/></div></div>
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12,paddingBottom:4}}>{CL_SECTIONS.map(s=>{const sm=s.items.map(n=>getItem(s.id,n)).filter(v=>v.state==="Malo").length;return <button key={s.id} style={mkBtn(actSec===s.id?"primary":"secondary",true)} onClick={()=>setActSec(s.id)}>{s.label.split(" ")[0]}{sm>0?" ["+sm+"]":""}</button>;})}</div>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
      {sec&&(
        <div style={card}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{sec.label}</div>
          {sec.items.map(name=>{
            const it=getItem(sec.id,name);
            const isMalo=it.state==="Malo";
            return(
              <div key={name} style={{borderBottom:"1px solid #f1f5f9",paddingBottom:12,marginBottom:12}}>
                <div style={{fontWeight:600,fontSize:12,marginBottom:6}}>{name}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                  {ITEM_STATES.map(s=><button key={s} onClick={()=>setItem(sec.id,name,"state",s)} style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:600,cursor:"pointer",border:"2px solid "+(it.state===s?ITEM_COLOR[s]:"#e2e8f0"),background:it.state===s?ITEM_COLOR[s]+"22":"#f9fafb",color:it.state===s?ITEM_COLOR[s]:"#6b7280"}}>{s}</button>)}
                </div>
                {(it.state&&it.state!=="No aplica")&&(
                  <div style={{display:"flex",gap:8,marginBottom:6}}>
                    <input style={{...inp,flex:1,fontSize:12}} placeholder="Observacion..." value={it.obs} onChange={e=>setItem(sec.id,name,"obs",e.target.value)}/>
                    {isMalo&&<select style={{...selSt,width:110,fontSize:12}} value={it.urgency} onChange={e=>setItem(sec.id,name,"urgency",e.target.value)}><option value="">Urgencia...</option>{URGENCY_LEVELS.map(u=><option key={u}>{u}</option>)}</select>}
                  </div>
                )}
                {(it.state==="Malo"||it.state==="Regular")&&(
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <button style={mkBtn("secondary",true)} onClick={()=>{setPendImg({sid:sec.id,name});fileRef.current.click();}}>Foto</button>
                    {(it.images||[]).map((img,i)=><img key={i} src={img} alt="" style={{...thumb,width:50,height:40}}/>)}
                    {isMalo&&!it.reqId&&<button style={mkBtn("danger",true)} onClick={()=>createReq(sec.id,name)}>+ Crear solicitud</button>}
                    {isMalo&&it.reqId&&<span style={bdg("#10b981","#f0fdf4")}>✓ {it.reqId}</span>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            {secIdx>0&&<button style={mkBtn("secondary",true)} onClick={()=>setActSec(CL_SECTIONS[secIdx-1].id)}>← Anterior</button>}
            {secIdx<CL_SECTIONS.length-1&&<button style={{...mkBtn("primary",true),marginLeft:"auto"}} onClick={()=>setActSec(CL_SECTIONS[secIdx+1].id)}>Siguiente →</button>}
          </div>
        </div>
      )}
      <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Conclusion general *</div><textarea style={{...inp,height:80,resize:"vertical"}} placeholder="Resuma los hallazgos..." value={meta.conclusion} onChange={e=>setMeta(p=>({...p,conclusion:e.target.value}))}/><div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={()=>save("Borrador")}>Guardar borrador</button><button style={mkBtn("primary",true)} onClick={()=>save("Finalizada")}>Finalizar</button></div></div>
    </div>
  );
}
function InspDetail({inspection,inspections,setInsp,reqs,setReqs,showToast,role,onBack,readOnly,mob}){
  const [tab,setTab]=useState("resumen");
  const safeItems=inspection.items||mkItems();
  const allEntries=Object.entries(safeItems);
  const malos=allEntries.filter(e=>e[1].state==="Malo");
  const regs=allEntries.filter(e=>e[1].state==="Regular");
  const bues=allEntries.filter(e=>e[1].state==="Bueno");
  const imgs=allEntries.filter(e=>(e[1].images||[]).length>0);
  const createReq=(key,it)=>{
    if(it.reqId){showToast("Ya existe solicitud","error");return;}
    const parts=key.split("_");const sid=parts[0];const name=parts.slice(1).join("_");
    const sec=CL_SECTIONS.find(s=>s.id===sid);
    const code=genCode(reqs,"SOL-");const now=new Date().toISOString();
    const pr=it.urgency==="Critica"?"Emergencia":it.urgency==="Alta"?"Alta":it.urgency==="Media"?"Media":"Baja";
    const nr=normalizeReq({id:code,code,createdAt:now,requesterName:inspection.inspector,requesterEmail:"admin@condo.cl",requesterPhone:"",tower:"Comun",unit:inspection.sector,category:"Espacios comunes",subcategory:sec?sec.label:"",description:"["+inspection.id+"] "+name+": "+(it.obs||""),priority:pr,status:"Ingresada",assignedTo:"Sin asignar",accessPermission:true,preferredTimeSlot:"Manana",history:[{date:now,user:inspection.inspector,action:"Solicitud desde inspeccion",from:null,to:"Ingresada"}],dueDate:null,isUrgent:it.urgency==="Critica"});
    setReqs(p=>[nr,...p]);
    setInsp(p=>p.map(i=>i.id!==inspection.id?i:{...i,items:{...i.items,[key]:{...i.items[key],reqId:code}}}));
    showToast("Solicitud "+code+" creada");
  };
  const tabs=[{id:"resumen",label:"Resumen"},{id:"hallazgos",label:"Hallazgos ("+(malos.length+regs.length)+")"},{id:"checklist",label:"Checklist"},{id:"galeria",label:"Galeria ("+imgs.length+")"}];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}><button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:mob?15:18}}>{inspection.id}</span><span style={bdg(inspection.status==="Finalizada"?"#10b981":"#f59e0b",inspection.status==="Finalizada"?"#f0fdf4":"#fffbeb")}>{inspection.status}</span></div><div style={{fontSize:11,color:"#64748b"}}>{inspection.sector} - {fmt(inspection.date)}</div></div></div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} accent="#6366f1"/>
      {tab==="resumen"&&<div><Grid cols={4} mob={mob}><Kpi value={bues.length+regs.length+malos.length} label="Items revisados" color="#3b82f6" mob={mob}/><Kpi value={bues.length} label="Buenos" color="#10b981" mob={mob}/><Kpi value={regs.length} label="Regulares" color="#f59e0b" mob={mob}/><Kpi value={malos.length} label="Malos" color="#ef4444" mob={mob}/></Grid><div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Conclusion</div><p style={{fontSize:13,color:"#374151",lineHeight:1.6,margin:0}}>{inspection.conclusion||"Sin conclusion."}</p></div></div>}
      {tab==="hallazgos"&&<div>{malos.length+regs.length===0?<Empty msg="Sin hallazgos"/>:[...malos,...regs].map(entry=>{const key=entry[0];const it=entry[1];const parts=key.split("_");const sid=parts[0];const name=parts.slice(1).join("_");const sec=CL_SECTIONS.find(s=>s.id===sid);const isMalo=it.state==="Malo";return(<div key={key} style={{...card,borderLeft:"4px solid "+(isMalo?"#ef4444":"#f59e0b"),padding:12,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{name}</div><div style={{fontSize:10,color:"#64748b"}}>{sec&&sec.label}</div>{it.obs&&<p style={{fontSize:12,margin:"4px 0 0"}}>{it.obs}</p>}</div><div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}><span style={bdg(ITEM_COLOR[it.state],ITEM_COLOR[it.state]+"22")}>{it.state}</span>{it.urgency&&<span style={bdg(URGENCY_COLOR[it.urgency],URGENCY_COLOR[it.urgency]+"22")}>{it.urgency}</span>}</div></div><div style={{display:"flex",gap:6,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>{(it.images||[]).map((img,i)=><img key={i} src={img} alt="" style={{...thumb,width:54,height:42}}/>)}{it.reqId?<span style={bdg("#10b981","#f0fdf4")}>✓ {it.reqId}</span>:(isMalo&&!readOnly&&<button style={mkBtn("danger",true)} onClick={()=>createReq(key,it)}>+ Crear solicitud</button>)}</div></div>);})}</div>}
      {tab==="checklist"&&<div>{CL_SECTIONS.map(sec=><div key={sec.id} style={{...card,marginBottom:8}}><div style={{fontWeight:700,fontSize:13,marginBottom:8}}>{sec.label}</div><table style={tbl}><thead><tr>{["Item","Estado","Observacion","Urgencia","Solicitud"].map(h=><th key={h} style={thSt}>{h}</th>)}</tr></thead><tbody>{sec.items.map(name=>{const it=safeItems[sec.id+"_"+name]||{};return(<tr key={name}><td style={tdSt}>{name}</td><td style={tdSt}>{it.state?<span style={bdg(ITEM_COLOR[it.state]||"#94a3b8",(ITEM_COLOR[it.state]||"#94a3b8")+"22")}>{it.state}</span>:"---"}</td><td style={tdSt}><span style={{fontSize:10,color:"#64748b"}}>{it.obs||"---"}</span></td><td style={tdSt}>{it.urgency?<span style={bdg(URGENCY_COLOR[it.urgency],URGENCY_COLOR[it.urgency]+"22")}>{it.urgency}</span>:"---"}</td><td style={tdSt}>{it.reqId?<span style={bdg("#10b981","#f0fdf4")}>{it.reqId}</span>:"---"}</td></tr>);})}</tbody></table></div>)}</div>}
      {tab==="galeria"&&<div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Galeria</div>{imgs.length===0?<Empty msg="Sin imagenes"/>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10}}>{imgs.map(entry=>{const key=entry[0];const it=entry[1];const name=key.split("_").slice(1).join("_");return(it.images||[]).map((img,i)=><div key={key+i} style={{textAlign:"center"}}><img src={img} alt={name} style={{width:"100%",height:90,objectFit:"cover",borderRadius:6,border:"1px solid #e2e8f0"}}/><div style={{fontSize:9,color:"#64748b",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div></div>);})}</div>}</div>}
    </div>
  );
}

function InvView({inventory,setInv,dispatch,setDispatch,reqs,role,showToast,mob,resps}){
  const [tab,setTab]=useState("stock");const [fi,setFi]=useState({cat:"",q:"",low:false});
  const [showForm,setShowForm]=useState(false);const [editItem,setEditItem]=useState(null);const [movement,setMov]=useState(null);const [showDis,setShowDis]=useState(null);
  const readOnly=can(role,"inventoryRead")&&!can(role,"inventory");
  const noAccess=!can(role,"inventory")&&!can(role,"inventoryRead");
  if(noAccess)return <Empty msg="Sin acceso a este modulo"/>;
  const visible=inventory.filter(i=>(!fi.cat||i.category===fi.cat)&&(!fi.q||(i.name+" "+i.category).toLowerCase().includes(fi.q.toLowerCase()))&&(!fi.low||i.stock<i.minStock)).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const lowStock=inventory.filter(i=>i.stock<i.minStock).length;
  const totalVal=inventory.reduce((s,i)=>s+(i.stock*i.cost),0);
  const saveItem=item=>{if(editItem){setInv(p=>p.map(i=>i.id===item.id?item:i));showToast("Actualizado");}else{setInv(p=>[...p,{...item,id:"inv"+uid(),lastUpdated:new Date().toISOString().slice(0,10)}]);showToast("Agregado");}setShowForm(false);setEditItem(null);};
  const adjStock=(id,delta)=>{setInv(p=>p.map(i=>i.id===id?{...i,stock:Math.max(0,i.stock+delta),lastUpdated:new Date().toISOString().slice(0,10)}:i));showToast("Stock actualizado");setMov(null);};
  const confDis=d=>{setInv(p=>p.map(i=>i.id===d.invId?{...i,stock:Math.max(0,i.stock-d.qty)}:i));setDispatch(p=>[{...d,id:"d"+uid(),date:new Date().toISOString()},...p]);showToast("Designado a "+d.provider);setShowDis(null);};
  const invTabs=[{id:"stock",label:"Stock"},{id:"dis",label:"Designaciones ("+dispatch.length+")"}];
  return(
    <div>
      <Grid cols={4} mob={mob}><Kpi value={inventory.length} label="Total insumos" color="#6366f1" mob={mob}/><Kpi value={lowStock} label="Stock critico" color="#ef4444" mob={mob}/><Kpi value={inventory.filter(i=>i.stock>=i.minStock).length} label="Stock OK" color="#10b981" mob={mob}/><Kpi value={"$"+totalVal.toLocaleString("es-CL")} label="Valor total" color="#3b82f6" mob={mob}/></Grid>
      {lowStock>0&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:12}} onClick={()=>setFi(p=>({...p,low:true}))}><span style={{fontWeight:700,color:"#dc2626"}}>⚠</span><strong style={{color:"#dc2626"}}>{lowStock} insumo(s) bajo el minimo</strong></div>}
      <Tabs tabs={invTabs} active={tab} onChange={setTab}/>
      {tab==="stock"&&<div>
        <div style={{...card,padding:12,marginBottom:12}}><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><input style={{...inp,flex:2,minWidth:120}} placeholder="Buscar..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/><select style={{...selSt,flex:1}} value={fi.cat} onChange={e=>setFi(p=>({...p,cat:e.target.value}))}><option value="">Todas las categorias</option>{INV_CATS.map(c=><option key={c}>{c}</option>)}</select><button style={mkBtn(fi.low?"warning":"secondary",true)} onClick={()=>setFi(p=>({...p,low:!p.low}))}>Critico</button>{!readOnly&&<button style={mkBtn("primary",true)} onClick={()=>{setEditItem(null);setShowForm(true);}}>+ Agregar</button>}</div></div>
        {visible.length===0?<Empty msg="Sin insumos"/>:<div>{visible.map(item=>{const low=item.stock<item.minStock;return(<div key={item.id} style={{...card,borderLeft:"4px solid "+(low?"#ef4444":"#10b981"),padding:12,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{item.name}</div><div style={{fontSize:11,color:"#64748b"}}>{item.category} - {item.location}</div></div><div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:700,fontSize:16,color:low?"#ef4444":"#1e293b"}}>{item.stock} <span style={{fontSize:11,fontWeight:400}}>{item.unit}</span></div><div style={{fontSize:10,color:"#94a3b8"}}>min: {item.minStock}</div>{low&&<span style={bdg("#ef4444","#fef2f2")}>Bajo</span>}</div></div>{!readOnly&&<div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}><button style={mkBtn("secondary",true)} onClick={()=>setMov({item,dir:1})}>+ Stock</button><button style={mkBtn("secondary",true)} onClick={()=>setMov({item,dir:-1})}>- Stock</button><button style={mkBtn("purple",true)} onClick={()=>setShowDis(item)}>Designar</button><button style={mkBtn("ghost",true)} onClick={()=>{setEditItem(item);setShowForm(true);}}>Editar</button><button style={mkBtn("ghost",true)} onClick={()=>setInv(p=>p.filter(i=>i.id!==item.id))}>Eliminar</button></div>}</div>);})}</div>}
      </div>}
      {tab==="dis"&&<div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Historial de designaciones</div>{dispatch.length===0?<Empty msg="Sin designaciones"/>:<table style={tbl}><thead><tr>{["Fecha","Insumo","Proveedor","Cantidad","Solicitud"].map(h=><th key={h} style={thSt}>{h}</th>)}</tr></thead><tbody>{[...dispatch].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((d,i)=>{const req=reqs.find(r=>r.id===d.requestId);return(<tr key={d.id||i}><td style={tdSt}><span style={{fontSize:11,color:"#64748b"}}>{fmt(d.date)}</span></td><td style={tdSt}><span style={{fontWeight:600}}>{d.invName}</span></td><td style={tdSt}>{d.provider}</td><td style={tdSt}><span style={{fontWeight:700,color:"#6366f1"}}>{d.qty} {d.unit}</span></td><td style={tdSt}>{req?<span style={bdg("#3b82f6","#eff6ff")}>{req.code}</span>:"---"}</td></tr>);})}</tbody></table>}</div>}
      {showForm&&<InvForm item={editItem} onSave={saveItem} onClose={()=>{setShowForm(false);setEditItem(null);}}/>}
      {movement&&<StockModal data={movement} onConfirm={adjStock} onClose={()=>setMov(null)}/>}
      {showDis&&<DisModal item={showDis} reqs={reqs} onConfirm={confDis} onClose={()=>setShowDis(null)} resps={resps}/>}
    </div>
  );
}
function InvForm({item,onSave,onClose}){
  const [f,setF]=useState({name:"",category:INV_CATS[0],unit:INV_UNITS[0],stock:0,minStock:1,location:"Bodega A",cost:0,supplier:"",notes:"",...(item||{})});
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:500,padding:"20px",marginTop:16}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>{item?"Editar":"Nuevo"} insumo</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Nombre *</label><input style={inp} value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></div>
      <div style={fg}><label style={lbl}>Categoria</label><select style={selSt} value={f.category} onChange={e=>setF(p=>({...p,category:e.target.value}))}>{INV_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Unidad</label><select style={selSt} value={f.unit} onChange={e=>setF(p=>({...p,unit:e.target.value}))}>{INV_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Stock actual</label><input type="number" min="0" style={inp} value={f.stock} onChange={e=>setF(p=>({...p,stock:Math.max(0,+e.target.value)}))}/></div>
      <div style={fg}><label style={lbl}>Stock minimo</label><input type="number" min="0" style={inp} value={f.minStock} onChange={e=>setF(p=>({...p,minStock:Math.max(0,+e.target.value)}))}/></div>
      <div style={fg}><label style={lbl}>Costo unit.</label><input type="number" min="0" style={inp} value={f.cost} onChange={e=>setF(p=>({...p,cost:Math.max(0,+e.target.value)}))}/></div>
      <div style={fg}><label style={lbl}>Ubicacion</label><input style={inp} value={f.location} onChange={e=>setF(p=>({...p,location:e.target.value}))}/></div>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Proveedor</label><input style={inp} value={f.supplier} onChange={e=>setF(p=>({...p,supplier:e.target.value}))}/></div>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.name.trim())return;onSave(f);}}>Guardar</button></div>
  </div></div>);
}
function StockModal({data,onConfirm,onClose}){
  const [qty,setQty]=useState(1);const isIn=data.dir>0;
  const max=isIn?9999:data.item.stock;
  const safeQty=Math.min(Math.max(1,qty),max);
  const resultante=data.item.stock+(isIn?safeQty:-safeQty);
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:380,padding:"20px",marginTop:16}}>
    <h3 style={{margin:"0 0 12px",fontSize:15}}>{isIn?"Ingreso":"Egreso"} - {data.item.name}</h3>
    <div style={{...alrt(isIn?"success":"error"),marginBottom:12}}>Stock actual: <strong>{data.item.stock} {data.item.unit}</strong></div>
    <div style={fg}><label style={lbl}>Cantidad</label><input type="number" min="1" max={max} style={inp} value={qty} onChange={e=>setQty(Math.max(1,+e.target.value))}/></div>
    <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Resultante: <strong>{resultante} {data.item.unit}</strong></div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn(isIn?"success":"danger",true)} disabled={!isIn&&qty>data.item.stock} onClick={()=>onConfirm(data.item.id,isIn?safeQty:-safeQty)}>{isIn?"Confirmar ingreso":"Confirmar egreso"}</button></div>
  </div></div>);
}
function DisModal({item,reqs,onConfirm,onClose,resps}){
  const RESP_ASSIGNABLE=getRespAssignable(resps);
  const [f,setF]=useState({provider:RESP_ASSIGNABLE[0]||"",qty:1,requestId:"",notes:""});
  const actReqs=reqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status));
  const ok=f.provider&&f.qty>=1&&f.qty<=item.stock;
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:500,padding:"20px",marginTop:16}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>Designar insumo</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
    <div style={{...alrt("success"),display:"flex",justifyContent:"space-between"}}><span><strong>{item.name}</strong></span><span>Stock: <strong>{item.stock} {item.unit}</strong></span></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:12}}>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Proveedor *</label><select style={selSt} value={f.provider} onChange={e=>setF(p=>({...p,provider:e.target.value}))}>{RESP_ASSIGNABLE.map(r=><option key={r}>{r}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Cantidad * (max: {item.stock})</label><input type="number" min="1" max={item.stock} style={inp} value={f.qty} onChange={e=>setF(p=>({...p,qty:Math.max(1,+e.target.value)}))}/></div>
      <div style={fg}><label style={lbl}>Unidad</label><input style={{...inp,background:"#f9fafb",color:"#6b7280"}} value={item.unit} disabled/></div>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Solicitud asociada</label><select style={selSt} value={f.requestId} onChange={e=>setF(p=>({...p,requestId:e.target.value}))}><option value="">Sin asociar</option>{actReqs.map(r=><option key={r.id} value={r.id}>{r.code} - {r.category}</option>)}</select></div>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Notas</label><input style={inp} value={f.notes} onChange={e=>setF(p=>({...p,notes:e.target.value}))}/></div>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("purple",true)} onClick={()=>{if(!ok)return;onConfirm({invId:item.id,invName:item.name,provider:f.provider,qty:f.qty,unit:item.unit,requestId:f.requestId,notes:f.notes});}} disabled={!ok}>Confirmar</button></div>
  </div></div>);
}

function EmailsView({logs, setEmails, role}){
  const [q,setQ]=useState("");
  const visible=[...logs].sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(e=>!q||((e.to||"")+(e.subject||"")+(e.requestId||"")).toLowerCase().includes(q.toLowerCase()));
  return(<div>
    <div style={{...card,padding:12,marginBottom:12,display:"flex",gap:8}}>
      <input style={{...inp,flex:1}} placeholder="Buscar..." value={q} onChange={e=>setQ(e.target.value)}/>
      {can(role,"manageConfig")&&logs.length>0&&<button style={mkBtn("danger",true)} onClick={()=>{if(window.confirm("¿Eliminar todos los correos del registro?"))setEmails([]);}}>🗑 Limpiar todo</button>}
    </div>
    <div style={card}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Bandeja de correos</div><span style={bdg("#10b981","#f0fdf4")}>{logs.length} enviados</span></div>
      {visible.length===0?<Empty msg="Sin correos"/>:visible.map((e,i)=><div key={e.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0"}}>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
          <span style={{fontWeight:600,fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.subject}</span>
          <span style={bdg("#6366f1","#eef2ff")}>{e.type}</span>
          <span style={bdg("#10b981","#f0fdf4")}>{e.status}</span>
          {can(role,"manageConfig")&&<button style={{...mkBtn("ghost",true),padding:"2px 6px",fontSize:11,color:"#ef4444"}} onClick={()=>setEmails(p=>p.filter(x=>(x.id||x)!==(e.id||e)))}>🗑</button>}
        </div>
        <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{e.to} - {fmt(e.date)}</div>
        <div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4}}>{e.body}</div>
      </div>)}
    </div>
  </div>);
}

function Reports({reqs,tasks,inventory,mob,resps}){
  const RESP_ASSIGNABLE=getRespAssignable(resps);
  const byCat=Object.keys(DEF_CATS).map(c=>({c,n:reqs.filter(r=>r.category===c).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  const maxCat=Math.max(...byCat.map(x=>x.n),1);
  const byResp=RESP_ASSIGNABLE.map(r=>({r,c:tasks.filter(t=>t.responsible===r).length})).sort((a,b)=>b.c-a.c);
  return(<div>
    <Grid cols={4} mob={mob}>{PRIORITIES.map(p=><Kpi key={p} value={reqs.filter(r=>r.priority===p).length} label={p} color={PRIORITY_COLOR[p]} mob={mob}/>)}</Grid>
    <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
      <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Por estado</div>{STATUSES.map(s=>{const c=reqs.filter(r=>r.status===s).length;return c?<div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><SBadge s={s}/><span style={{fontWeight:600}}>{c}</span></div>:null;})}</div>
      <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Por categoria</div>{byCat.length===0?<Empty msg="Sin datos"/>:byCat.map(x=><div key={x.c} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{x.c}</span><span style={{fontWeight:600}}>{x.n}</span></div><div style={{height:5,background:"#f1f5f9",borderRadius:99}}><div style={{height:5,background:"#6366f1",borderRadius:99,width:(x.n/maxCat*100)+"%"}}/></div></div>)}</div>
      <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Tareas por responsable</div>{byResp.map(x=><div key={x.r} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,fontSize:12}}><span>{x.r}</span><span style={bdg("#3b82f6","#eff6ff")}>{x.c} tareas</span></div>)}</div>
      <div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Resumen general</div><IR l="Total solicitudes" v={reqs.length}/><IR l="Casos activos" v={reqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status)).length}/><IR l="Casos cerrados" v={reqs.filter(r=>r.status==="Cerrada").length}/><IR l="Emergencias" v={reqs.filter(r=>r.priority==="Emergencia").length}/><IR l="Total tareas" v={tasks.length}/><IR l="Insumos stock critico" v={inventory.filter(i=>i.stock<i.minStock).length}/></div>
    </div>
  </div>);
}

function MantView({mant,setMant,reqs,role,showToast,addEmail,mob,resps}){
  const [sub,setSub]=useState("list");const [sel,setSel]=useState(null);const [showForm,setShowForm]=useState(false);const [editItem,setEdit]=useState(null);const [fi,setFi]=useState({cat:"",status:"",q:""});
  const readOnly=!can(role,"mantencion");
  const enriched=mant.map(m=>({...m,computedStatus:getMantStatus(m)}));
  const vencidas=enriched.filter(m=>m.computedStatus==="Vencida").length;
  const porVencer=enriched.filter(m=>m.computedStatus==="Por vencer").length;
  const vigentes=enriched.filter(m=>m.computedStatus==="Vigente").length;
  const enEjec=enriched.filter(m=>m.computedStatus==="En ejecucion").length;
  const visible=enriched.filter(m=>{
    if(fi.cat&&m.category!==fi.cat)return false;
    if(fi.status&&m.computedStatus!==fi.status)return false;
    if(fi.q&&!((m.asset||"")+" "+(m.category||"")+" "+(m.provider||"")).toLowerCase().includes(fi.q.toLowerCase()))return false;
    return true;
  }).sort((a,b)=>{const ord={Vencida:0,"Por vencer":1,"En ejecucion":2,Vigente:3,Completada:4};return((ord[a.computedStatus]??9)-(ord[b.computedStatus]??9));});
  const saveMant=item=>{
    const ts=new Date().toISOString();
    if(editItem){setMant(p=>p.map(m=>m.id===item.id?item:m));showToast("Mantencion actualizada");}
    else{
      const code=genCode(mant,"MAN-");
      const nr=normalizeMant({...item,id:code,code,createdAt:ts});
      setMant(p=>[nr,...p]);
      addEmail({requestId:code,date:ts,to:"admin@condo.cl",subject:"Nueva mantencion "+code+" - "+item.asset,type:"Mantencion",status:"Enviado",body:"Se registro mantencion "+code+" para "+item.asset+"."});
      showToast("Mantencion "+code+" creada");
    }
    setShowForm(false);setEdit(null);
  };
  if(sub==="detail"&&sel){
    const item=normalizeMant(mant.find(m=>m.id===sel.id)||sel);
    return <MantDetail item={item} mant={mant} setMant={setMant} reqs={reqs} role={role} showToast={showToast} addEmail={addEmail} mob={mob} readOnly={readOnly} onBack={()=>setSub("list")} resps={resps}/>;
  }
  return(
    <div>
      {vencidas>0&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontWeight:700,color:"#dc2626",fontSize:16}}>✗</span><div><strong style={{color:"#dc2626"}}>{vencidas} mantencion(es) vencida(s)</strong></div></div>}
      {porVencer>0&&<div style={{...card,background:"#fffbeb",border:"1px solid #fde68a",display:"flex",alignItems:"center",gap:10,marginBottom:12}}><span style={{fontWeight:700,color:"#92400e",fontSize:16}}>!</span><strong style={{color:"#92400e"}}>{porVencer} mantencion(es) vencen en los proximos 30 dias</strong></div>}
      <Grid cols={4} mob={mob}><Kpi value={vencidas} label="Vencidas" color="#ef4444" mob={mob}/><Kpi value={porVencer} label="Por vencer" color="#f59e0b" mob={mob}/><Kpi value={enEjec} label="En ejecucion" color="#6366f1" mob={mob}/><Kpi value={vigentes} label="Vigentes" color="#10b981" mob={mob}/></Grid>
      <div style={{...card,padding:12,marginBottom:12}}><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><input style={{...inp,flex:2,minWidth:120}} placeholder="Buscar activo, proveedor..." value={fi.q} onChange={e=>setFi(p=>({...p,q:e.target.value}))}/><select style={{...selSt,flex:1}} value={fi.cat} onChange={e=>setFi(p=>({...p,cat:e.target.value}))}><option value="">Todas las categorias</option>{MANT_CATS.map(c=><option key={c}>{c}</option>)}</select><select style={{...selSt,flex:1}} value={fi.status} onChange={e=>setFi(p=>({...p,status:e.target.value}))}><option value="">Todos los estados</option>{MANT_ESTADOS.map(s=><option key={s}>{s}</option>)}</select>{!readOnly&&<button style={mkBtn("primary",true)} onClick={()=>{setEdit(null);setShowForm(true);}}>+ Nueva mantencion</button>}</div></div>
      {visible.length===0?<Empty msg="Sin mantenciones registradas"/>:<div>{visible.map(m=>{
        const daysLeft=m.nextDate?Math.ceil((new Date(m.nextDate)-new Date())/86400000):null;
        const dayColor=daysLeft===null?"#374151":daysLeft<0?"#ef4444":daysLeft<=30?"#f59e0b":"#374151";
        return(<div key={m.id} style={{...card,borderLeft:"4px solid "+(MANT_SC[m.computedStatus]||"#e2e8f0"),marginBottom:10,padding:14,cursor:"pointer"}} onClick={()=>{setSel(m);setSub("detail");}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:0}}><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}><span style={{fontWeight:700,color:"#6366f1",fontSize:11}}>{m.code}</span><span style={bdg("#6b7280","#f1f5f9")}>{m.tipo}</span></div><div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{m.asset}</div><div style={{fontSize:11,color:"#64748b"}}>{m.subcategory} - {m.location}</div></div>
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end",flexShrink:0}}><MBadge m={m}/>{m.nextDate&&<div style={{fontSize:11,textAlign:"right",color:dayColor,fontWeight:600}}>{daysLeft!==null&&(daysLeft<0?Math.abs(daysLeft)+" dias vencida":daysLeft+" dias restantes")}</div>}</div>
          </div>
          {!readOnly&&<div style={{display:"flex",gap:6,marginTop:10}} onClick={e=>e.stopPropagation()}><button style={mkBtn("secondary",true)} onClick={()=>{setEdit(m);setShowForm(true);}}>Editar</button><button style={mkBtn("ghost",true)} onClick={()=>setMant(p=>p.filter(x=>x.id!==m.id))}>Eliminar</button></div>}
        </div>);
      })}</div>}
      {showForm&&<MantForm item={editItem} reqs={reqs} onSave={saveMant} onClose={()=>{setShowForm(false);setEdit(null);}} resps={resps}/>}
    </div>
  );
}
function MantForm({item,reqs,onSave,onClose,resps}){
  const RESP_LIST=getRespList(resps);
  const defCat=MANT_CATS[0];
  const [f,setF]=useState({asset:"",category:defCat,subcategory:MANT_SUBCATS[defCat][0],location:"",tipo:MANT_TIPOS[0],responsible:RESP_LIST[0],provider:"",lastDate:"",nextDate:"",costEstimated:"",costReal:"",description:"",status:"Vigente",requestId:"",...(item||{})});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const subs=MANT_SUBCATS[f.category]||[];
  const handleCatChange=e=>{const nc=e.target.value;const ns=MANT_SUBCATS[nc]||[];set("category",nc);if(!ns.includes(f.subcategory))set("subcategory",ns[0]||"");};
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:600,padding:"20px",marginTop:16,marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>{item?"Editar":"Nueva"} mantencion</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Activo *</label><input style={inp} value={f.asset} onChange={e=>set("asset",e.target.value)} placeholder="ej: Ascensor Torre A"/></div>
      <div style={fg}><label style={lbl}>Categoria</label><select style={selSt} value={f.category} onChange={handleCatChange}>{MANT_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Subcategoria</label><select style={selSt} value={f.subcategory} onChange={e=>set("subcategory",e.target.value)}>{subs.map(s=><option key={s}>{s}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Ubicacion</label><input style={inp} value={f.location} onChange={e=>set("location",e.target.value)}/></div>
      <div style={fg}><label style={lbl}>Tipo</label><select style={selSt} value={f.tipo} onChange={e=>set("tipo",e.target.value)}>{MANT_TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Responsable</label><select style={selSt} value={f.responsible} onChange={e=>set("responsible",e.target.value)}>{RESP_LIST.map(r=><option key={r}>{r}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Proveedor</label><input style={inp} value={f.provider} onChange={e=>set("provider",e.target.value)}/></div>
      <div style={fg}><label style={lbl}>Ultima mantencion</label><input type="date" style={inp} value={f.lastDate} onChange={e=>set("lastDate",e.target.value)}/></div>
      <div style={fg}><label style={lbl}>Prox. vencimiento</label><input type="date" style={inp} value={f.nextDate} onChange={e=>set("nextDate",e.target.value)}/></div>
      <div style={fg}><label style={lbl}>Costo estimado</label><input type="number" min="0" style={inp} value={f.costEstimated} onChange={e=>set("costEstimated",e.target.value)}/></div>
      <div style={fg}><label style={lbl}>Costo real</label><input type="number" min="0" style={inp} value={f.costReal} onChange={e=>set("costReal",e.target.value)}/></div>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Descripcion</label><textarea style={{...inp,height:70,resize:"vertical"}} value={f.description} onChange={e=>set("description",e.target.value)}/></div>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.asset.trim())return;onSave(f);}}>Guardar</button></div>
  </div></div>);
}
function MantDetail({item,mant,setMant,reqs,role,showToast,addEmail,mob,readOnly,onBack,resps}){
  const RESP_LIST=getRespList(resps);
  const m=normalizeMant(mant.find(x=>x.id===item.id)||item);
  const st=getMantStatus(m);
  const [tab,setTab]=useState("info");const [cmt,setCmt]=useState("");const [showHistForm,setShowHistForm]=useState(false);const [showDocForm,setShowDocForm]=useState(false);
  const upd=ch=>setMant(p=>p.map(x=>x.id===m.id?{...x,...ch}:x));
  const addCmt=()=>{if(!cmt.trim())return;upd({comments:[...m.comments,{user:role,date:new Date().toISOString(),text:cmt}]});setCmt("");showToast("Comentario agregado");};
  const addHist=h=>{upd({history:[...m.history,{id:"h"+uid(),...h,costReal:+h.costReal}],lastDate:h.date,...(h.marcarVigente?{status:"Vigente"}:{})});showToast("Ejecucion registrada");setShowHistForm(false);};
  const addDoc=d=>{upd({documents:[...m.documents,{id:"doc"+uid(),...d,date:new Date().toISOString().slice(0,10)}]});showToast("Documento agregado");setShowDocForm(false);};
  const setStatus=ns=>{upd({status:ns});showToast("Estado actualizado");};
  const daysLeft=m.nextDate?Math.ceil((new Date(m.nextDate)-new Date())/86400000):null;
  const tabs=[{id:"info",label:"Informacion"},{id:"history",label:"Historial ("+m.history.length+")"},{id:"docs",label:"Documentos ("+m.documents.length+")"},{id:"comments",label:"Comentarios ("+m.comments.length+")"}];
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}><button style={mkBtn("secondary",true)} onClick={onBack}>← Volver</button><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:mob?15:18}}>{m.asset}</span><MBadge m={m}/></div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{m.code} - {m.category}</div></div></div>
      {st==="Vencida"&&<div style={{...card,background:"#fef2f2",border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,color:"#dc2626",fontSize:16}}>✗</span><strong style={{color:"#dc2626"}}>VENCIDA - hace {Math.abs(daysLeft||0)} dias</strong></div>}
      {!readOnly&&<div style={{...card,padding:12,marginBottom:12}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><select style={{...selSt,width:160}} value={m.status} onChange={e=>setStatus(e.target.value)}>{MANT_ESTADOS.map(s=><option key={s}>{s}</option>)}</select><button style={mkBtn("success",true)} onClick={()=>setShowHistForm(true)}>+ Registrar ejecucion</button><button style={mkBtn("secondary",true)} onClick={()=>setShowDocForm(true)}>+ Documento</button></div></div>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} accent="#6366f1"/>
      {tab==="info"&&<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:12}}>
        <div style={card}><IR l="Codigo" v={m.code}/><IR l="Categoria" v={(m.category||"")+" / "+(m.subcategory||"")}/><IR l="Ubicacion" v={m.location}/><IR l="Tipo" v={m.tipo}/><IR l="Responsable" v={m.responsible}/><IR l="Proveedor" v={m.provider}/></div>
        <div style={card}><IR l="Ultima mantencion" v={m.lastDate?fmtD(m.lastDate):"No registrada"}/><IR l="Prox. vencimiento" v={m.nextDate?fmtD(m.nextDate):"No definida"}/><IR l="Dias restantes" v={daysLeft===null?"---":daysLeft<0?Math.abs(daysLeft)+" vencida":daysLeft+" dias"}/><IR l="Costo estimado" v={m.costEstimated?"$"+Number(m.costEstimated).toLocaleString("es-CL"):"---"}/><IR l="Costo real" v={m.costReal?"$"+Number(m.costReal).toLocaleString("es-CL"):"Pendiente"}/></div>
        <div style={{...card,gridColumn:"1/-1"}}><p style={{fontSize:13,color:"#374151",margin:0}}>{m.description||"Sin descripcion."}</p></div>
      </div>}
      {tab==="history"&&<div>{!readOnly&&!showHistForm&&<button style={{...mkBtn("success",true),marginBottom:12}} onClick={()=>setShowHistForm(true)}>+ Registrar ejecucion</button>}{showHistForm&&<HistForm onSave={addHist} onClose={()=>setShowHistForm(false)} resps={resps}/>}{m.history.length===0&&!showHistForm?<Empty msg="Sin historial"/>:<div>{[...m.history].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(h=><div key={h.id||h.date} style={{...card,borderLeft:"4px solid #6366f1",marginBottom:8}}><div style={{fontWeight:600,fontSize:13}}>{h.tipo} - {fmtD(h.date)}</div><div style={{fontSize:11,color:"#64748b"}}>{h.responsible}</div>{h.notes&&<p style={{fontSize:12,margin:"6px 0 0"}}>{h.notes}</p>}{h.costReal>0&&<span style={bdg("#10b981","#f0fdf4")}>${Number(h.costReal).toLocaleString("es-CL")}</span>}</div>)}</div>}</div>}
      {tab==="docs"&&<div>{!readOnly&&!showDocForm&&<button style={{...mkBtn("secondary",true),marginBottom:12}} onClick={()=>setShowDocForm(true)}>+ Agregar documento</button>}{showDocForm&&<DocForm onSave={addDoc} onClose={()=>setShowDocForm(false)}/>}{m.documents.length===0&&!showDocForm?<Empty msg="Sin documentos"/>:m.documents.map(d=><div key={d.id} style={{...card,display:"flex",alignItems:"center",gap:12,marginBottom:8}}><div style={{fontWeight:600,fontSize:13}}>{d.name}</div><div style={{fontSize:11,color:"#64748b"}}>{fmtD(d.date)}</div></div>)}</div>}
      {tab==="comments"&&<div style={card}>{m.comments.map((c,i)=><div key={i} style={{borderLeft:"3px solid #e2e8f0",paddingLeft:10,marginBottom:10}}><strong style={{fontSize:12}}>{c.user}</strong><span style={{fontSize:10,color:"#94a3b8",marginLeft:8}}>{fmt(c.date)}</span><p style={{margin:"4px 0 0",fontSize:13}}>{c.text}</p></div>)}{!readOnly&&<div style={{marginTop:10,display:"flex",gap:8}}><input style={{...inp,flex:1}} placeholder="Comentario..." value={cmt} onChange={e=>setCmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCmt()}/><button style={mkBtn("primary",true)} onClick={addCmt}>Enviar</button></div>}</div>}
    </div>
  );
}
function HistForm({onSave,onClose,resps}){
  const RESP_LIST=getRespList(resps);
  const [f,setF]=useState({date:new Date().toISOString().slice(0,10),tipo:MANT_TIPOS[0],responsible:RESP_LIST[0]||"",notes:"",costReal:0,marcarVigente:false});
  return(<div style={{...card,border:"2px solid #6366f1",marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Registrar ejecucion</div><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div style={fg}><label style={lbl}>Fecha</label><input type="date" style={inp} value={f.date} onChange={e=>setF(p=>({...p,date:e.target.value}))}/></div>
      <div style={fg}><label style={lbl}>Tipo</label><select style={selSt} value={f.tipo} onChange={e=>setF(p=>({...p,tipo:e.target.value}))}>{MANT_TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Responsable</label><select style={selSt} value={f.responsible} onChange={e=>setF(p=>({...p,responsible:e.target.value}))}>{RESP_LIST.map(r=><option key={r}>{r}</option>)}</select></div>
      <div style={fg}><label style={lbl}>Costo real</label><input type="number" min="0" style={inp} value={f.costReal} onChange={e=>setF(p=>({...p,costReal:Math.max(0,+e.target.value)}))}/></div>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Notas</label><textarea style={{...inp,height:60,resize:"vertical"}} value={f.notes} onChange={e=>setF(p=>({...p,notes:e.target.value}))}/></div>
      <div style={{...fg,gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" id="mv" checked={f.marcarVigente} onChange={e=>setF(p=>({...p,marcarVigente:e.target.checked}))}/><label htmlFor="mv" style={{fontSize:12,cursor:"pointer"}}>Marcar como Vigente</label></div>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("success",true)} onClick={()=>{if(!f.date)return;onSave(f);}}>Registrar</button></div>
  </div>);
}
function DocForm({onSave,onClose}){
  const [f,setF]=useState({name:"",notes:""});
  return(<div style={{...card,border:"2px solid #e2e8f0",marginBottom:12}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><div style={{fontWeight:600,fontSize:13}}>Agregar documento</div><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
    <div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></div>
    <div style={fg}><label style={lbl}>Notas</label><input style={inp} value={f.notes} onChange={e=>setF(p=>({...p,notes:e.target.value}))}/></div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.name.trim())return;onSave(f);}}>Agregar</button></div>
  </div>);
}

function ConfigView({cats,setCats,towers,setTowers,resps,setResps,showToast,session}){
  const [editCat,setEditCat]=useState(null);const [showCF,setShowCF]=useState(false);
  const [editTow,setEditTow]=useState(null);const [showTF,setShowTF]=useState(false);
  const [editResp,setEditResp]=useState(null);const [showRF,setShowRF]=useState(false);
  const [tab,setTab]=useState("cats");
  const [usuarios,setUsuarios]=useState([]);const [showUF,setShowUF]=useState(false);const [editUser,setEditUser]=useState(null);

  useEffect(()=>{ if(tab==="usuarios") loadUsuarios(); },[tab]);
  const loadUsuarios=async()=>{
    try{const res=await fetch(`${SUPA_URL}/rest/v1/usuarios?order=created_at.asc&select=*`,{headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${session.token}`}});const data=await res.json();setUsuarios(Array.isArray(data)?data:[]);}catch(e){console.error(e);}
  };
  const saveUsuario=async(u)=>{
    try{
      if(u.isNew){
        await fetch(`${SUPA_URL}/rest/v1/usuarios`,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${session.token}`,"Prefer":"return=representation"},body:JSON.stringify({email:u.email,nombre:u.nombre,rol:u.rol,active:true})});
        showToast("Usuario creado");
      } else {
        await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${u.id}`,{method:"PATCH",headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${session.token}`},body:JSON.stringify({nombre:u.nombre,rol:u.rol,active:u.active??true})});
        showToast("Usuario actualizado");
      }
      loadUsuarios();setShowUF(false);setEditUser(null);
    }catch(e){showToast("Error: "+e.message,"error");}
  };
  const toggleUser=async(u)=>{
    try{await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${u.id}`,{method:"PATCH",headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${session.token}`},body:JSON.stringify({active:!u.active})});loadUsuarios();showToast(u.active?"Desactivado":"Activado");}catch(e){showToast("Error","error");}
  };
  const deleteUser=async(u)=>{
    if(!window.confirm(`¿Eliminar usuario ${u.nombre}?`))return;
    try{await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${u.id}`,{method:"DELETE",headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${session.token}`}});loadUsuarios();showToast("Usuario eliminado");}catch(e){showToast("Error al eliminar","error");}
  };
  const toggleCat=id=>setCats(p=>p.map(c=>c.id===id?{...c,active:!c.active}:c));
  const saveCat=cat=>{if(editCat){setCats(p=>p.map(c=>c.id===cat.id?cat:c));}else{setCats(p=>[...p,{...cat,id:"cat"+uid(),order:p.length}]);}showToast("Guardada");setShowCF(false);setEditCat(null);};
  const mvCat=(idx,dir)=>setCats(p=>{const a=[...p];if(dir<0&&idx===0||dir>0&&idx>=p.length-1)return p;[a[idx+dir],a[idx]]=[a[idx],a[idx+dir]];return a.map((c,i)=>({...c,order:i}));});
  const toggleTow=id=>setTowers(p=>p.map(t=>t.id===id?{...t,active:!t.active}:t));
  const saveTow=t=>{if(editTow){setTowers(p=>p.map(x=>x.id===t.id?t:x));}else{setTowers(p=>[...p,{...t,id:"t"+uid()}]);}showToast("Guardada");setShowTF(false);setEditTow(null);};
  const toggleResp=id=>setResps(p=>p.map(r=>r.id===id?{...r,active:!r.active}:r));
  const saveResp=r=>{if(editResp){setResps(p=>p.map(x=>x.id===r.id?r:x));}else{setResps(p=>[...p,{...r,id:"r"+uid()}]);}showToast("Guardado");setShowRF(false);setEditResp(null);};
  const sla={Emergencia:"4h",Alta:"24h",Media:"72h",Baja:"7 dias"};
  const cfgTabs=[{id:"cats",label:"Categorias"},{id:"towers",label:"Torres"},{id:"resps",label:"Responsables"},{id:"usuarios",label:"Usuarios"},{id:"sla",label:"SLA"}];
  return(
    <div>
      <Tabs tabs={cfgTabs} active={tab} onChange={setTab}/>
      {tab==="cats"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,color:"#64748b"}}>{cats.filter(c=>c.active).length} activas</div><button style={mkBtn("primary",true)} onClick={()=>{setEditCat(null);setShowCF(true);}}>+ Nueva</button></div><div style={card}>{cats.map((cat,idx)=><div key={cat.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:cat.active?1:.5,flexWrap:"wrap"}}><div style={{display:"flex",flexDirection:"column"}}><button style={{...mkBtn("ghost",true),padding:"1px 4px",fontSize:10}} onClick={()=>mvCat(idx,-1)}>▲</button><button style={{...mkBtn("ghost",true),padding:"1px 4px",fontSize:10}} onClick={()=>mvCat(idx,1)}>▼</button></div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{cat.name}</div><div style={{fontSize:11,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat.subs.join(", ")}</div></div><div style={{display:"flex",gap:4}}><button style={mkBtn("secondary",true)} onClick={()=>{setEditCat(cat);setShowCF(true);}}>Editar</button><button style={mkBtn(cat.active?"warning":"success",true)} onClick={()=>toggleCat(cat.id)}>{cat.active?"Desact.":"Activar"}</button><button style={mkBtn("danger",true)} onClick={()=>setCats(p=>p.filter(c=>c.id!==cat.id))}>X</button></div></div>)}</div>{showCF&&<CatForm cat={editCat} onSave={saveCat} onClose={()=>{setShowCF(false);setEditCat(null);}}/>}</div>}
      {tab==="towers"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,color:"#64748b"}}>{towers.filter(t=>t.active).length} activas</div><button style={mkBtn("primary",true)} onClick={()=>{setEditTow(null);setShowTF(true);}}>+ Nueva torre</button></div><div style={card}>{towers.map((t,idx)=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9",opacity:t.active?1:.5,flexWrap:"wrap"}}><div style={{width:34,height:34,borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:"#3b82f6",flexShrink:0}}>{t.name}</div><div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{t.label}</div></div><div style={{display:"flex",gap:4}}><button style={mkBtn("secondary",true)} onClick={()=>{setEditTow(t);setShowTF(true);}}>Editar</button><button style={mkBtn(t.active?"warning":"success",true)} onClick={()=>toggleTow(t.id)}>{t.active?"Desact.":"Activar"}</button><button style={mkBtn("danger",true)} onClick={()=>setTowers(p=>p.filter(x=>x.id!==t.id))}>X</button></div></div>)}</div>{showTF&&<TowerForm tower={editTow} onSave={saveTow} onClose={()=>{setShowTF(false);setEditTow(null);}}/>}</div>}
      {tab==="resps"&&<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,color:"#64748b"}}>{resps.filter(r=>r.active).length} activos</div><button style={mkBtn("primary",true)} onClick={()=>{setEditResp(null);setShowRF(true);}}>+ Nuevo</button></div><div>{resps.map(r=><div key={r.id} style={{...card,opacity:r.active?1:.6,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{r.name}</div><div style={{fontSize:11,color:"#64748b",marginBottom:3}}>{r.email}</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{(r.modules||[]).map(m=><span key={m} style={bdg("#6366f1","#eef2ff")}>{m}</span>)}</div></div><div style={{display:"flex",gap:4}}><button style={mkBtn("secondary",true)} onClick={()=>{setEditResp(r);setShowRF(true);}}>Editar</button><button style={mkBtn(r.active?"warning":"success",true)} onClick={()=>toggleResp(r.id)}>{r.active?"Desact.":"Activar"}</button><button style={mkBtn("danger",true)} onClick={()=>setResps(p=>p.filter(x=>x.id!==r.id))}>X</button></div></div></div>)}</div>{showRF&&<RespForm resp={editResp} onSave={saveResp} onClose={()=>{setShowRF(false);setEditResp(null);}}/>}</div>}
      {tab==="usuarios"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:13,color:"#64748b"}}>{usuarios.filter(u=>u.active).length} activos</div><button style={mkBtn("primary",true)} onClick={()=>{setEditUser(null);setShowUF(true);}}>+ Nuevo usuario</button></div>
        {showUF&&<UserForm user={editUser} onSave={saveUsuario} onClose={()=>{setShowUF(false);setEditUser(null);}}/>}
        <div>{usuarios.map(u=><div key={u.id} style={{...card,opacity:u.active?1:.6,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{u.nombre}</div><div style={{fontSize:11,color:"#64748b"}}>{u.email}</div><span style={bdg("#6366f1","#eef2ff")}>{u.rol}</span></div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}><button style={mkBtn("secondary",true)} onClick={()=>{setEditUser(u);setShowUF(true);}}>Editar</button><button style={mkBtn(u.active?"warning":"success",true)} onClick={()=>toggleUser(u)}>{u.active?"Desact.":"Activar"}</button><button style={mkBtn("danger",true)} onClick={()=>deleteUser(u)}>Eliminar</button></div></div></div>)}</div>
      </div>}
      {tab==="sla"&&<div style={card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>SLA por prioridad</div>{Object.entries(sla).map(([p,t])=><div key={p} style={{display:"flex",justifyContent:"space-between",marginBottom:10,alignItems:"center"}}><PBadge p={p}/><span style={{fontWeight:600}}>{t}</span></div>)}</div>}
    </div>
  );
}
function UserForm({user,onSave,onClose}){
  const [f,setF]=useState(user ? {...user, isNew:false} : {nombre:"",email:"",rol:"Residente",active:true,isNew:true});
  const [rol,setRol]=useState((user&&user.rol)||"Residente");
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{user?"Editar":"Nuevo"} usuario</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Nombre *</label><input style={inp} value={f.nombre} onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/></div>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Correo *</label><input type="email" style={inp} value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))} disabled={!!user}/></div>
      <div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Rol</label><select style={selSt} value={rol} onChange={e=>{setRol(e.target.value);setF(p=>({...p,rol:e.target.value}));}}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
    </div>
    {!user&&<div style={{...alrt("info"),marginTop:8,fontSize:12}}>Recuerde crear el usuario en Supabase Authentication con el mismo correo.</div>}
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.nombre.trim()||!f.email.trim())return;onSave({...f,rol});}}>Guardar</button></div>
  </div></div>);
}
function CatForm({cat,onSave,onClose}){
  const [name,setName]=useState(cat?cat.name:"");
  const [subs,setSubs]=useState(cat?cat.subs.join("\n"):"");
  const save=()=>{if(!name.trim())return;const subsArr=subs.split("\n").map(s=>s.trim()).filter(Boolean);if(!subsArr.length)return;onSave({...(cat||{}),name:name.trim(),subs:subsArr,active:cat?cat.active:true});};
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{cat?"Editar":"Nueva"} categoria</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div><div style={fg}><label style={lbl}>Nombre *</label><input style={inp} value={name} onChange={e=>setName(e.target.value)}/></div><div style={fg}><label style={lbl}>Subcategorias * (una por linea)</label><textarea style={{...inp,height:120,resize:"vertical"}} value={subs} onChange={e=>setSubs(e.target.value)}/></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={save}>Guardar</button></div></div></div>);
}
function TowerForm({tower,onSave,onClose}){
  const [name,setName]=useState(tower?tower.name:"");const [label,setLabel]=useState(tower?tower.label:"");
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,padding:"20px",marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{tower?"Editar":"Nueva"} torre</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div><div style={fg}><label style={lbl}>Codigo *</label><input style={inp} value={name} onChange={e=>setName(e.target.value)} placeholder="ej: A"/></div><div style={fg}><label style={lbl}>Nombre completo *</label><input style={inp} value={label} onChange={e=>setLabel(e.target.value)} placeholder="ej: Torre A"/></div><div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!name.trim()||!label.trim())return;onSave({...(tower||{}),name:name.trim(),label:label.trim(),active:tower?tower.active:true});}}>Guardar</button></div></div></div>);
}
function RespForm({resp,onSave,onClose}){
  const [f,setF]=useState({name:"",email:"",phone:"",modules:[],active:true,...(resp||{})});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const toggleMod=m=>setF(p=>({...p,modules:(p.modules||[]).includes(m)?(p.modules||[]).filter(x=>x!==m):[...(p.modules||[]),m]}));
  return(<div style={modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:480,padding:"20px",marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}><h3 style={{margin:0,fontSize:15}}>{resp?"Editar":"Nuevo"} responsable</h3><button style={mkBtn("ghost",true)} onClick={onClose}>✕</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Nombre *</label><input style={inp} value={f.name} onChange={e=>set("name",e.target.value)}/></div><div style={fg}><label style={lbl}>Correo *</label><input type="email" style={inp} value={f.email} onChange={e=>set("email",e.target.value)}/></div><div style={fg}><label style={lbl}>Telefono</label><input style={inp} value={f.phone} onChange={e=>set("phone",e.target.value)}/></div><div style={{...fg,gridColumn:"1/-1"}}><label style={lbl}>Modulos</label><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>{ALL_MODS.map(m=><button key={m} onClick={()=>toggleMod(m)} style={{padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:600,cursor:"pointer",border:"1.5px solid "+((f.modules||[]).includes(m)?"#6366f1":"#e2e8f0"),background:(f.modules||[]).includes(m)?"#eef2ff":"#f9fafb",color:(f.modules||[]).includes(m)?"#6366f1":"#6b7280"}}>{m}</button>)}</div></div></div><div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={mkBtn("secondary",true)} onClick={onClose}>Cancelar</button><button style={mkBtn("primary",true)} onClick={()=>{if(!f.name.trim()||!f.email.trim())return;onSave(f);}}>Guardar</button></div></div></div>);
}
