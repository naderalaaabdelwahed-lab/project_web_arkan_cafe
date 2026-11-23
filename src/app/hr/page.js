"use client";
import {useState} from "react";

export default function HrHome(){
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
 return <main dir="rtl" style={{minHeight:"100vh",background:"radial-gradient(ellipse at 50% 0%,#3b2b18 0%,#17120d 48%,#100d0b 100%)",color:"#f4e9d8",display:"grid",placeItems:"center",padding:"30px 16px",boxSizing:"border-box"}}>
  <div style={{width:"min(100%,560px)",display:"grid",gap:18}}>
   <header style={{textAlign:"center",padding:"12px 0 8px"}}>
    <div style={{fontSize:35,fontWeight:950,letterSpacing:1}}>ARKAN<span style={{color:"#c9a45c"}}>.</span></div>
    <div style={{fontSize:12,letterSpacing:3,color:"#c9a45c",fontWeight:800,marginTop:3}}>EMPLOYEE ATTENDANCE</div>
    <h1 style={{fontSize:27,margin:"18px 0 8px"}}>تسجيل الحضور والانصراف</h1>
    <p style={{color:"#ad9e88",margin:0,lineHeight:1.8}}>اختار العملية، اكتب كودك الشخصي، وسجّل وقتك بسهولة.</p>
   </header>
   <form onSubmit={submit} style={{background:"linear-gradient(145deg,#241d15,#19140f)",border:"1px solid #59472d",borderRadius:20,padding:24,display:"grid",gap:20,boxShadow:"0 24px 80px #0008"}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
     <button type="button" onClick={()=>{setAction("check_in");setError("");setResult(null);}} aria-pressed={action==="check_in"} style={{padding:"16px 10px",borderRadius:12,border:action==="check_in"?"1px solid #d6b875":"1px solid #51422d",background:action==="check_in"?"linear-gradient(135deg,#c9a45c,#9b7437)":"#17130f",color:action==="check_in"?"#17120b":"#d8cbb5",fontSize:17,fontWeight:900,cursor:"pointer"}}><span style={{display:"block",fontSize:23,marginBottom:5}}>↘</span>حضور</button>
     <button type="button" onClick={()=>{setAction("check_out");setError("");setResult(null);}} aria-pressed={action==="check_out"} style={{padding:"16px 10px",borderRadius:12,border:action==="check_out"?"1px solid #d6b875":"1px solid #51422d",background:action==="check_out"?"linear-gradient(135deg,#c9a45c,#9b7437)":"#17130f",color:action==="check_out"?"#17120b":"#d8cbb5",fontSize:17,fontWeight:900,cursor:"pointer"}}><span style={{display:"block",fontSize:23,marginBottom:5}}>↗</span>انصراف</button>
    </div>
    <label style={{display:"grid",gap:10,color:"#e8ddca",fontWeight:800}}>
     كود الحضور والانصراف
     <input required type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} minLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\\D/g,"").slice(0,6))} placeholder="••••••" style={{width:"100%",boxSizing:"border-box",textAlign:"center",fontSize:28,letterSpacing:12,fontWeight:900,padding:"16px 12px",borderRadius:12,border:"1px solid #665334",background:"#100d0b",color:"#f4e9d8",outlineColor:"#c9a45c"}}/>
     <small style={{fontWeight:400,color:"#9f917d"}}>الكود مكوّن من 6 أرقام. خليه سري وما تشاركهوش مع أي حد.</small>
    </label>
    {error&&<div role="alert" style={{padding:13,borderRadius:10,background:"#482323",border:"1px solid #754343",color:"#ffc5c5"}}>{error}</div>}
    {result&&<div role="status" style={{padding:15,borderRadius:10,background:"#193a2c",border:"1px solid #31684c",color:"#b5f0ca",lineHeight:1.9}}><strong>تم تسجيل {action==="check_in"?"الحضور":"الانصراف"} بنجاح ✓</strong><div>الموظف: {result.employee_name}</div><div>الوقت: {recordedAt}</div></div>}
    <button disabled={busy||code.length!==6} type="submit" style={{padding:15,border:0,borderRadius:12,background:"#c9a45c",color:"#17120b",fontSize:17,fontWeight:900,cursor:busy?"wait":"pointer",opacity:busy||code.length!==6?.6:1}}>{busy?"جارٍ تسجيل العملية...":action==="check_in"?"تأكيد تسجيل الحضور":"تأكيد تسجيل الانصراف"}</button>
   </form>
   <footer style={{textAlign:"center",color:"#81745f",fontSize:12,lineHeight:1.8}}>يتم حفظ وقت التسجيل تلقائيًا بتوقيت القاهرة.<br/>لو الكود مش شغال، تواصل مع المدير المسؤول.</footer>
  </div>
 </main>;
}
