"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const field = { width: "100%", padding: "11px 12px", borderRadius: 9, border: "1px solid #425466", background: "#17232e", color: "#f8fafc", boxSizing: "border-box" };
const label = { display: "grid", gap: 6, color: "#dbe4ec", fontSize: 14 };
const panel = { background: "#1c2935", border: "1px solid #3b4d5c", borderRadius: 14, padding: 20 };
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

export default function HrShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({ name: "", start_time: "07:00", end_time: "17:00", break_minutes: "0", grace_minutes: "10", is_flexible: false, latest_check_in: "12:00" });
  const [assignment, setAssignment] = useState({ employee_id: "", shift_id: "", effective_from: today, effective_to: "", weekday: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function call(url, options = {}) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("سجل دخول المدير أولاً.");
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: "Bearer " + token }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "حدث خطأ.");
    return result;
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await call("/api/admin/hr/shifts");
      setShifts(result.shifts || []); setEmployees(result.employees || []); setAssignments(result.assignments || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overnight = form.start_time && form.end_time && form.end_time < form.start_time;
  const shiftMinutes = form.start_time && form.end_time ? ((Number(form.end_time.slice(0,2))*60+Number(form.end_time.slice(3,5)))-(Number(form.start_time.slice(0,2))*60+Number(form.start_time.slice(3,5)))+(overnight?1440:0)-Number(form.break_minutes||0)) : 0;
  const durationLabel = shiftMinutes > 0 ? `${Math.floor(shiftMinutes/60)} ساعة${shiftMinutes%60 ? ` و${shiftMinutes%60} دقيقة` : ""}` : "—";

  async function createShift(e) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      await call("/api/admin/hr/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setMessage("تم إنشاء الشيفت بنجاح."); setForm({ ...form, name: "" }); await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function assignShift(e) {
    e.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      await call("/api/admin/hr/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...assignment, action: "assign" }) });
      setMessage("تم ربط الشيفت بالموظف."); await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function editShift(shift) {
    const name = window.prompt("اسم الشيفت", shift.name); if (name === null) return;
    const start_time = window.prompt("وقت البداية (HH:MM)", time(shift.start_time)); if (start_time === null) return;
    const end_time = window.prompt("وقت النهاية (HH:MM)", time(shift.end_time)); if (end_time === null) return;
    const break_minutes = window.prompt("مدة الراحة بالدقائق", String(shift.break_minutes)); if (break_minutes === null) return;
    const grace_minutes = window.prompt("مهلة السماح بالدقائق", String(shift.grace_minutes)); if (grace_minutes === null) return;
    setSaving(true);
    try {
      await call("/api/admin/hr/shifts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: shift.id, action: "update", name, start_time, end_time, break_minutes: Number(break_minutes), grace_minutes: Number(grace_minutes), is_flexible: shift.is_flexible, latest_check_in: shift.latest_check_in }) });
      setMessage("تم تعديل الشيفت."); await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function toggle(shift) {
    try {
      await call("/api/admin/hr/shifts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: shift.id, is_active: !shift.is_active }) });
      await load();
    } catch (e) { setError(e.message); }
  }

  const shiftName = (id) => shifts.find((s) => s.id === id)?.name || "شيفت غير موجود";
  const employeeName = (id) => employees.find((e) => e.id === id)?.full_name || "موظف غير موجود";
  const time = (value) => String(value || "").slice(0, 5);
  const durationOf = (s) => { const a=Number(String(s.start_time).slice(0,2))*60+Number(String(s.start_time).slice(3,5)); const b=Number(String(s.end_time).slice(0,2))*60+Number(String(s.end_time).slice(3,5)); const n=Math.max(0,b-a+(s.crosses_midnight?1440:0)-Number(s.break_minutes||0)); return `${Math.floor(n/60)}س ${n%60}د`; };

  return <main dir="rtl" style={{ minHeight: "100vh", background: "#101820", color: "#f8fafc", padding: "28px 18px" }}>
    <div style={{ maxWidth: 1150, margin: "0 auto", display: "grid", gap: 22 }}>
      <header><h1 style={{ fontSize: 28, margin: "0 0 8px" }}>إدارة الشيفتات</h1><p style={{ color: "#aebdca", margin: 0 }}>حدد مواعيد العمل بحرية، بما فيها الشيفتات التي تنتهي بعد منتصف الليل، ثم اربط كل موظف بشيفته.</p></header>
      {error && <div role="alert" style={{ background: "#4a2024", padding: 12, borderRadius: 9 }}>{error}</div>}
      {message && <div role="status" style={{ background: "#183d30", padding: 12, borderRadius: 9 }}>{message}</div>}

      <form onSubmit={createShift} style={{ ...panel, display: "grid", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>إنشاء شيفت جديد</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
          <label style={label}>اسم الشيفت<input required maxLength={80} style={field} placeholder="مثلاً: شيفت المساء" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label style={label}>وقت البداية<input required type="time" style={field} value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></label>
          <label style={label}>وقت النهاية<input required type="time" style={field} value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></label>
          <label style={label}>مدة الراحة بالدقائق<input type="number" min="0" max="600" step="1" style={field} value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: e.target.value })} /></label>
          <label style={label}>مهلة السماح بالدقائق<input type="number" min="0" max="240" step="1" style={field} value={form.grace_minutes} onChange={e => setForm({ ...form, grace_minutes: e.target.value })} /></label>
          <label style={{...label,display:"flex",alignItems:"center",gap:9}}><input type="checkbox" checked={form.is_flexible} onChange={e=>setForm({...form,is_flexible:e.target.checked})}/> شيفت مرن (الموظف يكمل عدد الساعات)</label>
          {form.is_flexible && <label style={label}>آخر وقت مسموح للحضور<input required type="time" style={field} value={form.latest_check_in} onChange={e=>setForm({...form,latest_check_in:e.target.value})}/></label>}
        </div>
        <div style={{ color: overnight ? "#f3c66d" : "#aebdca", fontSize: 14 }}>{overnight ? "شيفت ليلي: النظام هيعتبر النهاية في اليوم التالي تلقائيًا." : "شيفت في نفس اليوم."} — مدة العمل المحسوبة: <b>{durationLabel}</b>{form.is_flexible ? ` — آخر حضور ${form.latest_check_in}` : ""}</div>
        <button disabled={saving} style={{ justifySelf: "start", background: "#d6a44d", color: "#101820", border: 0, borderRadius: 9, padding: "11px 22px", fontWeight: 700 }}>{saving ? "جارٍ الحفظ..." : "حفظ الشيفت"}</button>
      </form>

      <form onSubmit={assignShift} style={{ ...panel, display: "grid", gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>تحديد شيفت لموظف</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
          <label style={label}>الموظف<select required style={field} value={assignment.employee_id} onChange={e => setAssignment({ ...assignment, employee_id: e.target.value })}><option value="">اختار الموظف</option>{employees.filter(e => e.employment_status === "active").map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
          <label style={label}>الشيفت<select required style={field} value={assignment.shift_id} onChange={e => setAssignment({ ...assignment, shift_id: e.target.value })}><option value="">اختار الشيفت</option>{shifts.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name} ({time(s.start_time)} - {time(s.end_time)}{s.crosses_midnight ? " +1" : ""})</option>)}</select></label>
          <label style={label}>يبدأ التكليف من<input required type="date" style={field} value={assignment.effective_from} onChange={e => setAssignment({ ...assignment, effective_from: e.target.value })} /></label>
          <label style={label}>ينتهي التكليف (اختياري)<input type="date" style={field} value={assignment.effective_to} onChange={e => setAssignment({ ...assignment, effective_to: e.target.value })} /></label>
          <label style={label}>يوم محدد (اختياري)<select style={field} value={assignment.weekday} onChange={e => setAssignment({ ...assignment, weekday: e.target.value })}><option value="">كل الأيام</option>{["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((d,i)=><option key={i} value={i}>{d}</option>)}</select></label>
        </div>
        <p style={{ color: "#aebdca", margin: 0, fontSize: 13 }}>اختيار «كل الأيام» يطبق التكليف يوميًا خلال الفترة. ويمكنك إضافة أكثر من تكليف لنفس الموظف لأيام أو فترات مختلفة.</p>
        <button disabled={saving} style={{ justifySelf: "start", background: "#d6a44d", color: "#101820", border: 0, borderRadius: 9, padding: "11px 22px", fontWeight: 700 }}>{saving ? "جارٍ الحفظ..." : "ربط الشيفت بالموظف"}</button>
      </form>

      <section style={panel}>
        <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>الشيفتات ({shifts.length})</h2>
        {loading ? <p>جارٍ التحميل...</p> : shifts.length === 0 ? <p style={{ color: "#aebdca" }}>لم يتم إنشاء شيفتات بعد.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}><thead><tr>{["الاسم","من","إلى","المدة","الراحة","نوع الشيفت","الحالة",""].map(x => <th key={x} style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #425466", color: "#d6a44d" }}>{x}</th>)}</tr></thead><tbody>{shifts.map(s => <tr key={s.id}><td style={cell}>{s.name}</td><td style={cell}>{time(s.start_time)}</td><td style={cell}>{time(s.end_time)}{s.crosses_midnight ? " (اليوم التالي)" : ""}</td><td style={cell}>{durationOf(s)}</td><td style={cell}>{s.break_minutes} د</td><td style={cell}>{s.is_flexible ? `مرن حتى ${time(s.latest_check_in)}` : "ثابت"}</td><td style={cell}>{s.is_active ? "نشط" : "موقوف"}</td><td style={cell}><button onClick={() => editShift(s)} style={{marginLeft:6}}>تعديل</button><button onClick={() => toggle(s)}>{s.is_active ? "إيقاف" : "تفعيل"}</button></td></tr>)}</tbody></table></div>}
      </section>

      <section style={panel}>
        <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>تكليفات الموظفين ({assignments.length})</h2>
        {assignments.length === 0 ? <p style={{ color: "#aebdca" }}>لا توجد تكليفات حتى الآن.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}><thead><tr>{["الموظف","الشيفت","من تاريخ","إلى تاريخ","اليوم"].map(x => <th key={x} style={{ textAlign: "right", padding: 10, borderBottom: "1px solid #425466", color: "#d6a44d" }}>{x}</th>)}</tr></thead><tbody>{assignments.map(a => <tr key={a.id}><td style={cell}>{employeeName(a.employee_id)}</td><td style={cell}>{shiftName(a.shift_id)}</td><td style={cell}>{a.effective_from}</td><td style={cell}>{a.effective_to || "مستمر"}</td><td style={cell}>{a.weekday == null ? "كل الأيام" : ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][a.weekday]}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </main>;
}
const cell = { padding: 11, borderBottom: "1px solid #344657", textAlign: "right" };
