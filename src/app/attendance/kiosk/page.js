"use client";
import {useCallback,useEffect,useState} from "react";

export default function AttendanceKiosk(){
 const [deviceToken,setDeviceToken]=useState("");
 const [employees,setEmployees]=useState([]);
 const [employeeId,setEmployeeId]=useState("");
 const [pin,setPin]=useState("");
 const [action,setAction]=useState("check_in");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [configured,setConfigured]=useState(false);

 const loadEmployees=useCallback(async(token)=>{
  if(!token)return;
  try{
   const r=await fetch("/api/kiosk/attendance",{headers:{"x-ark-kiosk-token":token},cache:"no-store"});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"تعذر تحميل الموظفين.");
   setEmployees(data.employees||[]);
   setEmployeeId(current=>(data.employees||[]).some(x=>x.id===current)?current:(data.employees||[])[0]?.id||"");
   setError("");
  }catch(e){setError(e.message);setEmployees([]);}
 },[]);
 useEffect(()=>{
  try{const token=localStorage.getItem("arkan_hr_kiosk_token")||"";setDeviceToken(token);setConfigured(Boolean(token));if(token)loadEmployees(token);}catch{}
 },[loadEmployees]);
 function saveToken(){
  const token=deviceToken.trim();
  if(!/^[a-f0-9]{64}$/i.test(token)){setError("رمز تفعيل الجهاز غير صحيح.");return;}
  localStorage.setItem("arkan_hr_kiosk_token",token);setConfigured(true);setNotice("تم تفعيل جهاز الحضور.");setError("");loadEmployees(token);
 }
 async function submit(e){
  e.preventDefault();setBusy(true);setNotice("");setError("");
  try{
   const r=await fetch("/api/kiosk/attendance",{method:"POST",headers:{"Content-Type":"application/json","x-ark-kiosk-token":deviceToken},body:JSON.stringify({employee_id:employeeId,pin,action})});
   const data=await r.json();if(!r.ok)throw new Error(data.error||"تعذر تسجيل العملية.");
   const date=new Date(data.recorded_at).toLocaleDateString("ar-EG",{day:"numeric",month:"long",year:"numeric",timeZone:"Africa/Cairo"});
   const time=new Date(data.recorded_at).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Africa/Cairo"});
   setNotice("تم تسجيل "+(action==="check_in"?"الحضور":"الانصراف")+" للموظف "+data.employee_name+" بتاريخ "+date+" الساعة "+time+". يوم العمل: "+data.shift_date);
   setPin("");
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <main dir="rtl" style={{minHeight:"100vh",background:"#101820",color:"#fff",display:"grid",placeItems:"center",padding:20}}>
  <section style={{width:"min(100%,480px)",background:"#1c2935",padding:24,borderRadius:18,border:"1px solid #3b4d5c",display:"grid",gap:16}}>
   <div style={{textAlign:"center"}}><h1 style={{margin:"0 0 8px"}}>ARKAN</h1><h2 style={{margin:0}}>تسجيل الحضور والانصراف</h2><p style={{color:"#aebdca"}}>اختار اسمك وحدد العملية واكتب الكود الشخصي.</p></div>
   {!configured&&<div style={{display:"grid",gap:9}}><label>رمز تفعيل جهاز الحضور (من المدير)</label><input value={deviceToken} onChange={e=>setDeviceToken(e.target.value)} style={field} autoComplete="off"/><button type="button" onClick={saveToken} style={primary}>تفعيل الجهاز</button></div>}
   {configured&&<form onSubmit={submit} style={{display:"grid",gap:15}}>
    <label style={label}>اسم الموظف
     <select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)} style={field}>
      <option value="">اختار اسمك</option>{employees.map(x=><option key={x.id} value={x.id}>{x.full_name}{x.job_title?" — "+x.job_title:""}</option>)}
     </select>
    </label>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
     <button type="button" onClick={()=>setAction("check_in")} style={{...choice,background:action==="check_in"?"#d6a44d":"#344657",color:action==="check_in"?"#101820":"#fff"}}>تسجيل حضور</button>
     <button type="button" onClick={()=>setAction("check_out")} style={{...choice,background:action==="check_out"?"#d6a44d":"#344657",color:action==="check_out"?"#101820":"#fff"}}>تسجيل انصراف</button>
    </div>
    <label style={label}>الكود الشخصي
     <input required autoComplete="off" inputMode="numeric" type="password" maxLength={8} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} style={{...field,textAlign:"center",fontSize:28,letterSpacing:9}} placeholder="••••"/>
    </label>
    <button disabled={busy||!employeeId||pin.length<4} style={primary}>{busy?"جارٍ التسجيل...":"تأكيد "+(action==="check_in"?"الحضور":"الانصراف")}</button>
    <button type="button" onClick={()=>loadEmployees(deviceToken)} style={secondary}>تحديث قائمة الموظفين</button>
   </form>}
   {error&&<div role="alert" style={{background:"#4a2024",padding:12,borderRadius:9}}>{error}</div>}
   {notice&&<div role="status" style={{background:"#203d34",padding:13,borderRadius:9,textAlign:"center"}}>{notice}</div>}
   <button type="button" onClick={()=>{localStorage.removeItem("arkan_hr_kiosk_token");setDeviceToken("");setConfigured(false);setEmployees([]);setNotice("تم إلغاء تفعيل الجهاز من هذا المتصفح.");setError("");}} style={secondary}>إلغاء تفعيل الجهاز</button>
  </section>
 </main>
}
const field={width:"100%",padding:12,borderRadius:9,border:"1px solid #425466",background:"#101820",color:"white",boxSizing:"border-box",marginTop:7};
const label={display:"grid",gap:5,color:"#dbe4ec"};
const choice={padding:14,border:0,borderRadius:9,cursor:"pointer",fontSize:16,fontWeight:700};
const primary={...choice,background:"#d6a44d",color:"#101820"};
const secondary={...choice,background:"#344657",color:"#fff"};
