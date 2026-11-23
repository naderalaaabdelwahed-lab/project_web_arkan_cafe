"use client";
import {useCallback,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {supabase} from "@/lib/supabase";

export default function HrHome(){
 const router=useRouter();
 const [session,setSession]=useState(null),[username,setUsername]=useState(""),[password,setPassword]=useState("");
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
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
  supabase.auth.getSession().then(async({data,error})=>{
   if(!alive)return;
   if(error){setError(error.message);setLoading(false);return;}
   setSession(data.session);
   if(data.session){
    const {data:isAdmin}=await supabase.rpc("is_admin");
    if(isAdmin===true){router.replace("/hr/manage");return;}
    await load(data.session);
   }else setLoading(false);
  });
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
   if(!alive)return;setSession(next);setData(null);setLoading(Boolean(next));
   if(next)load(next);else setLoading(false);
  });
  return()=>{alive=false;subscription.unsubscribe();};
 },[load,router]);
 async function login(e){
  e.preventDefault();setBusy(true);setError("");
  try{
   const clean=username.trim().toLowerCase();
   const {data:result,error:authError}=await supabase.auth.signInWithPassword({email:clean+"@employees.arkan.local",password});
   if(authError)throw authError;
   const {data:isAdmin}=await supabase.rpc("is_admin");
   if(isAdmin===true){await supabase.auth.signOut();throw new Error("استخدم بوابة الإدارة لحساب المدير.");}
   setSession(result.session);await load(result.session);
  }catch(e){setError(e.message==="استخدم بوابة الإدارة لحساب المدير."?e.message:"اسم المستخدم أو كلمة المرور غير صحيحة.");}
  finally{setBusy(false);}
 }
 async function logout(){await supabase.auth.signOut();setSession(null);setData(null);}
 if(loading)return <main dir="rtl" style={{minHeight:"100vh",background:"#100d0b",color:"#e4bd75",display:"grid",placeItems:"center"}}>جارٍ تحميل بوابة الموظفين...</main>;
 if(!session)return <main dir="rtl" style={{minHeight:"100vh",background:"radial-gradient(circle at top,#332719 0,#100d0b 48%)",color:"#f4e9d8",display:"grid",placeItems:"center",padding:20}}>
  <form onSubmit={login} style={{width:"min(100%,440px)",boxSizing:"border-box",background:"#211b14",border:"1px solid #59472d",borderRadius:20,padding:30,display:"grid",gap:17,boxShadow:"0 25px 80px #0008"}}>
   <div style={{textAlign:"center"}}><div style={{fontSize:34,fontWeight:900}}>ARKAN<span style={{color:"#c9a45c"}}>.</span></div><h1 style={{margin:"8px 0",fontSize:25}}>بوابة الموظفين</h1><p style={{color:"#ad9e88",margin:0}}>تسجيل الحضور والانصراف</p></div>
   <label style={{display:"grid",gap:8}}>اسم المستخدم<input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} className="hr-field"/></label>
   <label style={{display:"grid",gap:8}}>كلمة المرور<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="hr-field"/></label>
   {error&&<div className="hr-alert" role="alert">{error}</div>}
   <button disabled={busy} className="hr-action">{busy?"جارٍ تسجيل الدخول...":"تسجيل الدخول"}</button>
   <Link href="/" style={{textAlign:"center",color:"#c9a45c",textDecoration:"none"}}>العودة للموقع</Link>
  </form>
 </main>;
 return <main className="hr-content" dir="rtl">
  <header className="hr-page-heading" style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
   <div><h1>أهلاً، {data?.employee?.full_name||"بك"} 👋</h1><p>{data?.employee?.job_title||"موظف"} · {data?.employee?.department||"ARKAN"} · حساب مخصص للحضور والانصراف</p></div>
   <button onClick={logout} className="hr-action secondary">تسجيل الخروج</button>
  </header>
  {error&&<div className="hr-alert" role="alert">{error}</div>}
  <section className="hr-panel">
   <div className="hr-page-heading"><h1 style={{fontSize:23}}>جاهز تسجل حضورك؟</h1><p>من هنا تقدر تسجل حضورك وانصرافك وتراجع سجلك الشخصي فقط.</p></div>
   <div className="hr-stat-grid" style={{margin:"22px 0"}}>
    <div className="hr-stat"><span>تاريخ اليوم</span><strong>{data?.today||"—"}</strong></div>
    <div className="hr-stat"><span>الشيفت الحالي</span><strong>{data?.shift?.name||"غير محدد"}</strong></div>
   </div>
   <Link href="/hr/attendance" className="hr-action" style={{display:"inline-block",textDecoration:"none"}}>فتح صفحة الحضور والانصراف ←</Link>
  </section>
  <section className="hr-panel"><h2 style={{marginTop:0}}>آخر تسجيل حضور</h2><p style={{color:"#ad9e88"}}>{data?.attendance?.[0]?.shift_date||"لا توجد سجلات حتى الآن"}</p></section>
 </main>;
}
