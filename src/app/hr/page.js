"use client";
import {useCallback,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {supabase} from "@/lib/supabase";

const field={width:"100%",padding:13,borderRadius:10,border:"1px solid #405365",background:"#14212c",color:"#fff",boxSizing:"border-box"};
const gold={padding:"13px 22px",border:0,borderRadius:10,background:"#d6a44d",color:"#101820",fontWeight:800,cursor:"pointer"};
const card={background:"#1b2935",border:"1px solid #354858",borderRadius:16,padding:20};
export default function HrHome(){
 const router=useRouter();
 const [session,setSession]=useState(null),[username,setUsername]=useState(""),[password,setPassword]=useState("");
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async(currentSession)=>{
  if(!currentSession?.access_token){setLoading(false);return;}
  try{
   const r=await fetch("/api/hr/me",{headers:{Authorization:"Bearer "+currentSession.access_token},cache:"no-store"});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"تعذر تحميل الحساب.");
   setData(j);setError("");
  }catch(e){setError(e.message);setData(null);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  let alive=true;
  supabase.auth.getSession().then(({data,error})=>{if(!alive)return;if(error){setError(error.message);setLoading(false);return;}setSession(data.session);if(data.session)load(data.session);else setLoading(false);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(!alive)return;setSession(next);if(next){setLoading(true);load(next);}else{setData(null);setLoading(false);}});
  return()=>{alive=false;subscription.unsubscribe();};
 },[load]);
 async function login(e){
  e.preventDefault();setBusy(true);setError("");
  try{
   const clean=username.trim().toLowerCase();
   const {data:result,error:authError}=await supabase.auth.signInWithPassword({email:clean+"@employees.arkan.local",password});
   if(authError)throw authError;
   setSession(result.session);await load(result.session);
  }catch(e){setError("اسم المستخدم أو كلمة المرور غير صحيحة.");}
  finally{setBusy(false);}
 }
 async function attendance(action){
  if(!session?.access_token)return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/hr/me",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({action})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||"تعذر التسجيل.");
   setNotice(action==="check_in"?"تم تسجيل حضورك بنجاح.":"تم تسجيل انصرافك بنجاح.");
   await load(session);
  }catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 async function logout(){await supabase.auth.signOut();setSession(null);setData(null);setNotice("");}
 const fmt=(v)=>v?new Date(v).toLocaleString("ar-EG",{timeZone:"Africa/Cairo",dateStyle:"medium",timeStyle:"short"}):"—";
 if(loading)return <main dir="rtl" style={{minHeight:"100vh",background:"#101820",color:"#fff",display:"grid",placeItems:"center"}}>جارٍ تحميل نظام HR...</main>;
 if(!session)return <main dir="rtl" style={{minHeight:"100vh",background:"#101820",color:"#fff",display:"grid",placeItems:"center",padding:20}}>
  <form onSubmit={login} style={{...card,width:"min(100%,420px)",display:"grid",gap:16}}>
   <div style={{textAlign:"center"}}><h1 style={{fontSize:32,margin:0}}>ARKAN HR</h1><p style={{color:"#aebdca"}}>دخول الموظفين</p></div>
   <label>اسم المستخدم<input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} style={field}/></label>
   <label>كلمة المرور<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={field}/></label>
   {error&&<p role="alert" style={{color:"#ff9c9c"}}>{error}</p>}
   <button disabled={busy} style={gold}>{busy?"جارٍ تسجيل الدخول...":"تسجيل الدخول"}</button>
   <a href="/" style={{textAlign:"center",color:"#d6a44d"}}>العودة للموقع</a>
  </form>
 </main>;
 const todayRow=data?.attendance?.find(x=>x.shift_date===data.today);
 const openShift=data?.attendance?.find(x=>x.check_in_at&&!x.check_out_at);
 return <main dir="rtl" style={{minHeight:"100vh",background:"#101820",color:"#f8fafc",padding:"28px 18px"}}>
  <div style={{maxWidth:1050,margin:"0 auto",display:"grid",gap:18}}>
   <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h1 style={{margin:0}}>أهلاً، {data?.employee?.full_name||"بك"}</h1><p style={{color:"#aebdca",margin:"6px 0"}}>{data?.employee?.job_title||"موظف"} · {data?.employee?.department||"ARKAN"}</p></div><button onClick={logout} style={{...gold,background:"#344657",color:"#fff"}}>تسجيل الخروج</button></header>
   {error&&<div role="alert" style={{background:"#4a2024",padding:12,borderRadius:10}}>{error}</div>}
   {notice&&<div role="status" style={{background:"#183d30",padding:12,borderRadius:10}}>{notice}</div>}
   <section style={{...card,display:"grid",gap:14}}>
    <h2 style={{margin:0}}>الحضور والانصراف</h2>
    <p style={{margin:0,color:"#aebdca"}}>تاريخ اليوم: {data?.today} · الشيفت: {data?.shift?.name||"غير محدد"}</p>
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
     <button disabled={busy||Boolean(todayRow?.check_in_at)} onClick={()=>attendance("check_in")} style={gold}>{todayRow?.check_in_at?"تم تسجيل الحضور":"تسجيل الحضور الآن"}</button>
     <button disabled={busy||!openShift} onClick={()=>attendance("check_out")} style={{...gold,background:"#5d8297",color:"#fff"}}>{openShift?"تسجيل الانصراف الآن":"لا يوجد حضور مفتوح للانصراف"}</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
     <div style={{background:"#14212c",padding:14,borderRadius:10}}>الحضور اليومي<br/><b>{fmt(todayRow?.check_in_at)}</b></div>
     <div style={{background:"#14212c",padding:14,borderRadius:10}}>الانصراف<br/><b>{fmt(todayRow?.check_out_at)}</b></div>
    </div>
   </section>
   <section style={card}><h2 style={{marginTop:0}}>سجل حضوري</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}><thead><tr>{["تاريخ الشيفت","الحضور","الانصراف","ساعات العمل","الإضافي","الحالة"].map(x=><th key={x} style={{textAlign:"right",padding:10,borderBottom:"1px solid #405365"}}>{x}</th>)}</tr></thead><tbody>{(data?.attendance||[]).map(x=><tr key={x.id}>{[x.shift_date,fmt(x.check_in_at),fmt(x.check_out_at),Math.floor((x.worked_minutes||0)/60)+" س "+((x.worked_minutes||0)%60)+" د",Math.floor((x.overtime_minutes||0)/60)+" س",x.attendance_status].map((v,i)=><td key={i} style={{padding:10,borderBottom:"1px solid #2e414f",whiteSpace:"nowrap"}}>{v}</td>)}</tr>)}</tbody></table></div></section>
  </div>
 </main>;
}
