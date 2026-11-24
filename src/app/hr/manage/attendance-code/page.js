"use client";
import { useEffect, useState } from "react";

export default function AttendanceCodePage() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState(null);
  const [action, setAction] = useState("check_in");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [needsSkip, setNeedsSkip] = useState(false);

  async function loadEmployees() {
    setLoading(true);
    try {
      const response = await fetch("/api/hr/attendance-code", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الموظفين.");
      setEmployees(data.employees || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function loadEmployeeStatus(id) {
    setEmployeeStatus(null);
    if (!id) return;
    try {
      const response = await fetch("/api/hr/attendance-code?employee_id=" + encodeURIComponent(id), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل آخر حركة.");
      setEmployeeStatus(data);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { loadEmployeeStatus(employeeId); }, [employeeId]);

  async function submit(actionToSend = action) {
    if (!employeeId) { setError("اختار الموظف أولاً."); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/hr/attendance-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionToSend, employee_id: employeeId, code })
      });
      const data = await response.json();
      if (!response.ok) {
        setNeedsSkip(Boolean(data.needs_skip));
        throw new Error(data.error || "تعذر تسجيل العملية.");
      }
      setResult(data);
      setNeedsSkip(false);
      setCode("");
      await loadEmployeeStatus(employeeId);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const fmt = value => value ? new Date(value).toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short"
  }) : "—";
  const last = employeeStatus?.last_movement;
  const lastLabel = last?.action === "check_in" ? "حضور" : last?.action === "check_out" ? "انصراف" : "لا توجد حركات مسجلة";
  const selectedEmployee = employees.find(x => x.id === employeeId);

  return <main className="hr-content hr-attendance-terminal" dir="rtl">
    <header className="hr-page-heading">
      <span className="hr-attendance-eyebrow">ARKAN · HUMAN RESOURCES</span>
      <h1>تسجيل الحضور والانصراف</h1>
      <p>اختار اسم الموظف، وراجع آخر حركة مسجلة قبل تنفيذ العملية.</p>
    </header>
    <section className="hr-panel hr-attendance-card">
      <div className="hr-attendance-form">
        <label htmlFor="attendance-employee">اسم الموظف</label>
        <select id="attendance-employee" className="hr-field" value={employeeId}
          onChange={e => { setEmployeeId(e.target.value); setError(""); setResult(null); setNeedsSkip(false); setCode(""); }}>
          <option value="">{loading ? "جارٍ تحميل الموظفين..." : "اختار الموظف من القائمة"}</option>
          {employees.map(employee => <option key={employee.id} value={employee.id}>
            {employee.full_name}{employee.job_title ? " — " + employee.job_title : ""}
          </option>)}
        </select>
      </div>

      {employeeId && <div className="hr-stat-grid" style={{ marginTop: 18 }}>
        <div className="hr-stat"><span>آخر حركة مسجلة</span><strong>{lastLabel}</strong></div>
        <div className="hr-stat"><span>وقت آخر حركة</span><strong style={{ fontSize: 15 }}>{fmt(last?.recorded_at)}</strong></div>
        <div className="hr-stat"><span>تاريخ الشيفت</span><strong>{last?.shift_date || "—"}</strong></div>
      </div>}

      {employeeStatus?.open_previous_shift && <div className="hr-alert" style={{ marginTop: 16 }}>
        يوجد حضور مفتوح من يوم {employeeStatus.open_previous_shift.shift_date} بدون تسجيل انصراف.
        <div>وقت الحضور: {fmt(employeeStatus.open_previous_shift.check_in_at)}</div>
        <div>لو الموظف بدأ يوم عمل جديد، اختار «تسجيل حضور» ثم استخدم زر التجاوز بعد التحقق من الكود.</div>
      </div>}

      <div className="hr-attendance-actions" style={{ marginTop: 20 }}>
        <button type="button" onClick={() => { setAction("check_in"); setError(""); setResult(null); setNeedsSkip(false); }}
          aria-pressed={action === "check_in"} className={action === "check_in" ? "selected" : ""}>
          <span aria-hidden="true">↘</span>تسجيل حضور
        </button>
        <button type="button" onClick={() => { setAction("check_out"); setError(""); setResult(null); setNeedsSkip(false); }}
          aria-pressed={action === "check_out"} className={action === "check_out" ? "selected" : ""}>
          <span aria-hidden="true">↗</span>تسجيل انصراف
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); submit(); }} className="hr-attendance-form">
        <label htmlFor="attendance-code">كود الموظف الشخصي (6 أرقام)</label>
        <input id="attendance-code" required type="password" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} minLength={6} value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" />
        <small>الكود للتأكد من هوية الموظف، ولا تشاركه مع أي شخص.</small>
        {error && <div role="alert" className="hr-alert">{error}</div>}
        {needsSkip && <button type="button" className="hr-action hr-attendance-submit" disabled={busy || code.length !== 6}
          onClick={() => submit("skip_previous")}>
          تجاوز انصراف اليوم السابق وتسجيل حضور اليوم
        </button>}
        {result && <div role="status" className="hr-success">
          <strong>تم تسجيل {result.action === "check_in" ? "الحضور" : "الانصراف"} بنجاح ✓</strong>
          <div>الموظف: {result.employee_name}</div>
          <div>الوقت: {fmt(result.recorded_at)}</div>
          {result.skipped_previous_checkout && <div>تم تجاوز انصراف يوم {result.previous_shift_date} دون إنشاء انصراف وهمي، وبدأ سجل حضور اليوم الجديد.</div>}
        </div>}
        <button className="hr-action hr-attendance-submit" disabled={busy || !employeeId || code.length !== 6} type="submit">
          {busy ? "جارٍ تسجيل العملية..." : "تأكيد التسجيل"}
        </button>
      </form>
      <p className="hr-attendance-note">يتم حفظ الوقت بتوقيت القاهرة. الانصراف من 12:00 صباحًا حتى 3:59 صباحًا يُسجل على تاريخ الشيفت السابق.</p>
    </section>
  </main>;
}
