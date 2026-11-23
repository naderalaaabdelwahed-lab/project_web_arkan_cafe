"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
export default function HrKioskSettings(){
 const [devices,setDevices]=useState([]),[name,setName]=useState("جهاز المطعم"),[token,setToken]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 async function call(url,options={}){
  const {data}=await supabase.auth.getSession();const access=data.session?.access_token;if(!access)throw new Error("سجل دخول المدير أولاً.");
  const r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+access},cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"حدث خطأ.");return d;
 }
 const load=useCallback(async()=>{try{const d=await call("/api/admin/hr/kiosk");setDevices(d.devices||[])}catch(e){setError(e.message)}},[]);
 useEffect(()=>{load()},[load]);
 async function create(){setLoading(true);setError("");setToken("");try{const d=await call("/api/admin/hr/kiosk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});setToken(d.device_token);await load()}catch(e){setError(e.message)}finally{setLoading(false)}}
 async function toggle(d){try{await call("/api/admin/hr/kiosk",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:d.id,is_active:!d.is_active})});await load()}catch(e){setError(e.message)}}
 return <main dir="rtl" style={{padding:24,maxWidth:900,margin:"0 auto",color:"var(--foreground,#fff)"}}>
 <h1>إعداد جهاز الحضور</h1><p>أنشئ رمز تفعيل على كمبيوتر المطعم. الرمز يظهر مرة واحدة فقط؛ انسخه واحفظه في شاشة الحضور.</p>
 {error&&<p role="alert" style={{color:"#ff7777"}}>{error}</p>}
 <section style={{padding:18,border:"1px solid #64748b",borderRadius:12,display:"grid",gap:12}}>
 <label>اسم الجهاز<input value={name} onChange={e=>setName(e.target.value)} style={field}/></label>
 <button disabled={loading} onClick={create}>{loading?"جارٍ الإنشاء...":"إنشاء رمز تفعيل جديد"}</button>
 {token&&<div style={{padding:12,background:"#203d34",borderRadius:8}}><b>احفظ الرمز الآن — لن يظهر مرة أخرى:</b><code style={{display:"block",overflowWrap:"anywhere",margin:"10px 0"}}>{token}</code><button onClick={()=>navigator.clipboard.writeText(token)}>نسخ الرمز</button></div>}
 </section>
 <h2>الأجهزة المفعّلة</h2>{devices.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:12,borderBottom:"1px solid #64748b"}}><span>{d.name} — {d.is_active?"نشط":"موقوف"}</span><button onClick={()=>toggle(d)}>{d.is_active?"إيقاف":"تفعيل"}</button></div>)}
 <p style={{marginTop:20}}>شاشة الموظفين: <a href="/attendance/kiosk" target="_blank" rel="noreferrer">فتح شاشة الحضور</a></p>
 </main>
}
const field={display:"block",width:"100%",padding:10,marginTop:8,background:"#17232e",color:"white",border:"1px solid #64748b",borderRadius:8};
