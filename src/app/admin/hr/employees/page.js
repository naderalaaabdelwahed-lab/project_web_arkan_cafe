"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const empty = { full_name:"", phone:"", job_title:"", department:"", hire_date:new Date().toISOString().slice(0,10), monthly_salary:"", overtime_hour_rate:"", paid_leave_days:"", daily_work_hours:"8", attendance_code:"", notes:"" };
const inputStyle = { width:"100%", padding:"11px 12px", borderRadius:9, border:"1px solid #54452e", background:"#15120e", color:"#f4e9d8", boxSizing:"border-box" };
const labelStyle = { display:"grid", gap:6, color:"#dbe4ec", fontSize:14 };

export default function HrEmployeesPage() {
  const [employees,setEmployees] = useState([]);
  const [form,setForm] = useState(empty);
  const [editing,setEditing] = useState(null);
  const [photo,setPhoto] = useState(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");

  const token = async () => {
    const {data,error} = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error("سجل دخول المدير أولاً.");
    return data.session.access_token;
  };
  const request = async (url, options={}) => {
    const accessToken = await token();
    const response = await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+accessToken},cache:"no-store"});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "حدث خطأ.");
    return result;
  };
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await request("/api/admin/hr/employees"); setEmployees(result.employees||[]); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{load();},[load]);

  function edit(employee) {
    setEditing(employee.id);
    setForm(Object.fromEntries(Object.keys(empty).map(k=>[k,employee[k] ?? (k==="daily_work_hours"?"8":"")])));
    setPhoto(null); setError(""); setMessage("");
  }
  function reset() { setEditing(null); setForm(empty); setPhoto(null); }
  async function submit(e) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const result = await request("/api/admin/hr/employees",{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,id:editing})});
      const employeeId = editing || result.employee.id;
      if (photo) {
        const data = new FormData(); data.append("employee_id",employeeId); data.append("file",photo);
        await request("/api/admin/hr/employees/photo",{method:"POST",body:data});
      }
      setMessage(editing?"تم تحديث بيانات الموظف.":"تمت إضافة الموظف.");
      reset(); await load();
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }
  async function toggleStatus(employee) {
    if (!confirm(employee.employment_status==="active"?"إيقاف الموظف مع الاحتفاظ بسجلاته؟":"إعادة تفعيل الموظف؟")) return;
    try { await request("/api/admin/hr/employees",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:employee.id,action:employee.employment_status==="active"?"deactivate":"activate"})}); await load(); }
    catch(e) { setError(e.message); }
  }

  return <main dir="rtl" style={{minHeight:"100vh",background:"#100d0b",color:"#f4e9d8",padding:"28px 18px"}}>
    <div style={{maxWidth:1200,margin:"0 auto",display:"grid",gap:22}}>
      <header><h1 style={{fontSize:28,margin:"0 0 8px"}}>شؤون الموظفين</h1><p style={{color:"#ad9e88",margin:0}}>ملفات الموظفين وأكوادهم السرية لتسجيل الحضور والانصراف من الصفحة الرئيسية لـ HR.</p></header>
      {error && <div role="alert" style={{background:"#4a2024",padding:12,borderRadius:9}}>{error}</div>}
      {message && <div role="status" style={{background:"#183d30",padding:12,borderRadius:9}}>{message}</div>}
      <form onSubmit={submit} style={{background:"#211b14",border:"1px solid #443723",borderRadius:14,padding:20,display:"grid",gap:16}}>
        <h2 style={{margin:0,fontSize:20}}>{editing?"تعديل ملف موظف":"إضافة موظف جديد"}</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:14}}>
          <label style={labelStyle}>الاسم بالكامل<input required maxLength={150} style={inputStyle} value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
          <label style={labelStyle}>رقم الهاتف<input style={inputStyle} value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
          <label style={labelStyle}>الوظيفة<input style={inputStyle} value={form.job_title||""} onChange={e=>setForm({...form,job_title:e.target.value})}/></label>
          <label style={labelStyle}>القسم<input style={inputStyle} value={form.department||""} onChange={e=>setForm({...form,department:e.target.value})}/></label>
          <label style={labelStyle}>تاريخ التعيين<input type="date" required style={inputStyle} value={form.hire_date} onChange={e=>setForm({...form,hire_date:e.target.value})}/></label>
          <label style={labelStyle}>الراتب الشهري<input type="number" min="0" step="0.01" style={inputStyle} value={form.monthly_salary} onChange={e=>setForm({...form,monthly_salary:e.target.value})}/></label>
          <label style={labelStyle}>سعر ساعة الإضافي<input type="number" min="0" step="0.01" style={inputStyle} value={form.overtime_hour_rate} onChange={e=>setForm({...form,overtime_hour_rate:e.target.value})}/></label>
          <label style={labelStyle}>أيام الإجازة المدفوعة<input type="number" min="0" step="0.5" style={inputStyle} value={form.paid_leave_days} onChange={e=>setForm({...form,paid_leave_days:e.target.value})}/></label>
          <label style={labelStyle}>ساعات العمل اليومية<input type="number" min="1" max="24" step="0.5" style={inputStyle} value={form.daily_work_hours} onChange={e=>setForm({...form,daily_work_hours:e.target.value})}/></label>
          <label style={labelStyle}>كود الحضور والانصراف (6 أرقام)<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} minLength={6} pattern="[0-9]{6}" required={!editing} style={inputStyle} value={form.attendance_code||""} onChange={e=>setForm({...form,attendance_code:e.target.value.replace(/\D/g,"").slice(0,6)})} placeholder={editing?"اتركه فارغًا للاحتفاظ بالكود الحالي":"مثال: 482951"}/><small style={{color:"#ad9e88"}}>{editing?"اكتب كودًا جديدًا فقط إذا أردت تغييره.":"أنشئ كودًا سريًا خاصًا بالموظف، وسيستخدمه لتسجيل الحضور والانصراف."}</small></label>
          <label style={{...labelStyle,gridColumn:"1/-1"}}>الصورة الشخصية (JPG / PNG / WebP)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhoto(e.target.files?.[0]||null)}/></label>
          <label style={{...labelStyle,gridColumn:"1/-1"}}>ملاحظات<textarea rows={3} style={inputStyle} value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button disabled={saving} style={{background:"#c9a45c",color:"#100d0b",border:0,borderRadius:9,padding:"11px 22px",fontWeight:700,cursor:"pointer"}}>{saving?"جارٍ الحفظ...":editing?"حفظ التعديلات":"إضافة الموظف"}</button>
          {editing && <button type="button" onClick={reset} style={{background:"#3a3022",color:"white",border:0,borderRadius:9,padding:"11px 20px"}}>إلغاء</button>}
        </div>
      </form>
      <section style={{background:"#211b14",border:"1px solid #443723",borderRadius:14,padding:20}}>
        <h2 style={{margin:"0 0 16px",fontSize:20}}>قائمة الموظفين ({employees.length})</h2>
        {loading?<p>جارٍ تحميل الموظفين...</p>:employees.length===0?<p style={{color:"#ad9e88"}}>لسه مفيش موظفين مضافين.</p>:
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
            <thead><tr>{["الموظف","الوظيفة / القسم","الهاتف","الراتب","الحالة","كود الحضور","إجراءات"].map(x=><th key={x} style={{textAlign:"right",padding:12,borderBottom:"1px solid #54452e",color:"#c9a45c"}}>{x}</th>)}</tr></thead>
            <tbody>{employees.map(emp=><tr key={emp.id}>
              <td style={{padding:12,borderBottom:"1px solid #3a3022"}}><div style={{display:"flex",alignItems:"center",gap:10}}>{emp.photo_url?<img src={emp.photo_url} alt="" style={{width:42,height:42,borderRadius:"50%",objectFit:"cover"}}/>:<span style={{width:42,height:42,borderRadius:"50%",background:"#3a3022",display:"grid",placeItems:"center"}}>👤</span>}<span>{emp.full_name}</span></div></td>
              <td style={{padding:12,borderBottom:"1px solid #3a3022"}}>{[emp.job_title,emp.department].filter(Boolean).join(" — ")||"—"}</td>
              <td style={{padding:12,borderBottom:"1px solid #3a3022"}}>{emp.phone||"—"}</td>
              <td style={{padding:12,borderBottom:"1px solid #3a3022"}}>{Number(emp.monthly_salary).toLocaleString("ar-EG")} ج.م</td>
              <td style={{padding:12,borderBottom:"1px solid #3a3022"}}>{emp.employment_status==="active"?"نشط":"موقوف"}</td>
              <td style={{padding:12,borderBottom:"1px solid #3a3022"}}>{emp.has_attendance_code?"تم إعداد الكود":"غير مُعد"}</td>
              <td style={{padding:12,borderBottom:"1px solid #3a3022",whiteSpace:"nowrap"}}><button onClick={()=>{edit(emp);window.scrollTo({top:0,behavior:"smooth"});}} style={{marginLeft:8}}>تعديل البيانات / الكود</button><button onClick={()=>toggleStatus(emp)}>{emp.employment_status==="active"?"إيقاف":"تفعيل"}</button></td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </div>
  </main>;
}
