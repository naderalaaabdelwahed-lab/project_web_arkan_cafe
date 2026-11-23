"use client";
import {useEffect,useRef,useState} from "react";
export default function AttendanceKiosk(){
 const [deviceToken,setDeviceToken]=useState("");
 const [pin,setPin]=useState("");
 const [action,setAction]=useState("check_in");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [cameraError,setCameraError]=useState("");
 const video=useRef(null),stream=useRef(null);
 useEffect(()=>{try{setDeviceToken(localStorage.getItem("arkan_hr_kiosk_token")||"")}catch{} return()=>stream.current?.getTracks().forEach(t=>t.stop())},[]);
 async function startCamera(){
  setCameraError("");
  try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});stream.current=s;if(video.current)video.current.srcObject=s;}
  catch(e){setCameraError("تعذر تشغيل الكاميرا. تأكد من السماح للمتصفح باستخدامها وأن الموقع يعمل عبر HTTPS أو localhost.");}
 }
 function saveToken(){localStorage.setItem("arkan_hr_kiosk_token",deviceToken.trim());setNotice("تم حفظ إعداد الجهاز على هذا المتصفح.");}
 async function submit(e){
  e.preventDefault();setBusy(true);setNotice("");
  try{
   const r=await fetch("/api/kiosk/attendance",{method:"POST",headers:{"Content-Type":"application/json","x-ark-kiosk-token":deviceToken},body:JSON.stringify({pin,action})});
   const data=await r.json();if(!r.ok)throw new Error(data.error||"تعذر تسجيل الحضور.");
   const time=new Date(data.recorded_at).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Africa/Cairo"});
   setNotice("تم تسجيل "+(action==="check_in"?"الحضور":"الانصراف")+" للموظف "+data.employee_name+" الساعة "+time+".");
   setPin("");
  }catch(e){setNotice(e.message)}finally{setBusy(false)}
 }
 async function submitFace(){
  setBusy(true);setNotice("");
  try{
   if(!video.current||!video.current.videoWidth)throw new Error("شغّل الكاميرا وانتظر ظهور الصورة أولاً.");
   const canvas=document.createElement("canvas");
   canvas.width=video.current.videoWidth;canvas.height=video.current.videoHeight;
   canvas.getContext("2d").drawImage(video.current,0,0,canvas.width,canvas.height);
   const image_base64=canvas.toDataURL("image/jpeg",0.88);
   const r=await fetch("/api/kiosk/attendance",{method:"POST",headers:{"Content-Type":"application/json","x-ark-kiosk-token":deviceToken},body:JSON.stringify({image_base64,action})});
   const data=await r.json();if(!r.ok)throw new Error(data.error||"تعذر التحقق من الوجه.");
   const time=new Date(data.recorded_at).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Africa/Cairo"});
   setNotice("تم التعرف على "+data.employee_name+" وتسجيل "+(action==="check_in"?"الحضور":"الانصراف")+" الساعة "+time+".");
   setPin("");
  }catch(e){setNotice(e.message)}finally{setBusy(false)}
 }
 return <main dir="rtl" style={{minHeight:"100vh",background:"#101820",color:"#fff",display:"grid",placeItems:"center",padding:20}}>
  <section style={{width:"min(100%,520px)",background:"#1c2935",padding:24,borderRadius:18,border:"1px solid #3b4d5c",display:"grid",gap:16}}>
   <h1 style={{margin:0,textAlign:"center"}}>ARKAN — تسجيل الحضور والانصراف</h1>
   <p style={{margin:0,color:"#aebdca",textAlign:"center"}}>قف أمام الكاميرا لتسجيل الحضور أو الانصراف ببصمة الوجه. ويمكن استخدام الرقم السري كبديل.</p>
   <div style={{background:"#101820",borderRadius:12,padding:12}}>
    <video ref={video} autoPlay playsInline muted style={{width:"100%",maxHeight:220,objectFit:"cover",borderRadius:8,background:"#000"}}/>
    <button type="button" onClick={startCamera} style={{width:"100%",marginTop:8,padding:10}}>تشغيل كاميرا الجهاز</button>
    <small style={{display:"block",color:"#e7c98d",marginTop:8}}>التعرف على الوجه مفعّل. يجب الوقوف بمفردك أمام الكاميرا وفي إضاءة جيدة.</small>
    {cameraError&&<p style={{color:"#ff9c9c"}}>{cameraError}</p>}
   </div>
   {!deviceToken&&<div style={{display:"grid",gap:8}}><label>رمز تفعيل الجهاز (يقدمه المدير)</label><input value={deviceToken} onChange={e=>setDeviceToken(e.target.value)} style={field}/><button onClick={saveToken}>حفظ تفعيل الجهاز</button></div>}
   {deviceToken&&<form onSubmit={submit} style={{display:"grid",gap:14}}>
    <div style={{display:"flex",gap:8}}><button type="button" onClick={()=>setAction("check_in")} style={{...choice,background:action==="check_in"?"#d6a44d":"#344657",color:action==="check_in"?"#101820":"white"}}>تسجيل حضور</button><button type="button" onClick={()=>setAction("check_out")} style={{...choice,background:action==="check_out"?"#d6a44d":"#344657",color:action==="check_out"?"#101820":"white"}}>تسجيل انصراف</button></div>
    <button type="button" disabled={busy} onClick={submitFace} style={{...choice,background:"#d6a44d",color:"#101820",fontWeight:800}}>{busy?"جارٍ التحقق...":action==="check_in"?"تسجيل الحضور بالوجه":"تسجيل الانصراف بالوجه"}</button>
    <p style={{margin:0,textAlign:"center",color:"#aebdca"}}>أو استخدم الرقم السري كطريقة بديلة</p>
    <label style={{display:"grid",gap:8}}>الرقم السري للموظف<input autoComplete="off" inputMode="numeric" type="password" maxLength={8} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} style={{...field,textAlign:"center",fontSize:28,letterSpacing:8}} placeholder="••••"/></label>
    <button disabled={busy||pin.length<4} style={{...choice,background:"#344657",color:"#fff",fontWeight:700}}>{busy?"جارٍ التسجيل...": "التسجيل بالرقم السري"}</button>
   </form>}
   {notice&&<div role="status" style={{background:"#203d34",padding:13,borderRadius:9,textAlign:"center"}}>{notice}</div>}
   <button type="button" onClick={()=>{localStorage.removeItem("arkan_hr_kiosk_token");setDeviceToken("");setNotice("تم مسح إعداد الجهاز.")}} style={{background:"transparent",color:"#aebdca",border:"1px solid #425466",padding:9,borderRadius:8}}>مسح تفعيل الجهاز</button>
  </section>
 </main>
}
const field={width:"100%",padding:12,borderRadius:9,border:"1px solid #425466",background:"#101820",color:"white",boxSizing:"border-box"};
const choice={flex:1,padding:13,border:0,borderRadius:9,cursor:"pointer",fontSize:16};
