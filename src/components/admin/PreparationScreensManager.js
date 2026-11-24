"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const emptyForm = { id: null, name: "", slug: "", station_type: "kitchen", category_ids: [], is_active: true, display_order: 0 };

export default function PreparationScreensManager() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screens, setScreens] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    const [{ data: screenRows, error: screenError }, { data: categoryRows, error: categoryError }] = await Promise.all([
      supabase.from("preparation_screens").select("id,name,slug,station_type,is_active,display_order,preparation_screen_categories(category_id)").order("display_order").order("id"),
      supabase.from("categories").select("id,name,department,is_active").eq("is_active", true).order("display_order").order("name"),
    ]);
    if (screenError) throw screenError;
    if (categoryError) throw categoryError;
    setScreens((screenRows || []).map((screen) => ({
      ...screen,
      category_ids: (screen.preparation_screen_categories || []).map((row) => row.category_id),\n      category_names: (screen.preparation_screen_categories || []).map((row) => categoryRows.find((category) => category.id === row.category_id)?.name || "قسم غير متاح"),
    })));
    setCategories(categoryRows || []);
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        const [{ data: admin, error: adminError }, { data: canUpdate, error: permissionError }] = await Promise.all([
          supabase.rpc("is_admin"),
          supabase.rpc("has_permission", { requested_permission: "menu.update" }),
        ]);
        if (adminError) throw adminError;
        if (permissionError) throw permissionError;
        const canManage = Boolean(admin || canUpdate);
        setAllowed(canManage);
        if (canManage) await loadData();
      } catch (loadError) {
        setError(loadError.message || "تعذر تحميل إعدادات الشاشات.");
      } finally {
        setLoading(false);
      }
    }
    initialize();
  }, [loadData]);

  function startNew(stationType = "kitchen") {
    setForm({ ...emptyForm, station_type: stationType });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function editScreen(screen) {
    setForm({
      id: screen.id,
      name: screen.name,
      slug: screen.slug,
      station_type: screen.station_type,
      category_ids: screen.category_ids,
      is_active: screen.is_active,
      display_order: screen.display_order || 0,
    });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function toggleCategory(categoryId) {
    setForm((current) => ({
      ...current,
      category_ids: current.category_ids.includes(categoryId)
        ? current.category_ids.filter((id) => id !== categoryId)
        : [...current.category_ids, categoryId],
    }));
  }

  async function saveScreen(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const slug = (form.slug || "").trim().toLowerCase() || `screen-${Date.now().toString(36)}`;
      const { error: saveError } = await supabase.rpc("save_preparation_screen", {
        p_id: form.id,
        p_name: form.name.trim(),
        p_slug: slug,
        p_station_type: form.station_type,
        p_category_ids: form.category_ids,
        p_is_active: form.is_active,
        p_display_order: Number(form.display_order) || 0,
      });
      if (saveError) throw saveError;
      await loadData();
      setShowForm(false);
      setForm(emptyForm);
      setMessage("تم حفظ الشاشة وربط الأقسام بنجاح.");
    } catch (saveError) {
      setError(saveError.message || "تعذر حفظ الشاشة.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteScreen(screen) {
    if (!window.confirm(`متأكد إنك عايز تحذف شاشة "${screen.name}"؟`)) return;
    setError("");
    setMessage("");
    const { error: deleteError } = await supabase.from("preparation_screens").delete().eq("id", screen.id);
    if (deleteError) {
      setError(deleteError.message || "تعذر حذف الشاشة.");
      return;
    }
    await loadData();
    setMessage("تم حذف الشاشة. الأقسام والمنتجات والطلبات لم يتم حذفها.");
  }

  const filteredCategories = categories.filter((category) => category.department === form.station_type);

  if (loading) return <main dir="rtl" style={styles.page}>جاري تحميل إعدادات الشاشات...</main>;
  if (!allowed) return <main dir="rtl" style={styles.page}><h1>إدارة شاشات التجهيز</h1><p>ليس لديك صلاحية إدارة الشاشات.</p></main>;

  return (
    <main dir="rtl" style={styles.page}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>ARKAN POS · DISPLAY ROUTING</span>
          <h1 style={styles.title}>إدارة شاشات المطبخ والبار</h1>
          <p style={styles.subtitle}>أضف أي عدد من الشاشات، واربط كل شاشة بالأقسام اللي المفروض تظهر عليها.</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={() => startNew()}>＋ إضافة شاشة</button>
      </header>

      {error && <p role="alert" style={styles.error}>{error}</p>}
      {message && <p role="status" style={styles.success}>{message}</p>}

      {showForm && (
        <form onSubmit={saveScreen} style={styles.form}>
          <div style={styles.formHeader}>
            <h2>{form.id ? "تعديل الشاشة" : "إضافة شاشة جديدة"}</h2>
            <button type="button" style={styles.closeButton} onClick={() => setShowForm(false)}>إغلاق</button>
          </div>
          <div style={styles.fields}>
            <label style={styles.field}>اسم الشاشة
              <input required value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="مثال: شاشة الفطير" style={styles.input} />
            </label>
            <label style={styles.field}>جزء الشاشة
              <select value={form.station_type} onChange={(e) => setForm((v) => ({ ...v, station_type: e.target.value, category_ids: [] }))} style={styles.input}>
                <option value="kitchen">المطبخ</option>
                <option value="bar">البار</option>
              </select>
            </label>
            <label style={styles.field}>اسم الرابط (بالإنجليزي)
              <input value={form.slug} onChange={(e) => setForm((v) => ({ ...v, slug: e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase() }))} placeholder="مثال: feteer" style={styles.input} />
              <small style={styles.hint}>الرابط هيكون: /preparation/{form.slug || "screen-id"}</small>
            </label>
            <label style={styles.field}>ترتيب الشاشة
              <input type="number" value={form.display_order} onChange={(e) => setForm((v) => ({ ...v, display_order: e.target.value }))} style={styles.input} />
            </label>
          </div>
          <div style={styles.categoryHeader}>
            <strong>الأقسام اللي هتظهر على الشاشة</strong>
            <span>{form.category_ids.length} قسم محدد</span>
          </div>
          <div style={styles.categoryGrid}>
            {filteredCategories.map((category) => (
              <label key={category.id} style={{ ...styles.categoryOption, ...(form.category_ids.includes(category.id) ? styles.categorySelected : {}) }}>
                <input type="checkbox" checked={form.category_ids.includes(category.id)} onChange={() => toggleCategory(category.id)} />
                {category.name}
              </label>
            ))}
            {filteredCategories.length === 0 && <p style={styles.hint}>مفيش أقسام نشطة في الجزء ده. أضف الأقسام من إدارة المنيو الأول.</p>}
          </div>
          <label style={styles.activeOption}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((v) => ({ ...v, is_active: e.target.checked }))} />
            الشاشة مفعّلة
          </label>
          <div style={styles.actions}>
            <button disabled={saving || !form.name.trim() || form.category_ids.length === 0} style={styles.primaryButton} type="submit">{saving ? "جاري الحفظ..." : "حفظ الشاشة"}</button>
            <button type="button" style={styles.secondaryButton} onClick={() => setShowForm(false)}>إلغاء</button>
          </div>
        </form>
      )}

      <section style={styles.section}>
        <h2>شاشات المطبخ</h2>
        <div style={styles.grid}>
          {screens.filter((screen) => screen.station_type === "kitchen").map((screen) => <ScreenCard key={screen.id} screen={screen} onEdit={editScreen} onDelete={deleteScreen} />)}
          {screens.every((screen) => screen.station_type !== "kitchen") && <p style={styles.empty}>لسه مفيش شاشات للمطبخ.</p>}
        </div>
        <button type="button" style={styles.addButton} onClick={() => startNew("kitchen")}>＋ إضافة شاشة للمطبخ</button>
      </section>

      <section style={styles.section}>
        <h2>شاشات البار</h2>
        <div style={styles.grid}>
          {screens.filter((screen) => screen.station_type === "bar").map((screen) => <ScreenCard key={screen.id} screen={screen} onEdit={editScreen} onDelete={deleteScreen} />)}
          {screens.every((screen) => screen.station_type !== "bar") && <p style={styles.empty}>لسه مفيش شاشات للبار.</p>}
        </div>
        <button type="button" style={styles.addButton} onClick={() => startNew("bar")}>＋ إضافة شاشة للبار</button>
      </section>
    </main>
  );
}

function ScreenCard({ screen, onEdit, onDelete }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/preparation/${screen.slug}` : `/preparation/${screen.slug}`;
  return (
    <article style={styles.card}>
      <div style={styles.cardTop}>
        <div>
          <strong style={styles.cardName}>{screen.name}</strong>
          <span style={{ ...styles.status, ...(screen.is_active ? styles.active : styles.inactive) }}>{screen.is_active ? "مفعّلة" : "متوقفة"}</span>
        </div>
        <span style={styles.count}>{screen.category_ids.length} أقسام</span>
      </div>
      <p style={styles.link}>{url}</p>
      <div style={styles.tags}>
        {(screen.category_names || []).map((name, index) => <span key={`${screen.id}-${index}`} style={styles.tag}>{name}</span>)}
      </div>
      <div style={styles.cardActions}>
        <a href={url} target="_blank" rel="noreferrer" style={styles.openLink}>فتح الشاشة ↗</a>
        <button type="button" style={styles.textButton} onClick={() => onEdit(screen)}>تعديل</button>
        <button type="button" style={styles.deleteButton} onClick={() => onDelete(screen)}>حذف</button>
      </div>
    </article>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: 28, background: "#f6f4f0", color: "#20252a" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 24 },
  eyebrow: { color: "#a7793d", fontSize: 12, fontWeight: 800, letterSpacing: 2 },
  title: { margin: "8px 0", fontSize: 28 },
  subtitle: { margin: 0, color: "#68727a" },
  primaryButton: { border: 0, borderRadius: 9, padding: "12px 18px", background: "#b88946", color: "#fff", fontWeight: 800, cursor: "pointer" },
  secondaryButton: { border: "1px solid #c9c1b7", borderRadius: 9, padding: "12px 18px", background: "#fff", color: "#303840", cursor: "pointer" },
  form: { padding: 22, marginBottom: 26, background: "#fff", border: "1px solid #e8e1d7", borderRadius: 14, maxWidth: 1000 },
  formHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  closeButton: { border: 0, background: "transparent", color: "#8b6332", cursor: "pointer" },
  fields: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, margin: "18px 0" },
  field: { display: "grid", gap: 7, fontWeight: 700, fontSize: 14 },
  input: { width: "100%", padding: 11, border: "1px solid #d8d1c8", borderRadius: 8, background: "#fff", color: "#20252a" },
  hint: { color: "#7c858c", fontSize: 12, fontWeight: 400 },
  categoryHeader: { display: "flex", justifyContent: "space-between", marginBottom: 12 },
  categoryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9 },
  categoryOption: { display: "flex", alignItems: "center", gap: 9, padding: 12, border: "1px solid #e4ddd3", borderRadius: 9, cursor: "pointer" },
  categorySelected: { borderColor: "#b88946", background: "#fbf5eb" },
  activeOption: { display: "flex", gap: 8, alignItems: "center", marginTop: 18 },
  actions: { display: "flex", gap: 10, marginTop: 20 },
  section: { marginTop: 28 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14, marginTop: 12 },
  card: { padding: 17, background: "#fff", border: "1px solid #e8e1d7", borderRadius: 12 },
  cardTop: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  cardName: { display: "block", fontSize: 18 },
  status: { display: "inline-block", marginTop: 7, fontSize: 12, fontWeight: 700 },
  active: { color: "#287447" },
  inactive: { color: "#a12c2c" },
  count: { color: "#68727a", fontSize: 13 },
  link: { direction: "ltr", textAlign: "left", color: "#8b6332", overflowWrap: "anywhere", fontSize: 13 },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, minHeight: 24 },
  tag: { padding: "4px 8px", borderRadius: 20, background: "#f2eee8", color: "#4c5358", fontSize: 12 },
  cardActions: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 16 },
  openLink: { color: "#8b6332", fontWeight: 800, textDecoration: "none" },
  textButton: { border: 0, background: "transparent", color: "#303840", cursor: "pointer" },
  deleteButton: { border: 0, background: "transparent", color: "#a12c2c", cursor: "pointer" },
  addButton: { marginTop: 12, padding: "10px 14px", border: "1px dashed #b88946", borderRadius: 9, background: "transparent", color: "#8b6332", cursor: "pointer" },
  empty: { color: "#7c858c" },
  error: { color: "#a12c2c", padding: 10, background: "#fff0f0", borderRadius: 8 },
  success: { color: "#246c45", padding: 10, background: "#edf8f0", borderRadius: 8 },
};
