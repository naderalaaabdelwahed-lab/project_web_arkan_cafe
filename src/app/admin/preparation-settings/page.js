"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function PreparationSettingsPage() {
  const [products, setProducts] = useState([]);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function initialize() {
      try {
        const [
          { data: admin, error: adminError },
          { data: canView, error: viewError },
          { data: canUpdate, error: updateError },
        ] = await Promise.all([
          supabase.rpc("is_admin"),
          supabase.rpc("has_permission", { requested_permission: "menu.view" }),
          supabase.rpc("has_permission", { requested_permission: "menu.update" }),
        ]);
        if (adminError) throw adminError;
        if (viewError) throw viewError;
        if (updateError) throw updateError;
        const canEdit = Boolean(admin || (canView && canUpdate));
        setAllowed(canEdit);
        if (!canEdit) return;

        const { data, error: productsError } = await supabase
          .from("products")
          .select("id, name, preparation_station, categories(name)")
          .order("name");
        if (productsError) throw productsError;
        setProducts(data || []);
      } catch (loadError) {
        setError(loadError.message || "تعذر تحميل إعدادات الأقسام.");
      } finally {
        setLoading(false);
      }
    }
    initialize();
  }, []);

  async function changeStation(product, station) {
    setSavingId(product.id);
    setError("");
    setMessage("");
    const { error: updateError } = await supabase
      .from("products")
      .update({ preparation_station: station })
      .eq("id", product.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, preparation_station: station } : item));
      setMessage(`تم تغيير قسم تجهيز "${product.name}" بنجاح. الطلبات الجديدة فقط ستتأثر.`);
    }
    setSavingId(null);
  }

  if (loading) return <main dir="rtl" style={styles.page}>جاري تحميل الإعدادات...</main>;
  if (!allowed) return <main dir="rtl" style={styles.page}><h1>توزيع المنتجات</h1><p>ليس لديك صلاحية تعديل المنيو.</p></main>;

  return (
    <main dir="rtl" style={styles.page}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>ARKAN POS SETTINGS</span>
          <h1>توزيع المنتجات على الأقسام</h1>
          <p>حدد كل منتج يروح للمطبخ ولا للبار. التغيير يطبق على الطلبات الجديدة فقط.</p>
        </div>
      </header>
      {error && <p style={styles.error}>{error}</p>}
      {message && <p style={styles.success}>{message}</p>}
      <section style={styles.list}>
        {products.map((product) => (
          <article key={product.id} style={styles.row}>
            <div>
              <strong>{product.name}</strong>
              <small>{product.categories?.name || "بدون قسم"}</small>
            </div>
            <select
              aria-label={`قسم تجهيز ${product.name}`}
              value={product.preparation_station || "kitchen"}
              disabled={savingId === product.id}
              onChange={(event) => changeStation(product, event.target.value)}
              style={styles.select}
            >
              <option value="kitchen">المطبخ</option>
              <option value="bar">البار</option>
            </select>
          </article>
        ))}
        {products.length === 0 && <p>لا توجد منتجات مسجلة.</p>}
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", padding: 28, background: "#f6f4f0", color: "#20252a" },
  header: { marginBottom: 22 },
  eyebrow: { color: "#a7793d", fontSize: 12, fontWeight: 800, letterSpacing: 2 },
  list: { display: "grid", gap: 10, maxWidth: 820 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 16, background: "#fff", border: "1px solid #e8e1d7", borderRadius: 12 },
  select: { minWidth: 150, padding: 10, border: "1px solid #c9c1b7", borderRadius: 8, background: "#fff" },
  error: { color: "#a12c2c" },
  success: { color: "#246c45" },
};
