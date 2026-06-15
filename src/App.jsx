import { useState } from "react";

const ROLES = ["Administrador","Administrador Edificio","Conserjeria","Residente","Comite","Proveedor"];
const STATUSES = ["Ingresada","En revision","Asignada","En proceso","Resuelta","Cerrada","Rechazada"];
const PRIORITIES = ["Emergencia","Alta","Media","Baja"];
const PC = {Emergencia:"#ef4444",Alta:"#f97316",Media:"#f59e0b",Baja:"#6b7280"};
const SC = {Ingresada:"#6366f1","En revision":"#f59e0b",Asignada:"#3b82f6","En proceso":"#8b5cf6",Resuelta:"#10b981",Cerrada:"#6b7280",Rechazada:"#ef4444"};

const uid = () => Math.random().toString(36).slice(2,9);
const fmtD = d => { try { return new Date(d).toLocaleDateString("es-CL"); } catch { return ""; }};
const fmt = d => { try { return new Date(d).toLocaleString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); } catch { return ""; }};

const genCode = (arr, pfx) => {
  const nums = (arr||[]).map(r => { const n = parseInt((r.code||"").replace(pfx,"").replace(/\D/g,""),10); return isNaN(n)?0:n; });
  return pfx + String((nums.length ? Math.max(0,...nums) : 0)+1).padStart(3,"0");
};

const s = {
  wrap: {display:"flex",flexDirection:"column",height:"100vh",fontFamily:"system-ui,sans-serif",background:"#f1f5f9",color:"#1e293b",overflow:"hidden"},
  sidebar: {width:210,background:"#0f172a",display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"},
  main: {flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  topbar: {background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0},
  content: {flex:1,overflowY:"auto",padding:16},
  card: {background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:12,marginBottom:12},
  inp: {width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box"},
  sel: {width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box"},
  lbl: {fontSize:12,fontWeight:600,color:"#374151",marginBottom:3,display:"block"},
  fg: {marginBottom:10},
  modal: {position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:8,overflowY:"auto"},
  tbl: {width:"100%",borderCollapse:"collapse",fontSize:12},
  th: {textAlign:"left",padding:"6px 8px",borderBottom:"2px solid #e2e8f0",fontWeight:600,fontSize:10,color:"#6b7280",textTransform:"uppercase"},
  td: {padding:"6px 8px",borderBottom:"1px solid #f1f5f9",verticalAlign:"middle",fontSize:12},
};

const btn = (v="primary",sm=false) => {
  const base = {display:"inline-flex",alignItems:"center",gap:4,padding:sm?"4px 10px":"7px 14px",borderRadius:6,fontSize:sm?11:13,fontWeight:600,cursor:"pointer",border:"none"};
  const vs = {primary:{background:"#3b82f6",color:"#fff"},secondary:{background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0"},danger:{background:"#ef4444",color:"#fff"},success:{background:"#10b981",color:"#fff"},ghost:{background:"transparent",color:"#6b7280"},warning:{background:"#f59e0b",color:"#fff"},purple:{background:"#8b5cf6",color:"#fff"}};
  return {...base,...(vs[v]||vs.primary)};
};
const bdg = (c,bg) => ({display:"inline-flex",alignItems:"center",padding:"2px 7px",borderRadius:99,fontSize:10,fontWeight:600,color:c,background:bg,whiteSpace:"nowrap"});
const alrt = t => ({padding:"10px 14px",borderRadius:8,fontSize:12,marginBottom:10,background:t==="error"?"#fef2f2":t==="success"?"#f0fdf4":t==="warning"?"#fffbeb":"#eff6ff",color:t==="error"?"#dc2626":t==="success"?"#16a34a":t==="warning"?"#92400e":"#1d4ed8",border:"1px solid "+(t==="error"?"#fca5a5":t==="success"?"#86efac":t==="warning"?"#fde68a":"#bfdbfe")});

function PBadge({p}){return <span style={{...bdg(PC[p]||"#64748b",(PC[p]||"#64748b")+"22"),fontWeight:700}}>{p==="Emergencia"?"⚠ ":""}{p}</span>;}
function SBadge({s}){const c=SC[s]||"#64748b";return <span style={bdg(c,c+"22")}>{s}</span>;}
function Empty({msg}){return <div style={{textAlign:"center",padding:"40px 20px",color:"#94a3b8",fontSize:13}}>{msg}</div>;}
function Kpi({value,label,color}){return <div style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:12,borderTop:"3px solid "+color}}><div style={{fontSize:22,fontWeight:700,color}}>{value}</div><div style={{fontSize:11,color:"#64748b",marginTop:3}}>{label}</div></div>;}
function Grid({cols=4,children}){return <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:12,marginBottom:16}}>{children}</div>;}
function Tabs({tabs,active,onChange,accent="#3b82f6"}){return <div style={{display:"flex",borderBottom:"2px solid #e2e8f0",marginBottom:12,overflowX:"auto"}}>{tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{...btn("ghost"),borderRadius:0,padding:"8px 12px",whiteSpace:"nowrap",borderBottom:active===t.id?"2px solid "+accent:"2px solid transparent",marginBottom:-2,color:active===t.id?accent:"#64748b",fontWeight:active===t.id?700:400}}>{t.label}</button>)}</div>;}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [mode,setMode]=useState(null);
  const [email,setEmail]=useState("");const [pass,setPass]=useState("");
  const [err,setErr]=useState("");const [load,setLoad]=useState(false);
  const [resEmail,setResEmail]=useState("");const [resErr,setResErr]=useState("");

  const SUPA_URL="https://ijefrrtdtjshfquuytic.supabase.co";
  const SUPA_KEY="sb_publishable_sZTDO3ROm8IEnzbWuEUK-w_DeOz65XG";
  const hdr=(tok)=>({"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":"Bearer "+(tok||SUPA_KEY)});

  const submitPersonal=async()=>{
    if(!email||!pass){setErr("Ingrese correo y contraseña");return;}
    setLoad(true);setErr("");
    try{
      const r=await fetch(SUPA_URL+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPA_KEY},body:JSON.stringify({email,password:pass})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error_description||"Error");
      const res=await fetch(SUPA_URL+"/rest/v1/usuarios?email=eq."+encodeURIComponent(email)+"&active=eq.true",{headers:hdr(d.access_token)});
      const users=await res.json();
      if(!users||!users.length) throw new Error("Usuario no encontrado o inactivo");
      onLogin({...users[0],token:d.access_token});
    }catch(e){setErr(e.message||"Credenciales incorrectas");}
    setLoad(false);
  };

  const submitResidente=()=>{
    if(!resEmail||!/\S+@\S+\.\S+/.test(resEmail)){setResErr("Ingrese un correo válido");return;}
    onLogin({id:"guest",nombre:"Residente",email:resEmail,rol:"Residente",token:null,openNewReq:true});
  };

  if(!mode) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f1f5f9",padding:16}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{background:"#0f172a",borderRadius:16,width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:28}}>🏢</div>
          <div style={{fontWeight:700,fontSize:26,color:"#0f172a"}}>CondoAdmin</div>
          <div style={{color:"#64748b",fontSize:14,marginTop:4}}>Sistema de Gestión de Condominios</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={()=>setMode("res")} style={{background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(59,130,246,.35)"}}>
            <span style={{fontSize:36}}>🏠</span>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Soy Residente</div><div style={{color:"#bfdbfe",fontSize:12,marginTop:2}}>Crea o consulta tus solicitudes</div></div>
            <span style={{marginLeft:"auto",color:"#bfdbfe",fontSize:22}}>→</span>
          </button>
          <button onClick={()=>setMode("per")} style={{background:"linear-gradient(135deg,#0f172a,#1e3a5f)",border:"none",borderRadius:14,padding:"22px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,boxShadow:"0 4px 16px rgba(0,0,0,.25)"}}>
            <span style={{fontSize:36}}>🔑</span>
            <div style={{textAlign:"left"}}><div style={{color:"#fff",fontWeight:700,fontSize:17}}>Acceso Personal</div><div style={{color:"#94a3b8",fontSize:12,marginTop:2}}>Administración · Conserjería · Comité</div></div>
            <span style={{marginLeft:"auto",color:"#94a3b8",fontSize:22}}>→</span>
          </button>
        </div>
      </div>
    </div>
  );

  if(mode==="res") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"linear-gradient(160deg,#1d4ed8,#3b82f6)",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>{setMode(null);setResErr("");setResEmail("");}} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",marginBottom:24}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}><div style={{fontSize:48,marginBottom:12}}>🏠</div><div style={{fontWeight:700,fontSize:22,color:"#fff"}}>Soy Residente</div><div style={{color:"#bfdbfe",fontSize:13,marginTop:4}}>Ingresa tu correo para continuar</div></div>
        {resErr&&<div style={{background:"#fef2f2",color:"#dc2626",padding:"8px 12px",borderRadius:8,fontSize:13,marginBottom:16}}>{resErr}</div>}
        <div style={{marginBottom:20}}><label style={{...s.lbl,color:"#bfdbfe"}}>Correo electrónico</label><input style={{...s.inp,background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"#fff"}} type="email" value={resEmail} onChange={e=>setResEmail(e.target.value)} placeholder="tu@correo.cl" onKeyDown={e=>e.key==="Enter"&&submitResidente()}/></div>
        <button onClick={submitResidente} style={{width:"100%",padding:16,background:"#fff",color:"#1d4ed8",border:"none",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer"}}>Ingresar</button>
        <div style={{color:"#bfdbfe",fontSize:11,textAlign:"center",marginTop:16}}>Solo necesitas tu correo, sin contraseña</div>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>{setMode(null);setErr("");}} style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"#94a3b8",borderRadius:8,padding:"6px 12px",fontSize:13,cursor:"pointer",marginBottom:24}}>← Volver</button>
        <div style={{textAlign:"center",marginBottom:32}}><div style={{fontSize:48,marginBottom:12}}>🔑</div><div style={{fontWeight:700,fontSize:22,color:"#fff"}}>Acceso Personal</div></div>
        {err&&<div style={{background:"#fef2f2",color:"#dc2626",padding:"8px 12px",borderRadius:8,fontSize:13,marginBottom:16}}>{err}</div>}
        <div style={{marginBottom:14}}><label style={{...s.lbl,color:"#94a3b8"}}>Correo</label><input style={{...s.inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo@ejemplo.cl" onKeyDown={e=>e.key==="Enter"&&submitPersonal()}/></div>
        <div style={{marginBottom:20}}><label style={{...s.lbl,color:"#94a3b8"}}>Contraseña</label><input style={{...s.inp,background:"#1e293b",border:"1px solid #334155",color:"#fff"}} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submitPersonal()}/></div>
        <button style={{width:"100%",padding:13,background:"#3b82f6",color:"#fff",border:"none",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer"}} onClick={submitPersonal} disabled={load}>{load?"Ingresando...":"Ingresar"}</button>
      </div>
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────────────────────
function Dashboard({reqs,onOpen,onNew,role}){
  const open=reqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status));
  const emerg=reqs.filter(r=>r.priority==="Emergencia"&&!["Cerrada","Rechazada"].includes(r.status));
  const recent=[...reqs].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);
  const cats={};reqs.forEach(r=>{cats[r.category]=(cats[r.category]||0)+1;});
  const byCat=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);
  return (
    <div>
      {emerg.map(e=><div key={e.id} style={{...s.card,background:"#fef2f2",border:"1px solid #fca5a5",cursor:"pointer",display:"flex",alignItems:"center",gap:10}} onClick={()=>onOpen(e)}><span style={{fontWeight:700,color:"#dc2626",fontSize:18}}>⚠</span><div><strong style={{color:"#dc2626"}}>EMERGENCIA: {e.code}</strong><div style={{fontSize:12,color:"#ef4444"}}>{e.category}</div></div></div>)}
      <Grid cols={4}>
        <Kpi value={open.length} label="Abiertas" color="#3b82f6"/>
        <Kpi value={emerg.length} label="Emergencias" color="#ef4444"/>
        <Kpi value={reqs.filter(r=>r.status==="En proceso").length} label="En proceso" color="#8b5cf6"/>
        <Kpi value={reqs.filter(r=>r.status==="Cerrada").length} label="Cerradas" color="#10b981"/>
      </Grid>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
        <div style={s.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontWeight:600,fontSize:13}}>Solicitudes recientes</span>
            <button style={btn("primary",true)} onClick={onNew}>+ Nueva</button>
          </div>
          {recent.length===0?<Empty msg="Sin solicitudes"/>:
          <table style={s.tbl}><thead><tr>{["ID","Categoría","Prioridad","Estado","Fecha"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>{recent.map(r=><tr key={r.id} style={{cursor:"pointer"}} onClick={()=>onOpen(r)}>
            <td style={s.td}><span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span></td>
            <td style={s.td}>{r.category}</td>
            <td style={s.td}><PBadge p={r.priority}/></td>
            <td style={s.td}><SBadge s={r.status}/></td>
            <td style={s.td}><span style={{fontSize:11,color:"#64748b"}}>{fmtD(r.createdAt)}</span></td>
          </tr>)}</tbody></table>}
        </div>
        <div style={s.card}>
          <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Por categoría</div>
          {byCat.length===0?<Empty msg="Sin datos"/>:byCat.map(([c,n])=>(
            <div key={c} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:110}}>{c}</span><span style={{fontWeight:600}}>{n}</span></div>
              <div style={{height:5,background:"#f1f5f9",borderRadius:99}}><div style={{height:5,background:"#3b82f6",borderRadius:99,width:(n/Math.max(reqs.length,1)*100)+"%"}}/></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── REQ LIST ───────────────────────────────────────────────────────────────
function ReqList({reqs,onOpen,setReqs,showToast,role,session}){
  const [q,setQ]=useState("");
  const [fStatus,setFS]=useState("");
  const [fPrio,setFP]=useState("");
  const base=role==="Residente"?reqs.filter(r=>r.requesterEmail===session?.email):reqs;
  const visible=base.filter(r=>{
    if(fStatus&&r.status!==fStatus)return false;
    if(fPrio&&r.priority!==fPrio)return false;
    if(q&&!(r.code+" "+r.requesterName+" "+r.category).toLowerCase().includes(q.toLowerCase()))return false;
    return true;
  }).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  return (
    <div>
      <div style={{...s.card,padding:12,marginBottom:12}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input style={{...s.inp,flex:2,minWidth:120}} placeholder="Buscar por código, nombre, categoría..." value={q} onChange={e=>setQ(e.target.value)}/>
          <select style={{...s.sel,flex:1}} value={fStatus} onChange={e=>setFS(e.target.value)}><option value="">Todos los estados</option>{STATUSES.map(s=><option key={s}>{s}</option>)}</select>
          <select style={{...s.sel,flex:1}} value={fPrio} onChange={e=>setFP(e.target.value)}><option value="">Todas las prioridades</option>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
          <span style={{alignSelf:"center",fontSize:12,color:"#64748b",whiteSpace:"nowrap"}}>{visible.length} solicitudes</span>
        </div>
      </div>
      {visible.length===0?<Empty msg="Sin solicitudes"/>:
      <div style={s.card}>
        <table style={s.tbl}><thead><tr>{["ID","Solicitante","Categoría","Torre","Prioridad","Estado","Responsable","Fecha"].map(h=><th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>{visible.map(r=>(
          <tr key={r.id} style={{cursor:"pointer",background:r.priority==="Emergencia"?"#fef2f2":""}} onClick={()=>onOpen(r)}>
            <td style={s.td}><span style={{fontWeight:600,color:"#3b82f6"}}>{r.code}</span></td>
            <td style={s.td}><div style={{fontSize:12}}>{r.requesterName}</div><div style={{fontSize:10,color:"#94a3b8"}}>{r.requesterEmail}</div></td>
            <td style={s.td}>{r.category}</td>
            <td style={s.td}>{r.tower}{r.unit?" / "+r.unit:""}</td>
            <td style={s.td}><PBadge p={r.priority}/></td>
            <td style={s.td}><SBadge s={r.status}/></td>
            <td style={s.td}><span style={{fontSize:11}}>{r.assignedTo||"Sin asignar"}</span></td>
            <td style={s.td}><span style={{fontSize:11,color:"#64748b"}}>{fmtD(r.createdAt)}</span></td>
          </tr>
        ))}</tbody></table>
      </div>}
    </div>
  );
}

// ── REQ DETAIL ─────────────────────────────────────────────────────────────
function ReqDetail({req,reqs,setReqs,setSelReq,onBack,showToast,role,addEmail,emails}){
  const r=reqs.find(x=>x.id===req.id)||req;
  const [tab,setTab]=useState("info");
  const [ns,setNs]=useState(r.status);
  const [asgn,setAsgn]=useState(r.assignedTo||"Sin asignar");
  const [comment,setComment]=useState("");
  const safeHistory=r.history||[];
  const safeComments=r.comments||[];
  const myEmails=(emails||[]).filter(e=>e.requestId===r.id);

  const upd=(ch,he)=>{
    const updated={...r,...ch,history:he?[...safeHistory,{date:new Date().toISOString(),user:role,...he}]:safeHistory};
    setReqs(p=>p.map(x=>x.id===r.id?updated:x));
    setSelReq(prev=>({...prev,...ch}));
  };

  const applyStatus=()=>{
    if(ns===r.status)return;
    upd({status:ns},{action:"Estado cambiado",from:r.status,to:ns});
    showToast("Estado actualizado");
  };

  const applyAsgn=()=>{
    if(!asgn||asgn==="Sin asignar"){showToast("Seleccione responsable","error");return;}
    upd({assignedTo:asgn,status:"Asignada"},{action:"Asignada a "+asgn,from:r.status,to:"Asignada"});
    showToast("Responsable asignado");
  };

  const addCmt=()=>{
    if(!comment.trim())return;
    upd({comments:[...safeComments,{id:"c"+uid(),user:role,date:new Date().toISOString(),text:comment}]});
    setComment("");showToast("Comentario agregado");
  };

  const tabs=[{id:"info",label:"Info"},{id:"history",label:"Historial ("+safeHistory.length+")"},{id:"emails",label:"Correos ("+myEmails.length+")"}];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <button style={btn("secondary",true)} onClick={onBack}>← Volver</button>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:20}}>{r.code}</span><PBadge p={r.priority}/><SBadge s={r.status}/></div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{r.category} {r.subcategory?" / "+r.subcategory:""} — Torre {r.tower} / Unidad {r.unit}</div>
        </div>
      </div>
      {r.status!=="Cerrada"&&r.status!=="Rechazada"&&(
        <div style={{...s.card,padding:12,marginBottom:12}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div><label style={s.lbl}>Estado</label><div style={{display:"flex",gap:6}}><select style={{...s.sel,width:150}} value={ns} onChange={e=>setNs(e.target.value)}>{STATUSES.map(st=><option key={st}>{st}</option>)}</select><button style={btn("primary",true)} onClick={applyStatus}>OK</button></div></div>
            <div><label style={s.lbl}>Responsable</label><div style={{display:"flex",gap:6}}><input style={{...s.inp,width:160}} value={asgn} onChange={e=>setAsgn(e.target.value)} placeholder="Nombre..."/><button style={btn("secondary",true)} onClick={applyAsgn}>Asignar</button></div></div>
          </div>
        </div>
      )}
      <Tabs tabs={tabs} active={tab} onChange={setTab}/>
      {tab==="info"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={s.card}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Solicitante</div>
            {[["Nombre",r.requesterName],["Correo",r.requesterEmail],["Teléfono",r.requesterPhone],["Torre",r.tower],["Unidad",r.unit]].map(([l,v])=>v?<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600}}>{v}</span></div>:null)}
          </div>
          <div style={s.card}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Caso</div>
            {[["Categoría",r.category],["Subcategoría",r.subcategory],["Prioridad",r.priority],["Responsable",r.assignedTo||"Sin asignar"],["Creación",fmt(r.createdAt)]].map(([l,v])=>v?<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:600,maxWidth:160,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis"}}>{v}</span></div>:null)}
          </div>
          <div style={{...s.card,gridColumn:"1/-1"}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Descripción</div>
            <p style={{fontSize:13,color:"#374151",lineHeight:1.6,margin:0}}>{r.description||"Sin descripción."}</p>
          </div>
          <div style={{...s.card,gridColumn:"1/-1"}}>
            <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Comentarios ({safeComments.length})</div>
            {safeComments.map((c,i)=><div key={c.id||i} style={{borderLeft:"3px solid #e2e8f0",paddingLeft:10,marginBottom:10}}><div style={{display:"flex",gap:6,marginBottom:3}}><strong style={{fontSize:12}}>{c.user}</strong><span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{fmt(c.date)}</span></div><p style={{margin:0,fontSize:13}}>{c.text}</p></div>)}
            <div style={{marginTop:10,display:"flex",gap:8}}><input style={{...s.inp,flex:1}} placeholder="Escribe un comentario..." value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCmt()}/><button style={btn("primary",true)} onClick={addCmt}>Enviar</button></div>
          </div>
        </div>
      )}
      {tab==="history"&&<div style={s.card}>{safeHistory.length===0?<Empty msg="Sin historial"/>:[...safeHistory].reverse().map((h,i)=><div key={i} style={{paddingLeft:16,paddingBottom:14,borderLeft:"2px solid #e2e8f0",marginLeft:4}}><div style={{fontSize:13,fontWeight:600}}>{h.action}</div>{h.from&&h.to&&<div style={{fontSize:11,color:"#64748b",marginTop:2}}><SBadge s={h.from}/> → <SBadge s={h.to}/></div>}<div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{fmt(h.date)} — {h.user}</div></div>)}</div>}
      {tab==="emails"&&<div style={s.card}>{myEmails.length===0?<Empty msg="Sin correos"/>:myEmails.map((e,i)=><div key={e.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0"}}><div style={{display:"flex",gap:6,marginBottom:3}}><span style={{fontWeight:600,fontSize:12,flex:1}}>{e.subject}</span><span style={bdg("#6366f1","#eef2ff")}>{e.type}</span></div><div style={{fontSize:10,color:"#64748b"}}>{e.to} — {fmt(e.date)}</div><div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4,marginTop:4}}>{e.body}</div></div>)}</div>}
    </div>
  );
}

// ── NEW REQ MODAL ──────────────────────────────────────────────────────────
function NewReqModal({role,reqs,setReqs,addEmail,showToast,onClose,onOpen,session}){
  const CATS = {Electricidad:["Corte de luz","Falla de circuito","Luminaria","Otro"],Gas:["Olor a gas","Corte suministro","Fuga","Otro"],Agua:["Corte de agua","Presion baja","Fuga","Otro"],Filtraciones:["Techo","Muro","Piso","Otro"],Ascensores:["Parada emergencia","Ruido anormal","Puerta defectuosa","Otro"],"Espacios comunes":["Sala eventos","Quincho","Piscina","Otro"],Perimetral:["Reja perimetral","Porton","Muro","Otro"],Seguridad:["Incidente","Camara danada","Alarma","Otro"],Aseo:["Pasillo sucio","Retiro basura","Otro"],Otros:["Ruidos molestos","Mascotas","Otro"]};
  const catList=Object.keys(CATS);
  const [f,setF]=useState({requesterName:session?.nombre||"",requesterEmail:session?.email||"",requesterPhone:"",tower:"A",unit:"",category:catList[0],subcategory:CATS[catList[0]][0],description:"",priority:"Media",confirm:false});
  const [errs,setErrs]=useState({});const [done,setDone]=useState(null);const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const validate=()=>{const e={};if(!f.requesterName)e.requesterName="Requerido";if(!f.requesterEmail||!/\S+@\S+\.\S+/.test(f.requesterEmail))e.requesterEmail="Email inválido";if(!f.unit)e.unit="Requerido";if(!f.description||f.description.length<10)e.description="Min. 10 caracteres";if(!f.confirm)e.confirm="Debe confirmar";setErrs(e);return !Object.keys(e).length;};
  const submit=async()=>{
    if(!validate())return;setSaving(true);
    const code=genCode(reqs,"SOL-");const now=new Date().toISOString();
    const nr={id:code,code,createdAt:now,...f,status:"Ingresada",assignedTo:"Sin asignar",history:[{date:now,user:f.requesterName||role,action:"Solicitud creada",from:null,to:"Ingresada"}],comments:[],attachmentsInitial:[],dueDate:null,isUrgent:f.priority==="Emergencia"};
    setReqs(p=>[nr,...p]);
    addEmail&&addEmail({requestId:code,date:now,to:f.requesterEmail,subject:"[CondoAdmin] Solicitud "+code+" recibida",type:"Creacion",status:"Enviado",body:"Su solicitud fue registrada. Código: "+code+". Nos contactaremos a la brevedad."});
    setDone(nr);showToast("Solicitud "+code+" creada");setSaving(false);
  };

  if(done)return<div style={s.modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:420,padding:24,marginTop:16,textAlign:"center"}}><div style={{fontSize:48,marginBottom:8}}>✅</div><h3 style={{margin:"0 0 6px"}}>Solicitud registrada</h3><div style={{...bdg("#10b981","#f0fdf4"),fontSize:15,padding:"5px 14px",display:"inline-flex",marginBottom:20}}>{done.code}</div><div style={{display:"flex",gap:8,justifyContent:"center"}}><button style={btn("primary",true)} onClick={()=>{onClose();onOpen(done);}}>Ver detalle</button><button style={btn("secondary",true)} onClick={onClose}>Cerrar</button></div></div></div>;

  return(
    <div style={s.modal}><div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:640,padding:20,marginTop:16,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>Nueva Solicitud</h3><button style={btn("ghost",true)} onClick={onClose}>✕</button></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[["requesterName","Nombre *","text"],["requesterEmail","Correo *","email"],["requesterPhone","Teléfono","text"]].map(([k,l,t])=><div key={k} style={s.fg}><label style={s.lbl}>{l}</label><input type={t} style={{...s.inp,borderColor:errs[k]?"#ef4444":""}} value={f[k]} onChange={e=>set(k,e.target.value)}/>{errs[k]&&<div style={{color:"#ef4444",fontSize:10,marginTop:2}}>{errs[k]}</div>}</div>)}
        <div style={s.fg}><label style={s.lbl}>Torre</label><select style={s.sel} value={f.tower} onChange={e=>set("tower",e.target.value)}>{["A","B","C","Común"].map(t=><option key={t}>{t}</option>)}</select></div>
        <div style={s.fg}><label style={s.lbl}>Unidad *</label><input style={{...s.inp,borderColor:errs.unit?"#ef4444":""}} value={f.unit} onChange={e=>set("unit",e.target.value)} placeholder="ej: 401"/>{errs.unit&&<div style={{color:"#ef4444",fontSize:10,marginTop:2}}>{errs.unit}</div>}</div>
        <div style={s.fg}><label style={s.lbl}>Categoría</label><select style={s.sel} value={f.category} onChange={e=>{set("category",e.target.value);set("subcategory",CATS[e.target.value][0]);}}>{catList.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={s.fg}><label style={s.lbl}>Subcategoría</label><select style={s.sel} value={f.subcategory} onChange={e=>set("subcategory",e.target.value)}>{(CATS[f.category]||[]).map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={{...s.fg,gridColumn:"1/-1"}}><label style={s.lbl}>Descripción *</label><textarea style={{...s.inp,height:80,resize:"vertical",borderColor:errs.description?"#ef4444":""}} value={f.description} onChange={e=>set("description",e.target.value)} placeholder="Describa el problema con detalle..."/>{errs.description&&<div style={{color:"#ef4444",fontSize:10,marginTop:2}}>{errs.description}</div>}</div>
        <div style={s.fg}><label style={s.lbl}>Prioridad</label><select style={{...s.sel,color:PC[f.priority]}} value={f.priority} onChange={e=>set("priority",e.target.value)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div>
        <div style={{...s.fg,gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" id="conf" checked={f.confirm} onChange={e=>set("confirm",e.target.checked)}/><label htmlFor="conf" style={{fontSize:12,cursor:"pointer"}}>Confirmo que la información es correcta *</label>{errs.confirm&&<span style={{color:"#ef4444",fontSize:10}}>{errs.confirm}</span>}</div>
      </div>
      {f.priority==="Emergencia"&&<div style={{...alrt("error"),display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>⚠</span><strong>Prioridad EMERGENCIA — será atendida inmediatamente</strong></div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><button style={btn("secondary",true)} onClick={onClose}>Cancelar</button><button style={btn("primary",true)} onClick={submit} disabled={saving}>{saving?"Guardando...":"Enviar solicitud"}</button></div>
    </div></div>
  );
}

// ── REPORTS ────────────────────────────────────────────────────────────────
function Reports({reqs}){
  const byCat={};reqs.forEach(r=>{byCat[r.category]=(byCat[r.category]||0)+1;});
  const catArr=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...catArr.map(x=>x[1]),1);
  return(
    <div>
      <Grid cols={4}>
        {PRIORITIES.map(p=><Kpi key={p} value={reqs.filter(r=>r.priority===p).length} label={p} color={PC[p]}/>)}
      </Grid>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={s.card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Por estado</div>{STATUSES.map(st=>{const c=reqs.filter(r=>r.status===st).length;return c?<div key={st} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><SBadge s={st}/><span style={{fontWeight:600}}>{c}</span></div>:null;})}</div>
        <div style={s.card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Por categoría</div>{catArr.map(([c,n])=><div key={c} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>{c}</span><span style={{fontWeight:600}}>{n}</span></div><div style={{height:5,background:"#f1f5f9",borderRadius:99}}><div style={{height:5,background:"#6366f1",borderRadius:99,width:(n/max*100)+"%"}}/></div></div>)}</div>
        <div style={s.card}><div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Resumen general</div>{[["Total solicitudes",reqs.length],["Activas",reqs.filter(r=>!["Cerrada","Rechazada"].includes(r.status)).length],["Cerradas",reqs.filter(r=>r.status==="Cerrada").length],["Emergencias",reqs.filter(r=>r.priority==="Emergencia").length]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}><span style={{color:"#64748b"}}>{l}</span><span style={{fontWeight:700}}>{v}</span></div>)}</div>
      </div>
    </div>
  );
}

// ── EMAILS VIEW ────────────────────────────────────────────────────────────
function EmailsView({logs,setEmails,role}){
  const [q,setQ]=useState("");
  const visible=[...logs].sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(e=>!q||((e.to||"")+(e.subject||"")).toLowerCase().includes(q.toLowerCase()));
  return(
    <div>
      <div style={{...s.card,padding:12,marginBottom:12,display:"flex",gap:8}}>
        <input style={{...s.inp,flex:1}} placeholder="Buscar correos..." value={q} onChange={e=>setQ(e.target.value)}/>
        {logs.length>0&&<button style={btn("danger",true)} onClick={()=>{if(window.confirm("¿Eliminar todos los correos?"))setEmails([]);}}>🗑 Limpiar</button>}
      </div>
      <div style={s.card}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><span style={{fontWeight:600,fontSize:13}}>Bandeja de salida</span><span style={bdg("#10b981","#f0fdf4")}>{logs.length} enviados</span></div>
        {visible.length===0?<Empty msg="Sin correos"/>:visible.map((e,i)=>(
          <div key={e.id||i} style={{borderBottom:"1px solid #f1f5f9",padding:"10px 0"}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
              <span style={{fontWeight:600,fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.subject}</span>
              <span style={bdg("#6366f1","#eef2ff")}>{e.type}</span>
              {/* [FIX 6] eliminar por id */}
              <button style={{...btn("ghost",true),padding:"2px 6px",fontSize:11,color:"#ef4444"}} onClick={()=>setEmails(p=>p.filter(x=>x.id!==e.id))}>🗑</button>
            </div>
            <div style={{fontSize:10,color:"#64748b"}}>{e.to} — {fmt(e.date)}</div>
            <div style={{fontSize:11,background:"#f8fafc",padding:"4px 8px",borderRadius:4,marginTop:4}}>{e.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── APP ROOT ───────────────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(null);
  const [view,setView]=useState("dashboard");
  const [reqs,setReqs]=useState([]);
  const [emails,setEmails]=useState([]);
  const [selReq,setSelReq]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [toast,setToast]=useState(null);
  const [navOpen,setNavOpen]=useState(false);

  const role=session?.rol||"Residente";
  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};
  const handleLogin=(user)=>{setSession(user);if(user.openNewReq){setShowNew(true);}};
  const handleLogout=()=>{setSession(null);setView("dashboard");setReqs([]);setEmails([]);};
  const go=id=>{setView(id);setSelReq(null);setNavOpen(false);};
  const openReq=r=>{setSelReq(r);setView("detail");setNavOpen(false);};

  const addEmail=async(log)=>{
    const item={id:"e"+uid(),...log};
    setEmails(p=>[item,...p]);
  };

  // Cargar datos desde Supabase al iniciar sesión
  const [loaded,setLoaded]=useState(false);
  const SUPA_URL="https://ijefrrtdtjshfquuytic.supabase.co";
  const SUPA_KEY="sb_publishable_sZTDO3ROm8IEnzbWuEUK-w_DeOz65XG";
  const hdr=(tok)=>({"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":"Bearer "+(tok||SUPA_KEY)});

  const persist=async(table,item)=>{try{await fetch(SUPA_URL+"/rest/v1/"+table,{method:"POST",headers:{...hdr(),"Prefer":"resolution=merge-duplicates"},body:JSON.stringify({id:item.id,data:item})});}catch(e){}};

  const setReqsDB=updater=>setReqs(prev=>{
    const next=typeof updater==="function"?updater(prev):updater;
    next.forEach(item=>{const old=prev.find(x=>x.id===item.id);if(!old||JSON.stringify(old)!==JSON.stringify(item))persist("solicitudes",item);});
    return next;
  });

  useState(()=>{
    if(!session||loaded)return;
    setLoaded(true);
    (async()=>{
      try{
        const [rR,rE]=await Promise.all([
          fetch(SUPA_URL+"/rest/v1/solicitudes?select=*&order=created_at.desc",{headers:hdr(session.token)}).then(r=>r.json()),
          fetch(SUPA_URL+"/rest/v1/correos?select=*&order=id.asc",{headers:hdr(session.token)}).then(r=>r.json()),
        ]);
        if(Array.isArray(rR))setReqs(rR.map(r=>r.data).filter(Boolean));
        if(Array.isArray(rE))setEmails(rE.map(r=>r.data).filter(Boolean));
      }catch(e){console.error(e);}
    })();
  },[session]);

  const PERMS={Administrador:["viewAll","changeStatus","assign","viewEmails","viewReports","manageConfig","comment","create"],"Administrador Edificio":["viewAll","changeStatus","assign","viewEmails","viewReports","comment","create"],Conserjeria:["viewAll","changeStatus","comment","create"],Residente:["create","viewOwn"],Comite:["viewAll","viewReports"],Proveedor:["viewAssigned"]};
  const can=(action)=>(PERMS[role]||[]).includes(action);

  const navItems=[
    {id:"dashboard",label:"🏠 Dashboard"},
    {id:"requests",label:"📋 Solicitudes"},
    {id:"emails",label:"📧 Correos",hide:!can("viewEmails")},
    {id:"reports",label:"📊 Reportes",hide:!can("viewReports")},
  ].filter(n=>!n.hide);

  if(!session) return <Login onLogin={handleLogin}/>;

  return(
    <div style={s.wrap}>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* SIDEBAR */}
        <div style={s.sidebar}>
          <div style={{padding:"18px 14px 14px",borderBottom:"1px solid #1e293b",cursor:"pointer"}} onClick={()=>go("dashboard")}>
            <div style={{color:"#fff",fontWeight:700,fontSize:16}}>🏢 CondoAdmin</div>
            <div style={{color:"#64748b",fontSize:11,marginTop:2}}>Sistema de Gestión</div>
          </div>
          <nav style={{padding:"6px 0",flex:1}}>
            {navItems.map(n=>{const act=view===n.id||(view==="detail"&&n.id==="requests");return(<div key={n.id} onClick={()=>go(n.id)} style={{padding:"10px 14px",cursor:"pointer",userSelect:"none",fontSize:13,color:act?"#fff":"#94a3b8",background:act?"#1e3a5f":"transparent",borderLeft:act?"3px solid #3b82f6":"3px solid transparent",fontWeight:act?600:400}}>{n.label}</div>);})}
          </nav>
          <div style={{padding:"10px 14px",borderTop:"1px solid #1e293b"}}>
            <div style={{color:"#fff",fontSize:12,fontWeight:600,marginBottom:2}}>{session.nombre}</div>
            <div style={{color:"#64748b",fontSize:10,marginBottom:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.email}</div>
            <span style={{...bdg("#93c5fd","#1e3a5f"),marginBottom:8,display:"inline-block"}}>{role}</span>
            <div style={{marginTop:8}}><button style={{...btn("danger",true),width:"100%",justifyContent:"center"}} onClick={handleLogout}>Cerrar sesión</button></div>
          </div>
        </div>

        {/* MAIN */}
        <div style={s.main}>
          <div style={s.topbar}>
            <div>
              <div style={{fontWeight:700,fontSize:17}}>{view==="detail"?"Detalle de Solicitud":navItems.find(n=>n.id===view)?.label.split(" ").slice(1).join(" ")||view}</div>
              <div style={{color:"#64748b",fontSize:11,marginTop:1}}>{new Date().toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {can("create")&&<button style={btn("primary")} onClick={()=>setShowNew(true)}>+ Nueva Solicitud</button>}
              <span style={{...bdg("#fff","#1e3a5f"),fontSize:12,padding:"5px 10px"}}>{role}</span>
            </div>
          </div>

          <div style={s.content}>
            {view==="dashboard"&&<Dashboard reqs={reqs} onOpen={openReq} onNew={()=>setShowNew(true)} role={role}/>}
            {view==="requests"&&<ReqList reqs={reqs} onOpen={openReq} setReqs={setReqsDB} showToast={showToast} role={role} session={session}/>}
            {view==="detail"&&selReq&&<ReqDetail req={selReq} reqs={reqs} setReqs={setReqsDB} setSelReq={setSelReq} onBack={()=>setView("requests")} showToast={showToast} role={role} addEmail={addEmail} emails={emails}/>}
            {view==="emails"&&<EmailsView logs={emails} setEmails={setEmails} role={role}/>}
            {view==="reports"&&<Reports reqs={reqs}/>}
          </div>
        </div>
      </div>

      {showNew&&<NewReqModal role={role} reqs={reqs} setReqs={setReqsDB} addEmail={addEmail} showToast={showToast} onClose={()=>setShowNew(false)} onOpen={openReq} session={session}/>}
      {toast&&<div style={{...alrt(toast.type),position:"fixed",bottom:20,right:20,zIndex:2000,boxShadow:"0 4px 12px rgba(0,0,0,.15)",minWidth:260}}>{toast.msg}</div>}
    </div>
  );
}
