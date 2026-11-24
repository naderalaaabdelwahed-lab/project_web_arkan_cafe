"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const TYPE_LABELS = {
  kitchen: "المطبخ",
  bar: "البار",
  cashier: "الكاشير",
  custom: "طابعة إضافية",
};

const CONNECTION_LABELS = {
  usb: "USB",
  network: "شبكة (IP)",
  system: "طابعة النظام",
};

const initialForm = {
  name: "",
  printer_type: "custom",
  connection_type: "usb",
  ip_address: "",
  port: "9100",
  paper_width_mm: "80",
  is_active: false,
  notes: "",
};

const inputStyle = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: 8,
  border: "1px solid #D8CFC1",
  background: "#FFFFFF",
  color: "#29251F",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  color: "#29251F",
  marginBottom: 7,
  fontSize: 14,
};

export default function PrintersSettingsPage() {
  const [printers, setPrinters] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function initialize() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) throw new Error("يجب تسجيل الدخول أولاً.");

        const { data: admin, error: adminError } = await supabase.rpc("is_admin");
        if (adminError) throw adminError;
        if (admin === true) {
          setAllowed(true);
          return;
        }

        const { data: employee, error: employeeError } = await supabase
          .from("employee_profiles")
          .select("is_active")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (employeeError) throw employeeError;
        if (!employee?.is_active) throw new Error("حساب الموظف غير نشط.");

        const { data: permissions, error: permissionsError } = await supabase
          .from("employee_permissions")
          .select("permission_key")
          .eq("user_id", session.user.id);
        if (permissionsError) throw permissionsError;
        if (!(permissions || []).some((item) => item.permission_key === "menu.update")) {
          throw new Error("ليس لديك صلاحية إدارة إعدادات الطابعات.");
        }
        setAllowed(true);
      } catch (err) {
        setError(err.message || "تعذر التحقق من الصلاحيات.");
        setLoading(false);
      }
    }
    initialize();
  }, []);

  useEffect(() => {
    if (allowed) loadPrinters();
  }, [allowed]);

  async function loadPrinters() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("printers")
      .select("*")
      .order("id");
    if (loadError) setError(loadError.message);
    else setPrinters(data || []);
    setLoading(false);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(initialForm);
  }

  function openNewForm() {
    setEditingId(null);
    setForm(initialForm);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(printer) {
    setEditingId(printer.id);
    setForm({
      name: printer.name || "",
      printer_type: printer.printer_type || "custom",
      connection_type: printer.connection_type || "usb",
      ip_address: printer.ip_address || "",
      port: printer.port ? String(printer.port) : "",
      paper_width_mm: String(printer.paper_width_mm || 80),
      is_active: Boolean(printer.is_active),
      notes: printer.notes || "",
    });
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  async function savePrinter(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("اكتب اسم الطابعة.");
      return;
    }
    if (form.connection_type === "network" && !form.ip_address.trim()) {
      setError("اكتب عنوان IP الخاص بالطابعة.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      name: form.name.trim(),
      printer_type: form.printer_type,
      connection_type: form.connection_type,
      ip_address: form.connection_type === "network" ? form.ip_address.trim() : null,
      port: form.connection_type === "network" && form.port ? Number(form.port) : null,
      paper_width_mm: Number(form.paper_width_mm),
      is_active: Boolean(form.is_active),
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      const result = editingId
        ? await supabase.from("printers").update(payload).eq("id", editingId)
        : await supabase.from("printers").insert([{ ...payload, printer_key: `custom-${Date.now()}` }]);
      if (result.error) throw result.error;
      closeForm();
      setSuccess("تم حفظ إعدادات الطابعة.");
      await loadPrinters();
    } catch (err) {
      setError(err.message || "تعذر حفظ الطابعة.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePrinter(printer) {
    setError("");
    const { error: updateError } = await supabase
      .from("printers")
      .update({ is_active: !printer.is_active, updated_at: new Date().toISOString() })
      .eq("id", printer.id);
    if (updateError) setError(updateError.message);
    else await loadPrinters();
  }

  async function deletePrinter(printer) {
    if (printer.printer_key.startsWith("default-")) {
      setError("الطابعات الأساسية لا تُحذف؛ تقدر توقفها أو تعدّل إعداداتها.");
      return;
    }
    if (!window.confirm(`حذف "${printer.name}"؟ المنتجات المرتبطة بها ستصبح بدون طابعة.`)) return;
    const { error: deleteError } = await supabase.from("printers").delete().eq("id", printer.id);
    if (deleteError) {
      setError(deleteError.code === "23503"
        ? "لا يمكن حذف الطابعة لأنها مرتبطة بمنتجات أو طلبات سابقة. أعد تعيين المنتجات أو أوقف الطابعة بدل حذفها."
        : deleteError.message);
    } else {
      setSuccess("تم حذف الطابعة.");
      await loadPrinters();
    }
  }

  if (!allowed && !loading) {
    return <main dir="rtl" style={{ minHeight: "100vh", background: "#F6F4F0", color: "#29251F", padding: 30 }}><div style={{ maxWidth: 900, margin: "auto", background: "#FFFFFF", border: "1px solid #E8E0D4", borderRadius: 12, padding: 24 }}>{error || "ليس لديك صلاحية الدخول."}</div></main>;
  }

  return (
    <main dir="rtl" style={{ minHeight: "100vh", background: "#F6F4F0", color: "#29251F", padding: "30px clamp(16px, 3vw, 34px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 28 }}>
          <div>
            <span style={{ color: "#79552E", letterSpacing: 2, fontSize: 12 }}>ARKAN MANAGEMENT</span>
            <h1 style={{ margin: "8px 0", color: "#79552E", fontSize: 28 }}>إعدادات الطابعات</h1>
            <p style={{ color: "#62594F", margin: 0 }}>حدد الطابعات ومكان اتصالها قبل تشغيل الطباعة</p>
          </div>
          <button type="button" onClick={openNewForm} style={{ background: "#91672F", color: "#FFFFFF", border: 0, borderRadius: 8, padding: "12px 18px", fontWeight: 700, cursor: "pointer" }}>＋ إضافة طابعة</button>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 22 }}>
          {[
            ["إجمالي الطابعات", printers.length],
            ["مفعّلة", printers.filter((item) => item.is_active).length],
            ["بانتظار التوصيل", printers.filter((item) => !item.is_active).length],
          ].map(([label, value]) => <div key={label} style={{ background: "#FFFFFF", border: "1px solid #E8E0D4", borderRadius: 12, padding: 18 }}><span style={{ color: "#62594F", display: "block", marginBottom: 8 }}>{label}</span><strong style={{ color: "#79552E", fontSize: 25 }}>{value}</strong></div>)}
        </div>

        {error && <div role="alert" style={{ background: "#FBE9E7", color: "#96352E", padding: 13, borderRadius: 8, marginBottom: 14 }}>{error}</div>}
        {success && <div role="status" style={{ background: "#E6F2E8", color: "#27613B", padding: 13, borderRadius: 8, marginBottom: 14 }}>{success}</div>}

        {loading ? <p style={{ color: "#62594F" }}>جاري تحميل الطابعات...</p> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {printers.map((printer) => (
              <article key={printer.id} style={{ background: "#FFFFFF", border: "1px solid #E8E0D4", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div><span style={{ color: "#79552E", fontSize: 12 }}>{TYPE_LABELS[printer.printer_type] || TYPE_LABELS.custom}</span><h2 style={{ margin: "7px 0", fontSize: 19 }}>{printer.name}</h2></div>
                  <span style={{ color: printer.is_active ? "#27613B" : "#79552E", background: printer.is_active ? "#E6F2E8" : "#F1E9DC", padding: "5px 9px", borderRadius: 20, fontSize: 12 }}>{printer.is_active ? "مفعّلة" : "غير مفعّلة"}</span>
                </div>
                <div style={{ color: "#62594F", fontSize: 13, lineHeight: 1.9, margin: "12px 0" }}>
                  <div>الاتصال: {CONNECTION_LABELS[printer.connection_type]}</div>
                  {printer.connection_type === "network" && <div>العنوان: {printer.ip_address || "غير محدد"}{printer.port ? `:${printer.port}` : ""}</div>}
                  <div>عرض الورق: {printer.paper_width_mm} مم</div>
                  {printer.notes && <div>ملاحظات: {printer.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => openEditForm(printer)} style={{ background: "#F1E9DC", color: "#51483E", border: 0, borderRadius: 7, padding: "9px 13px", cursor: "pointer" }}>تعديل الإعدادات</button>
                  <button type="button" onClick={() => togglePrinter(printer)} style={{ background: printer.is_active ? "#FBE9E7" : "#E6F2E8", color: printer.is_active ? "#96352E" : "#27613B", border: 0, borderRadius: 7, padding: "9px 13px", cursor: "pointer" }}>{printer.is_active ? "إيقاف" : "تفعيل"}</button>
                  {!printer.printer_key.startsWith("default-") && <button type="button" onClick={() => deletePrinter(printer)} style={{ background: "#A83D35", color: "#FFFFFF", border: 0, borderRadius: 7, padding: "9px 13px", cursor: "pointer" }}>حذف</button>}
                </div>
              </article>
            ))}
          </div>
        )}

        {showForm && (
          <div onClick={closeForm} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(41,37,31,.48)", display: "grid", placeItems: "center", padding: 16 }}>
            <form onSubmit={savePrinter} onClick={(event) => event.stopPropagation()} style={{ width: "min(650px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#FFFFFF", border: "1px solid #E8E0D4", borderRadius: 14, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h2 style={{ color: "#79552E", margin: 0 }}>{editingId ? "تعديل الطابعة" : "إضافة طابعة جديدة"}</h2><button type="button" onClick={closeForm} style={{ background: "#F1E9DC", color: "#51483E", border: 0, borderRadius: 7, padding: "6px 11px", cursor: "pointer" }}>×</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
                <div><label style={labelStyle}>اسم الطابعة</label><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: طابعة الفطير" required /></div>
                <div><label style={labelStyle}>نوع الطابعة</label><select style={inputStyle} disabled={Boolean(editingId && printers.find((item) => item.id === editingId)?.printer_key.startsWith("default-"))} value={form.printer_type} onChange={(e) => setForm({ ...form, printer_type: e.target.value })}><option value="kitchen">المطبخ</option><option value="bar">البار</option><option value="cashier">الكاشير</option><option value="custom">طابعة إضافية</option></select></div>
                <div><label style={labelStyle}>طريقة الاتصال</label><select style={inputStyle} value={form.connection_type} onChange={(e) => setForm({ ...form, connection_type: e.target.value })}><option value="usb">USB</option><option value="network">شبكة (IP)</option><option value="system">طابعة النظام</option></select></div>
                {form.connection_type === "network" && <><div><label style={labelStyle}>IP Address</label><input style={inputStyle} value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.100" required /></div><div><label style={labelStyle}>Port</label><input style={inputStyle} type="number" min="1" max="65535" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div></>}
                <div><label style={labelStyle}>عرض الورق</label><select style={inputStyle} value={form.paper_width_mm} onChange={(e) => setForm({ ...form, paper_width_mm: e.target.value })}><option value="58">58 مم</option><option value="80">80 مم</option></select></div>
                <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>ملاحظات</label><textarea style={{ ...inputStyle, minHeight: 75, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="أي تفاصيل إضافية..." /></div>
                <label style={{ display: "flex", alignItems: "center", gap: 9, color: "#29251F" }}><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> الطابعة متوصلة وجاهزة للاستخدام</label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}><button type="button" onClick={closeForm} disabled={saving} style={{ background: "#F1E9DC", color: "#51483E", border: 0, borderRadius: 8, padding: "11px 17px", cursor: "pointer" }}>إلغاء</button><button type="submit" disabled={saving} style={{ background: "#91672F", color: "#FFFFFF", border: 0, borderRadius: 8, padding: "11px 18px", fontWeight: 700, cursor: "pointer" }}>{saving ? "جاري الحفظ..." : "حفظ الطابعة"}</button></div>
            </form>
          </div>
        )}
        <p style={{ color: "#62594F", fontSize: 12, marginTop: 24, lineHeight: 1.8 }}>ملاحظة: حفظ بيانات الطابعة وتوزيع المنتجات عليها لا يعني بدء الطباعة الفعلية تلقائيًا؛ تشغيل الطباعة المباشرة يحتاج توصيل الطابعة وإعداد خدمة الطباعة على جهاز الكاشير.</p>
      </div>
    </main>
  );
}
