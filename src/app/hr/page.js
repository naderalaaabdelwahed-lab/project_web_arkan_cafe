"use client";
import {useState} from "react";

export default function AttendanceCodePage(){
 const [action,setAction]=useState("check_in");
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState(null);

 async function submit(e){
  e.preventDefault();setBusy(true);setError("");setResult(null);
  try{
   const response=await fetch("/api/hr/attendance-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,code})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"تعذر تسجيل العملية.");
   setResult(data);setCode("");
  }catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 const recordedAt=result?.recorded_at?new Date(result.recorded_at).toLocaleString("ar-EG",{timeZone:"Africa/Cairo",dateStyle:"full",timeStyle:"short"}):"";
 return <main className="hr-content hr-attendance-terminal" dir="rtl">
  <header className="hr-page-heading">
   <span className="hr-attendance-eyebrow">ARKAN · HUMAN RESOURCES</span>
   <h1>تسجيل الحضور والانصراف</h1>
   <p>اختار العملية واكتب كود الموظف الشخصي المكوّن من 6 أرقام</p>
  </header>
  <section className="hr-panel hr-attendance-card">
   <div className="hr-attendance-actions">
    <button type="button" onClick={()=>{setAction("check_in");setError("");setResult(null);}} aria-pressed={action==="check_in"} className={action==="check_in"?"selected":""}>
     <span aria-hidden="true">↘</span>تسجيل حضور
    </button>
    <button type="button" onClick={()=>{setAction("check_out");setError("");setResult(null);}} aria-pressed={action==="check_out"} className={action==="check_out"?"selected":""}>
     <span aria-hidden="true">↗</span>تسجيل انصراف
    </button>
   </div>
   <form onSubmit={submit} className="hr-attendance-form">
    <label htmlFor="attendance-code">كود الحضور والانصراف</label>
    <input id="attendance-code" required type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} minLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="••••••" />
    <small>الكود مكوّن من 6 أرقام. حافظ على سريته ولا تشاركه مع أي شخص.</small>
    {error&&<div role="alert" className="hr-alert">{error}</div>}
    {result&&<div role="status" className="hr-success"><strong>تم تسجيل {action==="check_in"?"الحضور":"الانصراف"} بنجاح ✓</strong><div>الموظف: {result.employee_name}</div><div>الوقت: {recordedAt}</div></div>}
    <button className="hr-action hr-attendance-submit" disabled={busy||code.length!==6} type="submit">{busy?"جارٍ تسجيل العملية...":"تأكيد التسجيل"}</button>
   </form>
   <p className="hr-attendance-note">يتم حفظ وقت التسجيل تلقائيًا بتوقيت القاهرة. لو الكود مش شغال، تواصل مع المدير المسؤول.</p>
  </section>
 </main>;
}
