
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const emptyForm = {
  name: "",
  item_type: "raw",
  unit_id: "",
  min_stock: "0",
  unit_cost: "0",
  notes: "",
};

export default function InventoryItemsPage() {
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);

    const [itemsResult, unitsResult] = await Promise.all([
      supabase
        .from("inventory_items")
        .select(`
          id, name, item_type, sku, unit_id,
          current_stock, min_stock, unit_cost,
          is_active, notes, created_at,
          inventory_units (
            name, abbreviation
          )
        `)
        .order("id", { ascending: false }),

      supabase
        .from("inventory_units")
        .select("id, name, abbreviation")
        .order("id"),
    ]);

    if (itemsResult.error) {
      setMessage(itemsResult.error.message);
    } else {
      setItems(itemsResult.data || []);
    }

    if (unitsResult.error) {
      setMessage(unitsResult.error.message);
    } else {
      setUnits(unitsResult.data || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.sku || "").toLowerCase().includes(search.toLowerCase());

      const matchesType =
        typeFilter === "all" || item.item_type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [items, search, typeFilter]);

  function handleChange(e) {
    setForm((previous) => ({
      ...previous,
      [e.target.name]: e.target.value,
    }));
  }

  function openAddForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      unit_id: units[0]?.id?.toString() || "",
    });
    setMessage("");
    setShowForm(true);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      item_type: item.item_type,
      unit_id: String(item.unit_id),
      min_stock: String(item.min_stock),
      unit_cost: String(item.unit_cost),
      notes: item.notes || "",
    });
    setMessage("");
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (saving) return;

    if (!form.unit_id) {
      setMessage("اختار وحدة القياس");
      return;
    }

    if (!["raw", "finished"].includes(form.item_type)) {
      setMessage("نوع الصنف غير صحيح");
      return;
    }

    if (
      form.name.trim() === "" ||
      Number(form.min_stock) < 0 ||
      Number(form.unit_cost) < 0
    ) {
      setMessage("راجع اسم الصنف والحد الأدنى والتكلفة");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      p_name: form.name.trim(),
      p_item_type: form.item_type,
      p_unit_id: Number(form.unit_id),
      p_min_stock: Number(form.min_stock),
      p_unit_cost: Number(form.unit_cost),
      p_notes: form.notes.trim(),
    };

    const result = editingId
      ? await supabase.rpc("update_inventory_item", {
          p_id: editingId,
          ...payload,
        })
      : await supabase.rpc("create_inventory_item", {
          ...payload,
          p_sku: null,
        });

    setSaving(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage(
      editingId ? "تم تعديل الصنف بنجاح" : "تمت إضافة الصنف بنجاح"
    );

    setShowForm(false);
    setForm(emptyForm);
    setEditingId(null);

    await loadData();
  }

  async function toggleActive(item) {
    const result = await supabase.rpc("set_inventory_item_active", {
      p_id: item.id,
      p_is_active: !item.is_active,
    });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage("تم تحديث حالة الصنف");
    await loadData();
  }

  async function handleDelete(item) {
    if (deletingId !== null) return;

    const confirmed = window.confirm(
      `هل أنت متأكد من حذف "${item.name}"؟\n\nلن يمكن حذف الخامة إذا كان لها رصيد أو وصفة أو حركات مخزون سابقة.`
    );

    if (!confirmed) return;

    setDeletingId(item.id);
    setMessage("");

    const { error } = await supabase.rpc("delete_inventory_item", {
      p_id: item.id,
    });

    setDeletingId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(`تم حذف "${item.name}" بنجاح`);
    await loadData();
  }

  const stats = {
    total: items.length,
    active: items.filter((item) => item.is_active).length,
    low: items.filter(
      (item) =>
        item.is_active &&
        Number(item.current_stock) <= Number(item.min_stock)
    ).length,
  };

  const inputStyle = {
    width: "100%",
    padding: "12px",
    background: "#222",
    border: "1px solid #444",
    borderRadius: 8,
    color: "#fff",
    marginTop: 7,
  };

  const buttonStyle = {
    padding: "11px 18px",
    border: 0,
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: "bold",
  };

  return (
    <main dir="rtl">
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">ARKAN INVENTORY</span>
          <h1>الخامات والمنتجات</h1>
          <p>إدارة الأصناف ووحدات القياس ومتابعة الأرصدة.</p>
        </div>

        <button
          onClick={openAddForm}
          style={{
            ...buttonStyle,
            background: "#b88946",
            color: "#fff",
          }}
        >
          + إضافة صنف
        </button>
      </header>

      {message && (
        <div
          role="status"
          style={{
            padding: 14,
            margin: "15px 0",
            background: "#292929",
            borderRadius: 8,
            overflowWrap: "anywhere",
          }}
        >
          {message}
          <button
            onClick={() => setMessage("")}
            style={{
              float: "left",
              background: "transparent",
              color: "#fff",
              border: 0,
              cursor: "pointer",
            }}
          >
            إغلاق
          </button>
        </div>
      )}

      <section className="admin-stats">
        {[
          ["إجمالي الأصناف", stats.total],
          ["الأصناف النشطة", stats.active],
          ["تحتاج إعادة طلب", stats.low],
        ].map(([label, value]) => (
          <div className="admin-stat-card" key={label}>
            <p>{label}</p>
            <h2>{value}</h2>
          </div>
        ))}
      </section>

      {showForm && (
        <section
          className="admin-panel"
          style={{ marginTop: 25, padding: 24 }}
        >
          <h2>{editingId ? "تعديل الصنف" : "إضافة صنف جديد"}</h2>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: 16,
                marginTop: 20,
              }}
            >
              <label>
                اسم الصنف *
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                />
              </label>

              <label>
                نوع الصنف *
                <select
                  name="item_type"
                  value={form.item_type}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option value="raw">خامة</option>
                  <option value="finished">منتج جاهز</option>
                </select>
              </label>

              <label>
                وحدة القياس *
                <select
                  name="unit_id"
                  value={form.unit_id}
                  onChange={handleChange}
                  required
                  style={inputStyle}
                >
                  <option value="">اختر الوحدة</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.abbreviation})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                الحد الأدنى للمخزون
                <input
                  type="number"
                  name="min_stock"
                  min="0"
                  step="0.001"
                  value={form.min_stock}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </label>

              <label>
                تكلفة وحدة الأساس
                <input
                  type="number"
                  name="unit_cost"
                  min="0"
                  step="0.01"
                  value={form.unit_cost}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </label>

              <label style={{ gridColumn: "1 / -1" }}>
                ملاحظات
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  style={inputStyle}
                />
              </label>
            </div>

            <p style={{ color: "#d4ad72", marginTop: 15 }}>
              كود الصنف يتم إنشاؤه تلقائيًا بواسطة النظام.
              الرصيد الحالي يتم تغييره من خلال حركات المخزون فقط.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  ...buttonStyle,
                  background: "#b88946",
                  color: "#fff",
                }}
              >
                {saving ? "جارٍ الحفظ..." : "حفظ"}
              </button>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  ...buttonStyle,
                  background: "#444",
                  color: "#fff",
                }}
              >
                إلغاء
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="admin-panel" style={{ marginTop: 25, padding: 20 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <input
            placeholder="ابحث بالاسم أو الكود..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 200, margin: 0 }}
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", margin: 0 }}
          >
            <option value="all">كل الأصناف</option>
            <option value="raw">الخامات</option>
            <option value="finished">المنتجات الجاهزة</option>
          </select>
        </div>

        {loading ? (
          <p>جارٍ تحميل الأصناف...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    textAlign: "right",
                    borderBottom: "1px solid #444",
                  }}
                >
                  {[
                    "الصنف",
                    "النوع",
                    "الوحدة",
                    "الرصيد",
                    "الحد الأدنى",
                    "التكلفة",
                    "الحالة",
                    "الإجراءات",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{ padding: 12, whiteSpace: "nowrap" }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: "1px solid #333" }}
                  >
                    <td style={{ padding: 12 }}>
                      <strong>{item.name}</strong>
                      {item.sku && (
                        <small style={{ display: "block", color: "#888" }}>
                          {item.sku}
                        </small>
                      )}
                    </td>

                    <td>
                      {item.item_type === "raw" ? "خامة" : "منتج جاهز"}
                    </td>

                    <td>{item.inventory_units?.abbreviation || "—"}</td>

                    <td>
                      {Number(item.current_stock).toLocaleString("ar-EG")}
                    </td>

                    <td>
                      {Number(item.min_stock).toLocaleString("ar-EG")}
                    </td>

                    <td>
                      {Number(item.unit_cost).toLocaleString("ar-EG")}
                    </td>

                    <td>
                      {item.is_active ? "نشط" : "متوقف"}
                      {item.is_active &&
                        Number(item.current_stock) <=
                          Number(item.min_stock) && (
                          <small style={{ display: "block", color: "#e5a34c" }}>
                            مخزون منخفض
                          </small>
                        )}
                    </td>

                    <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => openEditForm(item)}
                        style={{
                          ...buttonStyle,
                          background: "#444",
                          color: "#fff",
                          marginLeft: 6,
                        }}
                      >
                        تعديل
                      </button>

                      <button
                        onClick={() => toggleActive(item)}
                        style={{
                          ...buttonStyle,
                          background: item.is_active ? "#713b35" : "#356b48",
                          color: "#fff",
                          marginLeft: 6,
                        }}
                      >
                        {item.is_active ? "تعطيل" : "تفعيل"}
                      </button>

                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deletingId !== null}
                        style={{
                          ...buttonStyle,
                          background: "#a83232",
                          color: "#fff",
                          opacity: deletingId !== null ? 0.6 : 1,
                          cursor: deletingId !== null ? "not-allowed" : "pointer",
                        }}
                      >
                        {deletingId === item.id ? "جارٍ الحذف..." : "حذف"}
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 25, textAlign: "center" }}>
                      لا توجد أصناف مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
