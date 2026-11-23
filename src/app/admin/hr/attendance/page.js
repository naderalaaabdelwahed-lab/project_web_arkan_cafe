"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
const box={background:"#1c2935",border:"1px solid #3b4d5c",borderRadius:12,padding:16},field={padding:10,borderRadius:8,border:"1px solid #425466",background:"#17232e",color:"#fff"};
export default function AttendancePage(){
 const [rows,setRows]=useState([]),[employees,setEmployees]=useState([]),[leaveBalances,setLeaveBalances]=useState([]),[employee,setEmployee]=useState(""),[date,setDate]=useState(new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Cairo"})),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function call(url,options={}){const {data,error}=await supabase.auth.getSession();if(error)throw error;if(!data.session?.access_token)throw new Error("سجل دخول المدير أولاً.");const r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+data.session.access_token},cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||"حدث خطأ");return j}
 const load=useCallback(async()=>{setLoading(true);try{const r=await call("/api/admin/hr/attendance");setRows(r.attendance||[]);setEmployees(r.employees||[]);setLeaveBalances(r.leaveBalances||[]);setEmployee(current=>current||r.employees?.[0]?.id||"")}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{load()},[load]);
 async function review(row,status){try{await call("/api/admin/hr/attendance",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id,attendance_status:status,notes:row.notes||""})});setMessage("تم تحديث حالة السجل.");await load()}catch(e){setError(e.message)}}
 function localDateTimeValue(value){
  if(!value)return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute;
 }
 async function editTimes(row){
  const checkIn=window.prompt("وقت الحضور بتوقيت مصر (YYYY-MM-DDTHH:mm)، اتركه فارغًا لو لم يحضر:",localDateTimeValue(row.check_in_at));
  if(checkIn===null)return;
  const checkOut=window.prompt("وقت الانصراف بتوقيت مصر (YYYY-MM-DDTHH:mm)، اتركه فارغًا لو لم ينصرف:",localDateTimeValue(row.check_out_at));
  if(checkOut===null)return;
  try{
   await call("/api/admin/hr/attendance",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id,check_in_local:checkIn||null,check_out_local:checkOut||null})});
   setMessage("تم تعديل الأوقات وإعادة حساب ساعات العمل والإضافي.");await load();
  }catch(e){setError(e.message)}
 }
 async function addAbsence(status){try{await call("/api/admin/hr/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employee_id:employee,shift_date:date,attendance_status:status,notes:"تم تسجيل الحالة بواسطة المدير"})});setMessage("تم حفظ الحالة.");await load()}catch(e){setError(e.message)}}
 const fmt=v=>v?new Date(v).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Cairo"}):"—";
 return <main dir="rtl" style={{padding:24,maxWidth:1300,margin:"0 auto",color:"var(--foreground,#fff)"}}><h1>الحضور والغياب</h1><p>النظام ينشئ غيابًا قيد المراجعة بعد انتهاء الشيفت ومهلة السماح، والمدير يحدد الحالة النهائية.</p>{error&&<p role="alert" style={{color:"#ff8c8c"}}>{error}</p>}{message&&<p role="status">{message}</p>}
 <section style={{...box,display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",marginBottom:18}}><label>الموظف<br/><select style={field} value={employee} onChange={e=>setEmployee(e.target.value)}>{employees.map(x=><option key={x.id} value={x.id}>{x.full_name}</option>)}</select></label><label>التاريخ<br/><input style={field} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button onClick={()=>addAbsence("absent")}>تسجيل غياب</button><button onClick={()=>addAbsence("paid_leave")}>إجازة مدفوعة</button></section>
 <section style={{...box,marginBottom:18}}><h2>رصيد الإجازات المدفوعة للسنة الحالية</h2><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{employees.map(emp=>{const b=leaveBalances.find(x=>x.employee_id===emp.id);const allocated=Number(b?.allocated_days??emp.paid_leave_days??0),used=Number(b?.used_days||0);return <div key={emp.id} style={{padding:12,border:"1px solid #425466",borderRadius:8,minWidth:170}}><b>{emp.full_name}</b><div>المستخدم: {used} يوم</div><div>المتبقي: {Math.max(0,allocated-used)} من {allocated}</div></div>})}</div></section><section style={box}><h2>سجل آخر 30 يوم — تعديل الأوقات متاح لكل سجل، وأي وقت تدخله يُفسَّر بتوقيت مصر</h2>{loading?"جارٍ التحميل...":<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:850}}><thead><tr>{["التاريخ","الموظف","الحضور","الانصراف","دقائق التأخير","الإضافي","الحالة","مراجعة المدير","تعديل الوقت"].map(x=><th key={x} style={{textAlign:"right",padding:9,borderBottom:"1px solid #425466"}}>{x}</th>)}</tr></thead><tbody>{rows.map(x=><tr key={x.id}><td style={td}>{x.shift_date}</td><td style={td}>{x.hr_employees?.full_name||"—"}</td><td style={td}>{fmt(x.check_in_at)}</td><td style={td}>{fmt(x.check_out_at)}</td><td style={td}>{x.late_minutes}</td><td style={td}>{x.overtime_minutes}</td><td style={td}>{({present:"حاضر",absent_pending:"غياب قيد المراجعة",absent:"غياب",paid_leave:"إجازة مدفوعة",unpaid_leave:"إجازة بدون راتب",excused:"غياب بعذر",holiday:"عطلة"})[x.attendance_status]||x.attendance_status}</td><td style={td}><select style={field} value={x.attendance_status} onChange={e=>review(x,e.target.value)}><option value="present">حاضر</option><option value="absent">غياب</option><option value="paid_leave">إجازة مدفوعة</option><option value="unpaid_leave">إجازة بدون راتب</option><option value="excused">غياب بعذر</option><option value="holiday">عطلة</option></select></td><td style={td}><button onClick={()=>editTimes(x)}>تعديل الحضور/الانصراف</button></td></tr>)}</tbody></table></div>}</section></main>
}
const td={padding:10,borderBottom:"1px solid #344657",whiteSpace:"nowrap"};
