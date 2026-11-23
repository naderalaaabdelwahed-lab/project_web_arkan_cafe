"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";

const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const box={background:"#211b14",border:"1px solid #443723",borderRadius:12,padding:16};
const field={padding:10,borderRadius:8,border:"1px solid #54452e",background:"#15120e",color:"#fff"};
const statusLabels={present:"حاضر",absent_pending:"غياب قيد المراجعة",absent:"غياب",paid_leave:"إجازة مدفوعة",unpaid_leave:"إجازة بدون راتب",excused:"غياب بعذر",holiday:"عطلة"};

export default function AttendancePage(){
 const [rows,setRows]=useState([]),[employees,setEmployees]=useState([]),[registers,setRegisters]=useState([]),[leaveBalances,setLeaveBalances]=useState([]),[payrollRun,setPayrollRun]=useState(null),[payrollPreview,setPayrollPreview]=useState([]);
 const [employee,setEmployee]=useState(""),[month,setMonth]=useState(today.slice(0,7));
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");

 async function call(url,options={}){
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  if(!data.session?.access_token)throw new Error("سجل دخول المدير أولاً.");
  const r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+data.session.access_token},cache:"no-store"});
  const j=await r.json();if(!r.ok)throw new Error(j.error||"حدث خطأ");return j;
 }
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [r,payroll]=await Promise.all([call("/api/admin/hr/attendance?month="+encodeURIComponent(month)),call("/api/admin/hr/payroll?month="+encodeURIComponent(month))]);
   setRows(r.attendance||[]);setEmployees(r.employees||[]);setRegisters(r.registers||[]);setLeaveBalances(r.leaveBalances||[]);setPayrollRun(payroll.runs?.[0]||null);setPayrollPreview(payroll.preview||[]);
   setEmployee(current=>current&&r.employees?.some(x=>x.id===current)?current:(r.employees?.find(x=>x.employment_status==="active")||r.employees?.[0])?.id||"");
  }catch(e){setError(e.message)}finally{setLoading(false)}
 },[month]);
 useEffect(()=>{load()},[load]);

 const selected=employees.find(x=>x.id===employee);
 const register=registers.find(x=>x.employee_id===employee);
 const employeeRows=useMemo(()=>rows.filter(x=>x.employee_id===employee),[rows,employee]);
 const rowsByDate=useMemo(()=>new Map(employeeRows.map(x=>[x.shift_date,x])),[employeeRows]);
 const days=useMemo(()=>{
  const [y,m]=month.split("-").map(Number),count=new Date(Date.UTC(y,m,0)).getUTCDate();
  return Array.from({length:count},(_,i)=>new Date(Date.UTC(y,m-1,i+1)).toISOString().slice(0,10));
 },[month]);
 const summary=useMemo(()=>({
  attended:employeeRows.filter(x=>x.attendance_status==="present"&&x.check_in_at).length,
  worked:employeeRows.reduce((s,x)=>s+Number(x.worked_minutes||0),0),
  overtime:employeeRows.reduce((s,x)=>s+Number(x.overtime_minutes||0),0),
  shortage:employeeRows.reduce((s,x)=>s+Number(x.shortage_minutes||0),0),
  absent:employeeRows.filter(x=>["absent","absent_pending","excused","unpaid_leave"].includes(x.attendance_status)).length,
  paidLeave:employeeRows.filter(x=>x.attendance_status==="paid_leave").length
 }),[employeeRows]);
 const balance=leaveBalances.find(x=>x.employee_id===employee);
 const payrollItem=payrollRun?.hr_payroll_items?.find(x=>x.employee_id===employee)||payrollPreview.find(x=>x.employee_id===employee);
 const payrollDetails=payrollItem?.details||{};
 const hourlyRate=Number(payrollDetails.hour_rate||0);
 const overtimeAmount=Number(payrollDetails.overtime_amount??(Number(payrollDetails.overtime_minutes||0)/60*hourlyRate));
 const shortageAmount=Number(payrollDetails.shortage_amount??(Number(payrollDetails.shortage_minutes||0)/60*hourlyRate));
 const totalDeductions=Number(payrollItem?.other_deductions||0)+shortageAmount;
 const money=v=>Number(v||0).toLocaleString("ar-EG",{minimumFractionDigits:2,maximumFractionDigits:2})+" ج.م";
 const fmt=v=>v?new Date(v).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Cairo"}):"—";
 const hours=v=>(Number(v||0)/60).toFixed(2)+" ساعة";
 const fmtDate=v=>new Date(v+"T00:00:00Z").toLocaleDateString("ar-EG",{weekday:"short",day:"2-digit",month:"2-digit",timeZone:"UTC"});

 async function addStatus(date,status){
  try{
   await call("/api/admin/hr/attendance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employee_id:employee,shift_date:date,attendance_status:status,notes:"تم تسجيل الحالة بواسطة المدير"})});
   setMessage(status==="paid_leave"?"تم تسجيل الإجازة المدفوعة.":"تم تسجيل الغياب.");await load();
  }catch(e){setError(e.message)}
 }
 async function review(row,status){
  try{await call("/api/admin/hr/attendance",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id,attendance_status:status,notes:row.notes||""})});setMessage("تم تحديث حالة اليوم.");await load()}
  catch(e){setError(e.message)}
 }
 function localDateTimeValue(value){
  if(!value)return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute;
 }
 async function editTimes(row){
  const checkIn=window.prompt("وقت الحضور بتوقيت مصر (YYYY-MM-DDTHH:mm)، اتركه فارغًا لو لم يحضر:",localDateTimeValue(row.check_in_at));if(checkIn===null)return;
  const checkOut=window.prompt("وقت الانصراف بتوقيت مصر (YYYY-MM-DDTHH:mm)، اتركه فارغًا لو لم ينصرف:",localDateTimeValue(row.check_out_at));if(checkOut===null)return;
  try{
   await call("/api/admin/hr/attendance",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:row.id,check_in_local:checkIn||null,check_out_local:checkOut||null})});
   setMessage("تم تعديل الأوقات وإعادة حساب ساعات العمل والإضافي والعجز.");await load();
  }catch(e){setError(e.message)}
 }

 return <main dir="rtl" style={{padding:24,maxWidth:1400,margin:"0 auto",color:"var(--foreground,#fff)"}}>
  <style jsx global>{`
   @media print {
    body * { visibility:hidden !important; }
    .attendance-print, .attendance-print * { visibility:visible !important; }
    .attendance-print { position:absolute !important; inset:0 !important; width:100% !important; padding:12px !important; margin:0 !important; background:#fff !important; color:#111 !important; border:0 !important; box-shadow:none !important; }
    .attendance-print table { width:100% !important; border-collapse:collapse !important; font-size:11px !important; }
    .attendance-print th,.attendance-print td { color:#111 !important; border:1px solid #777 !important; padding:6px !important; white-space:normal !important; }
    .attendance-print h1,.attendance-print h2,.attendance-print p,.attendance-print strong { color:#111 !important; }
    .attendance-no-print { display:none !important; }
    @page { size:A4 portrait; margin:10mm; }
   }
  `}</style>
  <h1>كشف الحضور الشهري</h1>
  <p>لكل موظف سجل مستقل لكل شهر، ويتم إنشاء سجل الشهر تلقائيًا مع بداية الشهر أو عند إضافة موظف جديد.</p>
  {error&&<p role="alert" style={{color:"#ff8c8c"}}>{error}</p>}
  {message&&<p role="status">{message}</p>}
  <section className="attendance-no-print" style={{...box,display:"flex",gap:12,flexWrap:"wrap",alignItems:"end",marginBottom:18}}>
   <label>الموظف<br/><select style={field} value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">اختر الموظف</option>{employees.map(x=><option key={x.id} value={x.id}>{x.full_name}{x.employment_status==="inactive"?" (غير نشط)":""}</option>)}</select></label>
   <label>الشهر<br/><input style={field} type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
   <button onClick={load} disabled={loading}>{loading?"جارٍ التحميل...":"تحديث الكشف"}</button>
   <button onClick={()=>window.print()} disabled={!selected||loading}>طباعة كشف الموظف</button>
  </section>
  {selected&&<>
   <section className="attendance-print" style={{...box,marginBottom:18}}>
    <header style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",borderBottom:"1px solid #8b6d3c",paddingBottom:12,marginBottom:14}}>
     <div><h1 style={{margin:"0 0 8px"}}>ARKAN — كشف الحضور والانصراف الشهري</h1><h2 style={{margin:"0 0 6px"}}>{selected.full_name}</h2><p style={{margin:0}}>الوظيفة: {selected.job_title||"—"} | القسم: {selected.department||"—"}</p><p style={{margin:"5px 0 0"}}>تاريخ التعيين: {selected.hire_date||"—"} | آخر يوم عمل: {selected.termination_date||"على رأس العمل"}</p></div>
     <div><strong>الشهر: {month}</strong><p>الفترة: {month}-01 إلى {month}- {new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()}</p><p>رقم السجل: {register?.id||"—"}</p></div>
    </header>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginBottom:16}}>
     <div style={box}><strong>أيام الحضور</strong><div>{summary.attended} يوم</div></div>
     <div style={box}><strong>إجمالي العمل</strong><div>{hours(summary.worked)}</div></div>
     <div style={box}><strong>الإضافي</strong><div>{hours(summary.overtime)}</div></div>
     <div style={box}><strong>العجز</strong><div>{hours(summary.shortage)}</div></div>
     <div style={box}><strong>أيام الغياب</strong><div>{summary.absent} يوم</div></div>
     <div style={box}><strong>الإجازات المدفوعة</strong><div>{summary.paidLeave} يوم</div></div>
    </div>
    <section style={{marginBottom:18,padding:14,border:"1px solid #8b6d3c",borderRadius:10}}>
     <h2 style={{margin:"0 0 12px"}}>كشف المستحقات والراتب</h2>
     {payrollItem?<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
       <div style={box}><strong>الراتب الشهري</strong><div>{money(payrollDetails.contract_monthly_salary)}</div></div>
       <div style={box}><strong>أيام الحضور</strong><div>{payrollDetails.attended_days??summary.attended} يوم</div></div>
       <div style={box}><strong>الإجازات المدفوعة</strong><div>{Number(payrollDetails.paid_leave_days??payrollItem.paid_leave_days??0).toFixed(2)} يوم</div></div>
       <div style={box}><strong>الأساسي المستحق</strong><div>{money(payrollItem.monthly_salary)}</div></div>
       <div style={box}><strong>ساعات الإضافي</strong><div>{hours(payrollDetails.overtime_minutes)}</div></div>
       <div style={box}><strong>ساعات العجز</strong><div>{hours(payrollDetails.shortage_minutes)}</div></div>
       <div style={box}><strong>قيمة الإضافي</strong><div>{money(overtimeAmount)}</div></div>
       <div style={box}><strong>خصم العجز</strong><div>{money(shortageAmount)}</div></div>
       <div style={box}><strong>الخصومات الأخرى</strong><div>{money(payrollItem.other_deductions)}</div></div>
       <div style={box}><strong>إجمالي الخصومات مع العجز</strong><div>{money(totalDeductions)}</div></div>
       <div style={box}><strong>الحوافز والإضافات</strong><div>{money(payrollItem.additions)}</div></div>
       <div style={box}><strong>سعر الساعة</strong><div>{money(hourlyRate)}</div></div>
       <div style={box}><strong>أجر اليوم</strong><div>{money(Number(payrollDetails.contract_monthly_salary||0)/30)}</div></div>
       <div style={box}><strong>أيام مدة الاستحقاق</strong><div>{payrollDetails.eligible_days??0} يوم</div></div>
       <div style={box}><strong>إجمالي الأيام المدفوعة</strong><div>{Number(payrollDetails.paid_days_total??0).toFixed(2)} يوم</div></div>
       <div style={{...box,gridColumn:"span 2"}}><strong>صافي الراتب بعد الإضافي والعجز والخصومات والحوافز</strong><div style={{fontSize:22,fontWeight:800}}>{money(payrollItem.net_salary)}</div></div>
       <div style={box}><strong>فترة الاستحقاق</strong><div>{payrollDetails.eligible_start||month+"-01"} إلى {payrollDetails.eligible_end||month+"-"+new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()}</div></div>
      </div>
      <p style={{margin:"12px 0 0"}}>حالة كشف الرواتب: {payrollRun?(payrollRun.status==="finalized"?"معتمد":"مسودة — لم يتم الاعتماد بعد"):"حساب مباشر — لم يتم إنشاء كشف الرواتب بعد"}</p>
     </>:<p style={{margin:0}}>تعذر حساب مستحقات الموظف لهذا الشهر. راجع بيانات الراتب وتسجيلات الحضور.</p>}
    </section>
    <div style={{overflowX:"auto"}}>
     <table style={{width:"100%",borderCollapse:"collapse",minWidth:850}}>
      <thead><tr>{["اليوم / التاريخ","الحضور","الانصراف","ساعات العمل","إضافي","عجز","الحالة","ملاحظات"].map(x=><th key={x} style={{textAlign:"right",padding:9,borderBottom:"1px solid #8b6d3c"}}>{x}</th>)}</tr></thead>
      <tbody>{days.map(date=>{
       const row=rowsByDate.get(date),beforeHire=date<selected.hire_date,future=date>today;
       return <tr key={date}>
        <td style={td}>{fmtDate(date)}</td>
        <td style={td}>{fmt(row?.check_in_at)}</td><td style={td}>{fmt(row?.check_out_at)}</td>
        <td style={td}>{row?hours(row.worked_minutes):"—"}</td>
        <td style={td}>{row?hours(row.overtime_minutes):"—"}</td><td style={td}>{row?hours(row.shortage_minutes):"—"}</td>
        <td style={td}>{beforeHire?"قبل التعيين":future?"لم يحن بعد":row?(statusLabels[row.attendance_status]||row.attendance_status):"لا يوجد تسجيل"}</td>
        <td style={td}>{row?.notes||"—"}</td>
       </tr>;
      })}</tbody>
     </table>
    </div>
    <footer style={{display:"flex",justifyContent:"space-between",gap:20,marginTop:26,paddingTop:14,borderTop:"1px solid #999"}}>
     <span>توقيع الموظف: __________________</span><span>اعتماد المدير: __________________</span>
    </footer>
   </section>
   <section className="attendance-no-print" style={{...box,marginBottom:18}}>
    <h2>تعديل أيام السجل</h2>
    <p>يمكن تسجيل غياب أو إجازة لأي يوم لم يتم تسجيله، أو تعديل وقت الحضور والانصراف للأيام المسجلة.</p>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:950}}><thead><tr>{["التاريخ","الحضور","الانصراف","العمل","الإضافي","العجز","الحالة","الإجراء"].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>
     {days.map(date=>{
      const row=rowsByDate.get(date),beforeHire=date<selected.hire_date,future=date>today;
      return <tr key={date}>
       <td style={td}>{date}</td><td style={td}>{fmt(row?.check_in_at)}</td><td style={td}>{fmt(row?.check_out_at)}</td>
       <td style={td}>{row?hours(row.worked_minutes):"—"}</td><td style={td}>{row?hours(row.overtime_minutes):"—"}</td><td style={td}>{row?hours(row.shortage_minutes):"—"}</td>
       <td style={td}>{row?<select style={field} value={row.attendance_status} onChange={e=>review(row,e.target.value)}>{Object.entries(statusLabels).filter(([k])=>k!=="absent_pending").map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>:beforeHire?"قبل التعيين":future?"لم يحن بعد":"لا يوجد تسجيل"}</td>
       <td style={td}>{row?<button onClick={()=>editTimes(row)}>تعديل الوقت</button>:!beforeHire&&!future?<span style={{display:"flex",gap:6}}><button onClick={()=>addStatus(date,"absent")}>غياب</button><button onClick={()=>addStatus(date,"paid_leave")}>إجازة</button></span>:"—"}</td>
      </tr>;
     })}
    </tbody></table></div>
   </section>
   <section className="attendance-no-print" style={box}>
    <h2>رصيد الإجازات المدفوعة — {month.slice(0,4)}</h2>
    <p>المستخدم: {balance?.used_days||0} يوم | المخصص: {balance?.allocated_days??selected.paid_leave_days??0} يوم | المتبقي: {Math.max(0,Number(balance?.allocated_days??selected.paid_leave_days??0)-Number(balance?.used_days||0))} يوم</p>
   </section>
  </>}
  {!selected&&!loading&&<section style={box}>لا يوجد موظفون لعرض كشفهم.</section>}
 </main>;
}
const th={textAlign:"right",padding:9,borderBottom:"1px solid #54452e",whiteSpace:"nowrap"};
const td={padding:9,borderBottom:"1px solid #3a3022",whiteSpace:"nowrap"};
