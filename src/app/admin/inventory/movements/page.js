
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const typeLabels = {
  purchase: "إضافة مخزون",
  deduction: "خصم مخزون",
  adjustment: "تسوية مخزون",
  waste: "هالك",
  sale: "بيع",
  production_in: "إنتاج وارد",
  production_out: "صرف للإنتاج",
  return: "مرتجع",
  reversal: "عكس حركة",
};

const movementTypeOptions = [
  { value: "deduction", label: "خصم مخزون" },
  { value: "waste", label: "هالك" },
  { value: "adjustment", label: "تسوية مخزون" },
];

const fieldStyle = {
  width: "100%",
  minHeight: "44px",
  padding: "10px 12px",
  border: "1px solid #999999",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#000000",
  WebkitTextFillColor: "#000000",
  fontSize: "14px",
  boxSizing: "border-box",
};

const buttonStyle = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 600,
};

async function fetchAllRows(table, columns, filters = []) {
  const batchSize = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + batchSize - 1);

    filters.forEach(([method, column, value]) => {
      query = query[method](column, value);
    });

    const { data, error } = await query;

    if (error) throw error;

    allRows = allRows.concat(data || []);

    if (!data || data.length < batchSize) break;

    from += batchSize;
  }

  return allRows;
}

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSourceLabel(row) {
  if (row.source_type === "order" || row.order_id) {
    return `أوردر #${row.order_id || row.source_id || ""}`;
  }

  if (row.source_type === "purchase") {
    return `فاتورة شراء #${row.source_id || ""}`;
  }

  if (row.source_type === "manual") {
    return "حركة يدوية";
  }

  if (row.source_type === "order_cancellation") {
    return `إلغاء أوردر #${row.source_id || ""}`;
  }

  return row.source_type || "—";
}

function getEmployeeLabel(row) {
  if (row.source_type === "order") return "النظام";
  if (row.source_type === "order_cancellation") return "النظام";
  return row.created_by ? "مستخدم النظام" : "—";
}

function getErrorMessage(error) {
  const message = error?.message || "حدث خطأ غير متوقع";

  if (message.includes("Insufficient stock")) {
    return "الرصيد الحالي غير كافٍ لتنفيذ الخصم.";
  }

  if (message.includes("No stock difference")) {
    return "الرصيد الفعلي مطابق للرصيد الحالي، لا توجد تسوية.";
  }

  if (message.includes("Permission denied") || message.includes("Unauthorized")) {
    return "ليس لديك صلاحية لتنفيذ هذه العملية.";
  }

  if (message.includes("Inventory item not found")) {
    return "الصنف غير موجود أو غير نشط.";
  }

  return message;
}

export default function Page() {
  const [rows, setRows] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);

  const [form, setForm] = useState({
    type: "deduction",
    item: "",
    quantity: "",
    actualStock: "",
    cost: "",
    notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [movementData, itemData, unitData] = await Promise.all([
        fetchAllRows(
          "inventory_movements",
          "id, inventory_item_id, movement_type, quantity, unit_cost, source_type, source_id, order_id, notes, created_by, created_at"
        ),

        fetchAllRows(
          "inventory_items",
          "id, name, item_type, unit_id, current_stock, min_stock, unit_cost, is_active"
        ),

        fetchAllRows(
          "inventory_units",
          "id, name, abbreviation, base_unit_id"
        ),
      ]);

      const unitsMap = new Map(
        unitData.map((unit) => [String(unit.id), unit])
      );

      const itemsMap = new Map(
        itemData.map((item) => {
          const selectedUnit = unitsMap.get(String(item.unit_id));

          const baseUnit = selectedUnit?.base_unit_id
            ? unitsMap.get(String(selectedUnit.base_unit_id))
            : selectedUnit;

          return [
            String(item.id),
            {
              ...item,
              unit: baseUnit?.abbreviation || baseUnit?.name || selectedUnit?.abbreviation || selectedUnit?.name || "",
            },
          ];
        })
      );

      const formattedRows = movementData.map((movement) => {
        const item = itemsMap.get(String(movement.inventory_item_id));

        return {
          ...movement,
          name: item?.name || `صنف #${movement.inventory_item_id}`,
          unit: item?.unit || "",
          date: formatDate(movement.created_at),
          source: getSourceLabel(movement),
          employee: getEmployeeLabel(movement),
        };
      });

      setItems(
        itemData
          .filter((item) => item.is_active)
          .map((item) => ({
            ...item,
            unit:
              itemsMap.get(String(item.id))?.unit || "",
          }))
      );

      setRows(formattedRows);
    } catch (err) {
      console.error("Inventory movements error:", err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const additions = rows
      .filter((row) => Number(row.quantity) > 0)
      .reduce((sum, row) => sum + Number(row.quantity), 0);

    const deductions = rows
      .filter((row) => Number(row.quantity) < 0)
      .reduce((sum, row) => sum + Math.abs(Number(row.quantity)), 0);

    return {
      additions,
      deductions,
      purchases: rows.filter((row) => row.movement_type === "purchase").length,
      total: rows.length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const searchText = search.trim().toLowerCase();

      const matchesSearch =
        row.name.toLowerCase().includes(searchText) ||
        String(row.source).toLowerCase().includes(searchText) ||
        String(row.notes || "").toLowerCase().includes(searchText);

      const matchesType =
        filterType === "all" || row.movement_type === filterType;

      const rowDate = row.created_at?.slice(0, 10) || "";

      const matchesFrom = !dateFrom || rowDate >= dateFrom;
      const matchesTo = !dateTo || rowDate <= dateTo;

      return matchesSearch && matchesType && matchesFrom && matchesTo;
    });
  }, [rows, search, filterType, dateFrom, dateTo]);

  const closeForm = () => {
    setShowForm(false);

    setForm({
      type: "deduction",
      item: "",
      quantity: "",
      actualStock: "",
      cost: "",
      notes: "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (saving) return;

    setError("");
    setSuccess("");

    if (!form.item) {
      setError("من فضلك اختر الصنف.");
      return;
    }

    if (!form.notes.trim()) {
      setError("من فضلك اكتب سبب الحركة.");
      return;
    }

    if (
      form.type !== "adjustment" &&
      (!form.quantity || Number(form.quantity) <= 0)
    ) {
      setError("الكمية يجب أن تكون أكبر من صفر.");
      return;
    }

    if (
      form.type === "adjustment" &&
      (form.actualStock === "" || Number(form.actualStock) < 0)
    ) {
      setError("أدخل الرصيد الفعلي بشكل صحيح.");
      return;
    }

    if (form.cost !== "" && Number(form.cost) < 0) {
      setError("تكلفة الوحدة لا يمكن أن تكون سالبة.");
      return;
    }

    try {
      setSaving(true);

      const { data, error: rpcError } = await supabase.rpc(
        "create_manual_inventory_movement",
        {
          p_inventory_item_id: Number(form.item),
          p_movement_type: form.type,
          p_quantity:
            form.type === "adjustment"
              ? null
              : Number(form.quantity),
          p_actual_stock:
            form.type === "adjustment"
              ? Number(form.actualStock)
              : null,
          p_unit_cost:
            form.cost === "" ? null : Number(form.cost),
          p_notes: form.notes.trim(),
        }
      );

      if (rpcError) throw rpcError;

      closeForm();

      await loadData();

      setSuccess(`تم تسجيل الحركة بنجاح. رقم الحركة: ${data}`);
    } catch (err) {
      console.error("Save movement error:", err);
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const isAdjustment = form.type === "adjustment";

  const selectedItem = items.find(
    (item) => String(item.id) === String(form.item)
  );

  return (
    <main className="movement-page" dir="rtl">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">ARKAN INVENTORY</p>
          <h1>حركة المخزون</h1>
          <p>متابعة الإضافات والخصومات والهالك والتسويات.</p>
        </div>

        <button
          style={{ ...buttonStyle, background: "#15803d", color: "#fff" }}
          onClick={() => {
            setError("");
            setSuccess("");
            setShowForm(true);
          }}
        >
          + إضافة حركة يدوية
        </button>
      </header>

      {error && (
        <div className="message-box error-message">
          {error}
        </div>
      )}

      {success && (
        <div className="message-box success-message">
          {success}
        </div>
      )}

      <section className="stats-grid">
        <StatCard
          title="إجمالي الإضافات"
          value={stats.additions.toLocaleString("en-US")}
          color="#15803d"
          icon="↓"
        />

        <StatCard
          title="إجمالي الخصومات"
          value={stats.deductions.toLocaleString("en-US")}
          color="#dc2626"
          icon="↑"
        />

        <StatCard
          title="حركات الشراء"
          value={stats.purchases}
          color="#2563eb"
          icon="🛒"
        />

        <StatCard
          title="إجمالي الحركات"
          value={stats.total}
          color="#7c3aed"
          icon="↔"
        />
      </section>

      <section className="admin-panel movement-panel">
        <div className="section-heading">
          <div>
            <h2>سجل الحركات</h2>
            <p>جميع العمليات المسجلة على المخزون.</p>
          </div>

          <span className="result-count">
            {filteredRows.length} حركة
          </span>
        </div>

        <div className="filters-grid">
          <input
            style={fieldStyle}
            placeholder="ابحث باسم الصنف أو المصدر..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="movement-filter-select"
            style={fieldStyle}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">كل الحركات</option>

            {Object.entries(typeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <input
            style={fieldStyle}
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="من تاريخ"
          />

          <input
            style={fieldStyle}
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="إلى تاريخ"
          />
        </div>

        <div className="table-wrapper">
          <table className="movement-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الصنف</th>
                <th>نوع الحركة</th>
                <th>الكمية</th>
                <th>المصدر</th>
                <th>الموظف</th>
                <th>التفاصيل</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="empty-row">
                    جاري تحميل الحركات...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-row">
                    لا توجد حركات مطابقة.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>

                    <td>
                      <strong>{row.name}</strong>
                    </td>

                    <td>
                      <span
                        className={`movement-badge ${
                          Number(row.quantity) > 0
                            ? "positive"
                            : "negative"
                        }`}
                      >
                        {typeLabels[row.movement_type] ||
                          row.movement_type}
                      </span>
                    </td>

                    <td
                      className={
                        Number(row.quantity) > 0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {Number(row.quantity) > 0 ? "+" : ""}
                      {Number(row.quantity).toLocaleString("en-US")}{" "}
                      {row.unit}
                    </td>

                    <td>{row.source}</td>

                    <td>{row.employee}</td>

                    <td>
                      <button
                        className="details-button"
                        onClick={() => setSelected(row)}
                      >
                        التفاصيل
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div
            className="movement-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2>إضافة حركة مخزون</h2>
                <p>أدخل بيانات الحركة اليدوية.</p>
              </div>

              <button
                className="close-button"
                onClick={closeForm}
                type="button"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label>نوع الحركة</label>

                <SearchableSelect
                  options={movementTypeOptions}
                  value={form.type}
                  onChange={(value) =>
                    setForm({ ...form, type: value })
                  }
                  placeholder="اختر نوع الحركة"
                  searchable={false}
                />
              </div>

              <div className="form-field">
                <label>الصنف</label>

                <SearchableSelect
                  options={items.map((item) => ({
                    value: String(item.id),
                    label: item.name,
                  }))}
                  value={form.item}
                  onChange={(value) =>
                    setForm({ ...form, item: value })
                  }
                  placeholder="ابحث عن الصنف..."
                  searchable={true}
                />

                {selectedItem && (
                  <small>
                    الرصيد الحالي:{" "}
                    {Number(selectedItem.current_stock).toLocaleString("en-US")}{" "}
                    {selectedItem.unit}
                  </small>
                )}
              </div>

              {isAdjustment ? (
                <div className="form-field">
                  <label>الرصيد الفعلي بعد الجرد</label>

                  <input
                    style={fieldStyle}
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={form.actualStock}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        actualStock: e.target.value,
                      })
                    }
                    placeholder="أدخل الرصيد الفعلي"
                  />

                  <small>
                    سيتم حساب الفرق بين الرصيد الحالي والرصيد الفعلي.
                  </small>
                </div>
              ) : (
                <div className="form-field">
                  <label>الكمية</label>

                  <input
                    style={fieldStyle}
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        quantity: e.target.value,
                      })
                    }
                    placeholder="أدخل الكمية"
                  />
                </div>
              )}

              <div className="form-field">
                <label>تكلفة الوحدة (اختياري)</label>

                <input
                  style={fieldStyle}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(e) =>
                    setForm({ ...form, cost: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="form-field">
                <label>السبب والملاحظات</label>

                <textarea
                  style={{ ...fieldStyle, minHeight: "90px" }}
                  required
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="اكتب سبب الحركة..."
                />
              </div>

              <div className="modal-actions">
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...buttonStyle,
                    background: saving ? "#94a3b8" : "#15803d",
                    color: "#fff",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "جاري الحفظ..." : "حفظ الحركة"}
                </button>

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  style={{
                    ...buttonStyle,
                    background: "#e2e8f0",
                    color: "#334155",
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="modal-overlay"
          onClick={() => setSelected(null)}
        >
          <div
            className="movement-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>تفاصيل الحركة</h2>

              <button
                className="close-button"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>

            <div className="details-grid">
              <Detail label="رقم الحركة" value={selected.id} />
              <Detail label="الصنف" value={selected.name} />

              <Detail
                label="نوع الحركة"
                value={typeLabels[selected.movement_type] || selected.movement_type}
              />

              <Detail
                label="الكمية"
                value={`${Number(selected.quantity).toLocaleString("en-US")} ${selected.unit}`}
              />

              <Detail label="التاريخ" value={selected.date} />
              <Detail label="المصدر" value={selected.source} />
              <Detail label="الموظف" value={selected.employee} />

              <Detail
                label="تكلفة الوحدة"
                value={
                  selected.unit_cost == null
                    ? "—"
                    : Number(selected.unit_cost).toLocaleString("en-US")
                }
              />

              <Detail
                label="رقم الطلب"
                value={selected.order_id || "—"}
              />

              <Detail
                label="الملاحظات"
                value={selected.notes || "—"}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .movement-page {
          width: 100%;
        }

        .message-box {
          margin-top: 18px;
          padding: 13px 16px;
          border-radius: 8px;
          font-size: 14px;
        }

        .error-message {
          background: #fee2e2;
          color: #991b1b;
        }

        .success-message {
          background: #dcfce7;
          color: #166534;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-top: 24px;
        }

        .movement-panel {
          margin-top: 24px;
          padding: 26px;
        }

        .section-heading,
        .modal-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 22px;
        }

        .section-heading h2,
        .modal-heading h2 {
          margin: 0 0 7px;
        }

        .section-heading p,
        .modal-heading p {
          margin: 0;
          opacity: .7;
          font-size: 14px;
        }

        .result-count {
          padding: 7px 12px;
          background: rgba(37,99,235,.1);
          color: #2563eb;
          border-radius: 20px;
          font-size: 13px;
          white-space: nowrap;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 22px;
        }

        .movement-filter-select {
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          opacity: 1 !important;
        }

        .movement-filter-select option {
          background: #ffffff !important;
          color: #000000 !important;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .movement-table {
          width: 100%;
          border-collapse: collapse;
          text-align: right;
          white-space: nowrap;
        }

        .movement-table th,
        .movement-table td {
          padding: 14px 12px;
          border-bottom: 1px solid rgba(128,128,128,.2);
          font-size: 14px;
        }

        .movement-table th {
          background: rgba(128,128,128,.08);
          font-weight: 700;
        }

        .movement-badge {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .positive {
          background: #dcfce7;
          color: #166534;
        }

        .negative {
          background: #fee2e2;
          color: #991b1b;
        }

        .positive-text {
          color: #15803d;
          font-weight: 700;
        }

        .negative-text {
          color: #dc2626;
          font-weight: 700;
        }

        .details-button {
          border: 0;
          background: transparent;
          color: #2563eb;
          cursor: pointer;
          font-weight: 600;
        }

        .empty-row {
          text-align: center;
          padding: 30px !important;
          opacity: .65;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0,0,0,.55);
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 16px;
          overflow-y: auto;
        }

        .movement-modal {
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 26px;
          border-radius: 16px;
          background: #ffffff !important;
          color: #000000 !important;
          box-shadow: 0 20px 60px rgba(0,0,0,.2);
        }

        .modal-heading {
          margin-bottom: 24px;
        }

        .close-button {
          border: 0;
          background: #f1f5f9;
          border-radius: 8px;
          width: 34px;
          height: 34px;
          font-size: 23px;
          cursor: pointer;
          color: #000000;
        }

        .form-field {
          margin-bottom: 18px;
        }

        .form-field label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #000000 !important;
        }

        .form-field small {
          display: block;
          margin-top: 6px;
          color: #000000 !important;
        }

        .movement-modal,
        .movement-modal label,
        .movement-modal h2,
        .movement-modal p,
        .movement-modal small {
          color: #000000 !important;
        }

        .movement-modal input,
        .movement-modal textarea {
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          border: 1px solid #999999 !important;
          font-family: inherit !important;
          opacity: 1 !important;
        }

        .movement-modal input::placeholder,
        .movement-modal textarea::placeholder {
          color: #555555 !important;
          -webkit-text-fill-color: #555555 !important;
          opacity: 1 !important;
        }

        .movement-modal input:focus,
        .movement-modal textarea:focus {
          background: #ffffff !important;
          color: #000000 !important;
          border-color: #2563eb !important;
          outline: none !important;
        }

        .modal-actions {
          display: flex;
          gap: 10px;
          margin-top: 24px;
          flex-wrap: wrap;
        }

        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }

        @media(max-width: 900px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .filters-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media(max-width: 600px) {
          .stats-grid {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .filters-grid {
            grid-template-columns: 1fr;
          }

          .movement-panel {
            padding: 16px;
          }

          .movement-modal {
            padding: 18px;
          }

          .details-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchable = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = options.find(
    (option) => option.value === value
  );

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  const chooseOption = (option) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={`custom-select ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => {
          setOpen((previous) => !previous);
          setQuery("");
        }}
        aria-expanded={open}
      >
        <span className="selected-text">
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <span className="select-arrow">
          {open ? "▾" : "⌄"}
        </span>
      </button>

      {open && (
        <>
          <div
            className="select-backdrop"
            onClick={() => setOpen(false)}
          />

          <div className="custom-select-menu">
            {searchable && (
              <input
                autoFocus
                className="custom-select-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="اكتب اسم الصنف للبحث..."
                onClick={(e) => e.stopPropagation()}
              />
            )}

            <div className="custom-select-options">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={value === option.value}
                    tabIndex={0}
                    className={`custom-select-option ${
                      value === option.value ? "selected" : ""
                    }`}
                    onClick={() => chooseOption(option)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        chooseOption(option);
                      }
                    }}
                  >
                    <span>{option.label}</span>
                    {value === option.value && <span>✓</span>}
                  </div>
                ))
              ) : (
                <p className="no-options">
                  لا توجد اختيارات مطابقة
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        .custom-select {
          position: relative;
          width: 100%;
          direction: rtl;
          z-index: 1;
        }

        .custom-select.is-open {
          z-index: 1005;
        }

        .custom-select .custom-select-trigger {
          all: unset !important;
          box-sizing: border-box !important;
          width: 100% !important;
          min-height: 44px !important;
          padding: 10px 12px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 10px !important;
          border: 1px solid #999999 !important;
          border-radius: 8px !important;
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          font-size: 14px !important;
          font-family: inherit !important;
          text-align: right !important;
          cursor: pointer !important;
        }

        .custom-select .custom-select-trigger:hover,
        .custom-select .custom-select-trigger:focus {
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          border-color: #2563eb !important;
        }

        .custom-select .custom-select-trigger span {
          background: transparent !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          opacity: 1 !important;
        }

        .custom-select .select-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: transparent;
        }

        .custom-select .custom-select-menu {
          position: absolute !important;
          bottom: calc(100% + 8px) !important;
          right: 0 !important;
          left: 0 !important;
          z-index: 1006 !important;
          box-sizing: border-box !important;
          padding: 8px !important;
          border: 1px solid #999999 !important;
          border-radius: 8px !important;
          background: #ffffff !important;
          color: #000000 !important;
          box-shadow: 0 8px 25px rgba(0,0,0,.15);
          max-height: 260px;
          display: flex;
          flex-direction: column;
          opacity: 1 !important;
        }

        .custom-select .custom-select-search {
          all: unset !important;
          box-sizing: border-box !important;
          width: 100% !important;
          min-height: 42px !important;
          padding: 10px !important;
          margin-bottom: 7px !important;
          border: 1px solid #999999 !important;
          border-radius: 6px !important;
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          font-size: 14px !important;
          font-family: inherit !important;
          direction: rtl !important;
        }

        .custom-select .custom-select-search::placeholder {
          color: #555555 !important;
          -webkit-text-fill-color: #555555 !important;
          opacity: 1 !important;
        }

        .custom-select .custom-select-options {
          overflow-y: auto !important;
          max-height: 190px !important;
          background: #ffffff !important;
          color: #000000 !important;
        }

        .custom-select .custom-select-option {
          all: unset !important;
          box-sizing: border-box !important;
          width: 100% !important;
          min-height: 40px !important;
          padding: 10px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          border: none !important;
          border-radius: 5px !important;
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          font-size: 14px !important;
          font-family: inherit !important;
          text-align: right !important;
          cursor: pointer !important;
          opacity: 1 !important;
          visibility: visible !important;
        }

        .custom-select .custom-select-option span {
          background: transparent !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          opacity: 1 !important;
        }

        .custom-select .custom-select-option:hover,
        .custom-select .custom-select-option:focus,
        .custom-select .custom-select-option.selected {
          background: #e5e7eb !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          outline: none !important;
        }

        .custom-select .custom-select-option:hover span,
        .custom-select .custom-select-option:focus span,
        .custom-select .custom-select-option.selected span {
          background: transparent !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
        }

        .custom-select .no-options {
          margin: 0;
          padding: 14px 10px;
          background: #ffffff !important;
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          text-align: center;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

function StatCard({ title, value, color, icon }) {
  return (
    <div className="admin-panel stat-card">
      <div className="stat-icon" style={{ color }}>
        {icon}
      </div>

      <p>{title}</p>

      <h2 style={{ color }}>{value}</h2>

      <style jsx>{`
        .stat-card {
          padding: 20px;
          min-width: 0;
        }

        .stat-icon {
          font-size: 23px;
          font-weight: 800;
        }

        .stat-card p {
          margin: 9px 0;
          font-size: 13px;
          opacity: .7;
        }

        .stat-card h2 {
          margin: 0;
          font-size: 25px;
        }
      `}</style>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <small style={{ color: "#000000" }}>{label}</small>

      <p
        style={{
          margin: "6px 0 0",
          fontWeight: 600,
          overflowWrap: "anywhere",
          color: "#000000",
        }}
      >
        {value}
      </p>
    </div>
  );
}
