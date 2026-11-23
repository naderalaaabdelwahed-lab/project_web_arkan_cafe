"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {supabase} from "@/lib/supabase";

export default function EmployeeAttendance(){
 const [session,setSession]=useState(null),[data,setData]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async(s)=>{
  if(!s?.access_token){setLoading(false);return;}
  try{const r=await fetch("/api/hr/me",{headers:{Authorization:"Bearer "+s.access_token},cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"تعذر تحميل بيانات الحضور.");setData(j);setError("");}
  catch(e){setError(e.message);setData(null);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{let active=true;supabase.auth.getSession().then(({data,error})=>{if(!active)return;if(error){setError(error.message);setLoading(false);return;}setSession(data.session);if(data.session)load(data.session);else setLoading(false);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{if(!active)return;setSession(s);setLoading(Boolean(s));if(s)load(s);else setData(null);});return()=>{active=false;subscription.unsubscribe();};},[load]);
 async function record(action){
  if(!session?.access_token)return;setBusy(true);setError("");setNotice("");
  try{const r=await fetch("/api/hr/me",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({action})});const j=await r.json();if(!r.ok)throw new Error(j.error||"تعذر التسجيل.");setNotice(action==="check_in"?"تم تسجيل حضورك بنجاح.":"تم تسجيل انصرافك بنجاح.");await load(session);}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const fmt=v=>v?new Date(v).toLocaleString("ar-EG",{timeZone:"Africa/Cairo",dateStyle:"medium",timeStyle:"short"}):"—";
 if(loading)return <main className="hr-content">جارٍ تحميل سجلك...</main>;
 if(!session)return <main className="hr-content"><div className="hr-panel"><h1>سجل الدخول أولاً</h1><Link href="/hr" className="hr-action" style={{display:"inline-block",textDecoration:"none"}}>الانتقال لبوابة الموظفين</Link></div></main>;
 const todayRow=data?.attendance?.find(x=>x.shift_date===data.today);
 const openShift=data?.attendance?.find(x=>x.check_in_at&&!x.check_out_at);
 return <main className="hr-content">
  <header className="hr-page-heading"><h1>الحضور والانصراف</h1><p>أهلاً {data?.employee?.full_name||"بك"}، سجل دخولك وخروجك من هنا.</p></header>
  {error&&<div role="alert" className="hr-alert">{error}</div>}{notice&&<div role="status" className="hr-success">{notice}</div>}
  <section className="hr-panel">
   <div className="hr-stat-grid">
    <div className="hr-stat"><span>تاريخ اليوم</span><strong>{data?.today||"—"}</strong></div>
    <div className="hr-stat"><span>الشيفت</span><strong>{data?.shift?.name||"غير محدد"}</strong></div>
    <div className="hr-stat"><span>وقت الحضور</span><strong>{fmt(todayRow?.check_in_at)}</strong></div>
    <div className="hr-stat"><span>وقت الانصراف</span><strong>{fmt(todayRow?.check_out_at)}</strong></div>
   </div>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
    <button disabled={busy||Boolean(todayRow?.check_in_at)} onClick={()=>record("check_in")} className="hr-action">{todayRow?.check_in_at?"تم تسجيل الحضور":"تسجيل الحضور الآن"}</button>
    <button disabled={busy||!openShift} onClick={()=>record("check_out")} className="hr-action secondary">{openShift?"تسجيل الانصراف الآن":"لا يوجد حضور مفتوح للانصراف"}</button>
   </div>
   <p style={{color:"#ad9e88",fontSize:13,marginBottom:0}}>يتم تسجيل الوقت بتوقيت القاهرة، ولا يمكن للموظف تعديل سجلاته أو الاطلاع على سجلات زملائه.</p>
  </section>
  <section className="hr-panel"><h2 style={{marginTop:0}}>سجل حضوري</h2><div className="hr-table-wrap"><table className="hr-table"><thead><tr>{["تاريخ الشيفت","الحضور","الانصراف","ساعات العمل","الإضافي","الحالة"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{(data?.attendance||[]).map(x=><tr key={x.id}><td>{x.shift_date}</td><td>{fmt(x.check_in_at)}</td><td>{fmt(x.check_out_at)}</td><td>{Math.floor((x.worked_minutes||0)/60)} س {((x.worked_minutes||0)%60)} د</td><td>{Math.floor((x.overtime_minutes||0)/60)} س</td><td>{x.attendance_status}</td></tr>)}</tbody></table></div>{!data?.attendance?.length&&<p style={{color:"#ad9e88"}}>لسه مفيش سجلات حضور.</p>}</section>
 </main>;
}
