
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const emptySupplier = {
  name: "",
  phone: "",
  address: "",
  notes: "",
};

const newLine = () => ({
  inventory_item_id: "",
  input_unit_id: "",
  quantity: "",
  unit_price: "",
});

const money = (value) =>
  Number(value || 0).toLocaleString("en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dateText = (value) =>
  value ? new Date(value).toLocaleString("ar-EG") : "-";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);

export default function Page() {
  const [tab, setTab] = useState("purchases");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState([]);

  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: "",
    representative_name: "",
    notes: "",
    items: [newLine()],
  });

  const [selectedPurchase, setSelectedPurchase] = useState(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "cash",
    notes: "",
  });

  const notifyError = (message) => {
    setError(message);
    setSuccess("");
  };

  const notifySuccess = (message) => {
    setSuccess(message);
    setError("");
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const results = await Promise.all([
        supabase.from("inventory_suppliers").select("*").order("name"),

        // تحميل كل الأصناف، بما فيها غير النشطة للفواتير القديمة
        supabase.from("inventory_items").select("*").order("name"),

        supabase.from("inventory_units").select("*").order("name"),

        supabase
          .from("inventory_purchases")
          .select("*")
          .order("created_at", { ascending: false }),

        supabase
          .from("inventory_purchase_items")
          .select("*")
          .order("id"),

        supabase
          .from("inventory_purchase_payments")
          .select("*")
          .order("payment_date", { ascending: false }),

        supabase
          .from("inventory_purchase_payment_summary")
          .select("*"),
      ]);

      const failed = results.find((result) => result.error);
      if (failed) throw failed.error;

      setSuppliers(results[0].data || []);
      setItems(results[1].data || []);
      setUnits(results[2].data || []);
      setPurchases(results[3].data || []);
      setPurchaseItems(results[4].data || []);
      setPayments(results[5].data || []);
      setPaymentSummary(results[6].data || []);
    } catch (err) {
      notifyError(err.message || "حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedPurchaseData = purchases.find(
    (purchase) => Number(purchase.id) === Number(selectedPurchase)
  );

  const currentLines = useMemo(
    () =>
      purchaseItems.filter(
        (line) => Number(line.purchase_id) === Number(selectedPurchase)
      ),
    [purchaseItems, selectedPurchase]
  );

  const currentPayments = useMemo(
    () =>
      payments.filter(
        (payment) => Number(payment.purchase_id) === Number(selectedPurchase)
      ),
    [payments, selectedPurchase]
  );

  const selectedSummary = paymentSummary.find(
    (row) => Number(row.purchase_id) === Number(selectedPurchase)
  );

  const formTotal = useMemo(
    () =>
      purchaseForm.items.reduce(
        (sum, line) =>
          sum +
          (Number(line.quantity) || 0) *
            (Number(line.unit_price) || 0),
        0
      ),
    [purchaseForm.items]
  );

  // =====================================
  // Invoice date filter
  // =====================================

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      if (!purchase.created_at) return false;

      const purchaseDate = new Date(purchase.created_at);

      if (Number.isNaN(purchaseDate.getTime())) return false;

      const year = purchaseDate.getFullYear();
      const month = String(purchaseDate.getMonth() + 1).padStart(2, "0");
      const day = String(purchaseDate.getDate()).padStart(2, "0");

      const purchaseDateKey = `${year}-${month}-${day}`;

      if (dateFrom && purchaseDateKey < dateFrom) return false;
      if (dateTo && purchaseDateKey > dateTo) return false;

      return true;
    });
  }, [purchases, dateFrom, dateTo]);

  const clearDateFilter = () => {
    setDateFrom("");
    setDateTo("");
  };

  const getSupplierName = (id) =>
    suppliers.find((supplier) => Number(supplier.id) === Number(id))?.name || "-";

  const getItemName = (id) =>
    items.find((item) => Number(item.id) === Number(id))?.name ||
    `صنف رقم ${id}`;

  const getUnitName = (id) => {
    const unit = units.find((u) => Number(u.id) === Number(id));
    return unit?.abbreviation || unit?.name || "-";
  };

  const getPaymentData = (purchaseId) =>
    paymentSummary.find(
      (row) => Number(row.purchase_id) === Number(purchaseId)
    );

  const getPaid = (purchaseId) =>
    Number(getPaymentData(purchaseId)?.paid_amount || 0);

  const getRemaining = (purchase) =>
    Math.max(Number(purchase.total_amount || 0) - getPaid(purchase.id), 0);

  const getPaymentStatus = (purchase) => {
    const paid = getPaid(purchase.id);
    const total = Number(purchase.total_amount || 0);

    if (paid <= 0) return "غير مدفوعة";
    if (paid < total) return "مدفوعة جزئيًا";
    return "مدفوعة بالكامل";
  };

  const paymentColor = (purchase) => {
    const paid = getPaid(purchase.id);
    const total = Number(purchase.total_amount || 0);

    if (paid <= 0) return "#dc2626";
    if (paid < total) return "#b7791f";
    return "#15803d";
  };

  const getStatus = (status) => ({
    draft: "مسودة",
    received: "تم الاستلام",
    cancelled: "ملغاة",
  }[status] || status);

  const statusColor = (status) => {
    if (status === "received") return "#15803d";
    if (status === "cancelled") return "#dc2626";
    return "#b7791f";
  };

  const compatibleUnits = (itemId) => {
    const item = items.find((row) => Number(row.id) === Number(itemId));
    if (!item) return [];

    return units.filter(
      (unit) =>
        Number(unit.id) === Number(item.unit_id) ||
        Number(unit.base_unit_id) === Number(item.unit_id)
    );
  };

  // =====================================
  // Supplier management
  // =====================================

  const resetSupplierForm = () => {
    setSupplierForm(emptySupplier);
    setEditingSupplier(null);
  };

  const saveSupplier = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const payload = {
        p_name: supplierForm.name.trim(),
        p_phone: supplierForm.phone || null,
        p_address: supplierForm.address || null,
        p_notes: supplierForm.notes || null,
      };

      const { error } = editingSupplier
        ? await supabase.rpc("update_inventory_supplier", {
            p_id: editingSupplier.id,
            ...payload,
          })
        : await supabase.rpc("create_inventory_supplier", payload);

      if (error) throw error;

      notifySuccess(editingSupplier ? "تم تحديث المورد" : "تمت إضافة المورد");
      resetSupplierForm();
      await loadData();
    } catch (err) {
      notifyError(err.message || "تعذر حفظ المورد");
    } finally {
      setSaving(false);
    }
  };

  const startEditSupplier = (supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSupplier = async (supplier) => {
    if (
      !window.confirm(
        supplier.is_active ? "هل تريد تعطيل المورد؟" : "هل تريد تفعيل المورد؟"
      )
    ) return;

    setSaving(true);

    try {
      const { error } = await supabase.rpc("set_inventory_supplier_active", {
        p_id: supplier.id,
        p_is_active: !supplier.is_active,
      });

      if (error) throw error;

      notifySuccess("تم تحديث حالة المورد");
      await loadData();
    } catch (err) {
      notifyError(err.message || "تعذر تحديث المورد");
    } finally {
      setSaving(false);
    }
  };

  // =====================================
  // New invoice form
  // =====================================

  const updateLine = (index, field, value) => {
    setPurchaseForm((previous) => ({
      ...previous,
      items: previous.items.map((line, i) =>
        i === index
          ? {
              ...line,
              [field]: value,
              ...(field === "inventory_item_id"
                ? { input_unit_id: "" }
                : {}),
            }
          : line
      ),
    }));
  };

  const addLine = () => {
    setPurchaseForm((previous) => ({
      ...previous,
      items: [...previous.items, newLine()],
    }));
  };

  const removeLine = (index) => {
    setPurchaseForm((previous) => ({
      ...previous,
      items:
        previous.items.length === 1
          ? [newLine()]
          : previous.items.filter((_, i) => i !== index),
    }));
  };

  const resetPurchaseForm = () => {
    setPurchaseForm({
      supplier_id: "",
      representative_name: "",
      notes: "",
      items: [newLine()],
    });
  };

  const createPurchase = async (event) => {
    event.preventDefault();

    if (!purchaseForm.supplier_id) {
      notifyError("اختار المورد أولًا");
      return;
    }

    if (!purchaseForm.items.length) {
      notifyError("أضف صنفًا واحدًا على الأقل");
      return;
    }

    for (let i = 0; i < purchaseForm.items.length; i++) {
      const line = purchaseForm.items[i];

      if (!line.inventory_item_id || !line.input_unit_id) {
        notifyError(`أكمل الصنف ووحدة الشراء في السطر ${i + 1}`);
        return;
      }

      if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        notifyError(`الكمية غير صحيحة في السطر ${i + 1}`);
        return;
      }

      if (!Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) < 0) {
        notifyError(`السعر غير صحيح في السطر ${i + 1}`);
        return;
      }
    }

    setSaving(true);

    try {
      const payload = purchaseForm.items.map((line) => ({
        inventory_item_id: Number(line.inventory_item_id),
        input_unit_id: Number(line.input_unit_id),
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
      }));

      const { data, error } = await supabase.rpc(
        "create_inventory_purchase_with_items",
        {
          p_supplier_id: Number(purchaseForm.supplier_id),
          p_representative_name: purchaseForm.representative_name.trim() || null,
          p_notes: purchaseForm.notes.trim() || null,
          p_items: payload,
        }
      );

      if (error) throw error;

      resetPurchaseForm();
      setSelectedPurchase(data);

      notifySuccess(`تم حفظ الفاتورة بنجاح. رقمها الداخلي: ${data}`);
      await loadData();
    } catch (err) {
      notifyError(err.message || "تعذر حفظ الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  // =====================================
  // Receive invoice
  // =====================================

  const receivePurchase = async (purchase) => {
    const lines = purchaseItems.filter(
      (line) => Number(line.purchase_id) === Number(purchase.id)
    );

    if (!lines.length) {
      notifyError("لا يمكن استلام فاتورة فارغة");
      return;
    }

    if (
      !window.confirm(
        "تأكيد استلام البضاعة؟ سيتم تحديث المخزون فقط، ولن يتم تسجيل أي دفعة مالية."
      )
    ) return;

    setSaving(true);

    try {
      const { error } = await supabase.rpc("receive_inventory_purchase", {
        p_purchase_id: Number(purchase.id),
      });

      if (error) throw error;

      notifySuccess("تم استلام البضاعة وتحديث المخزون. لم يتم دفع أي مبلغ.");
      await loadData();
    } catch (err) {
      notifyError(err.message || "تعذر استلام الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  const cancelPurchase = async (purchase) => {
    if (!window.confirm("هل تريد إلغاء مسودة الفاتورة؟")) return;

    setSaving(true);

    try {
      const { error } = await supabase.rpc("cancel_inventory_purchase", {
        p_purchase_id: Number(purchase.id),
      });

      if (error) throw error;

      notifySuccess("تم إلغاء المسودة");

      if (Number(selectedPurchase) === Number(purchase.id)) {
        setSelectedPurchase(null);
      }

      await loadData();
    } catch (err) {
      notifyError(err.message || "تعذر إلغاء الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  // =====================================
  // Payments
  // =====================================

  const addPayment = async (event) => {
    event.preventDefault();

    if (!selectedPurchaseData || selectedPurchaseData.status !== "received") {
      notifyError("الدفع متاح للفواتير المستلمة فقط");
      return;
    }

    const amount = Number(paymentForm.amount);
    const remaining = getRemaining(selectedPurchaseData);

    if (!Number.isFinite(amount) || amount <= 0) {
      notifyError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }

    if (amount > remaining + 0.000001) {
      notifyError("المبلغ أكبر من المبلغ المتبقي");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc(
        "add_inventory_purchase_payment",
        {
          p_purchase_id: Number(selectedPurchase),
          p_amount: amount,
          p_payment_method: paymentForm.payment_method,
          p_notes: paymentForm.notes.trim() || null,
        }
      );

      if (error) throw error;

      setPaymentForm({
        amount: "",
        payment_method: "cash",
        notes: "",
      });

      notifySuccess("تم تسجيل الدفعة بنجاح");
      await loadData();
    } catch (err) {
      notifyError(err.message || "تعذر تسجيل الدفعة");
    } finally {
      setSaving(false);
    }
  };

  // =====================================
  // Print invoice
  // =====================================

  const printPurchase = (purchase) => {
    const lines = purchaseItems.filter(
      (line) => Number(line.purchase_id) === Number(purchase.id)
    );

    const invoicePayments = payments.filter(
      (payment) => Number(payment.purchase_id) === Number(purchase.id)
    );

    const paid = getPaid(purchase.id);
    const total = Number(purchase.total_amount || 0);
    const remaining = Math.max(total - paid, 0);

    const rows = lines.map((line, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(getItemName(line.inventory_item_id))}</td>
        <td>${escapeHtml(line.quantity)} ${escapeHtml(getUnitName(line.input_unit_id))}</td>
        <td>${money(line.unit_price)}</td>
        <td>${money(line.subtotal)}</td>
      </tr>
    `).join("");

    const paymentRows = invoicePayments.map((payment, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(dateText(payment.payment_date))}</td>
        <td>${money(payment.amount)} جنيه</td>
        <td>${escapeHtml(payment.payment_method || "-")}</td>
        <td>${escapeHtml(payment.notes || "-")}</td>
      </tr>
    `).join("");

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      notifyError("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة للموقع.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>فاتورة ${escapeHtml(purchase.invoice_number || purchase.id)}</title>
        <style>
          body {
            font-family: Tahoma, Arial, sans-serif;
            padding: 30px;
            color: #222;
          }
          h1, h2 { margin-bottom: 12px; }
          .header {
            display: flex;
            justify-content: space-between;
            border-bottom: 2px solid #a77b3e;
            padding-bottom: 18px;
            margin-bottom: 22px;
          }
          .info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 25px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0 25px;
          }
          th, td {
            border: 1px solid #ccc;
            padding: 10px;
            text-align: right;
          }
          th { background: #eee; }
          .totals {
            width: 350px;
            margin-right: auto;
            margin-top: 20px;
          }
          .totals div {
            display: flex;
            justify-content: space-between;
            padding: 9px;
            border-bottom: 1px solid #ddd;
          }
          .grand { font-weight: bold; font-size: 19px; }
          .footer {
            margin-top: 45px;
            text-align: center;
            color: #777;
          }
          @media print {
            body { padding: 10px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>ARKAN</h1>
            <p>فاتورة مشتريات</p>
          </div>
          <div>
            <h2>${escapeHtml(purchase.invoice_number || purchase.id)}</h2>
            <p>تاريخ الإنشاء: ${escapeHtml(dateText(purchase.created_at))}</p>
            <p>الحالة: ${escapeHtml(getStatus(purchase.status))}</p>
          </div>
        </div>

        <div class="info">
          <div><strong>المورد:</strong> ${escapeHtml(getSupplierName(purchase.supplier_id))}</div>
          <div><strong>المندوب:</strong> ${escapeHtml(purchase.representative_name || "-")}</div>
          <div><strong>ملاحظات:</strong> ${escapeHtml(purchase.notes || "-")}</div>
          <div><strong>رقم الفاتورة:</strong> ${escapeHtml(purchase.invoice_number || purchase.id)}</div>
        </div>

        <h2>الأصناف</h2>
        <table>
          <thead>
            <tr>
              <th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="totals">
          <div class="grand"><span>إجمالي الفاتورة</span><span>${money(total)} جنيه</span></div>
          <div><span>المدفوع</span><span>${money(paid)} جنيه</span></div>
          <div><span>المتبقي</span><span>${money(remaining)} جنيه</span></div>
        </div>

        <h2>سجل الدفعات</h2>
        <table>
          <thead>
            <tr>
              <th>#</th><th>تاريخ الدفع</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${paymentRows || '<tr><td colspan="5">لا توجد دفعات مسجلة</td></tr>'}
          </tbody>
        </table>

        <div class="footer">ARKAN Cafe & Restaurant</div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  // =====================================
  // Styles
  // =====================================

  const inputStyle = {
    width: "100%",
    minHeight: 46,
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    background: "#fff",
    color: "#1f2937",
    WebkitTextFillColor: "#1f2937",
    caretColor: "#b88946",
    font: "inherit",
    fontSize: 15,
    boxSizing: "border-box",
    colorScheme: "light",
  };

  const selectStyle = {
    ...inputStyle,
    backgroundColor: "#ffffff",
    color: "#111827",
    WebkitTextFillColor: "#111827",
    colorScheme: "light",
  };

  const optionStyle = {
    backgroundColor: "#ffffff",
    color: "#111827",
  };

  const buttonStyle = {
    padding: "10px 16px",
    border: "1px solid #66533d",
    borderRadius: 10,
    cursor: "pointer",
    font: "inherit",
    fontWeight: 600,
    background: "#29221b",
    color: "#fff",
  };

  const primaryStyle = {
    ...buttonStyle,
    background: "#a77b3e",
    borderColor: "#a77b3e",
  };

  const dangerStyle = {
    ...buttonStyle,
    background: "#fff1f2",
    color: "#be123c",
    borderColor: "#fda4af",
  };

  const labelStyle = {
    display: "block",
    marginBottom: 7,
    fontWeight: 700,
    fontSize: 14,
    color: "var(--admin-text, #f5f0e8)",
  };

  const fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const panelStyle = {
    padding: 22,
    borderRadius: 14,
    border: "1px solid var(--admin-border, #554637)",
    background: "var(--admin-card-bg, #211b16)",
    marginBottom: 18,
    color: "var(--admin-text, #f5f0e8)",
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  };

  const cardStyle = {
    padding: 18,
    border: "1px solid var(--admin-border, #554637)",
    borderRadius: 12,
    background: "var(--admin-card-bg, #29221b)",
    color: "var(--admin-text, #f5f0e8)",
  };

  if (loading) {
    return (
      <main className="admin-panel" style={{ padding: 30 }}>
        جاري تحميل بيانات المخزن...
      </main>
    );
  }

  return (
    <main style={{ width: "100%", paddingBottom: 30 }}>
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">ARKAN INVENTORY</p>
          <h1>المشتريات والموردين</h1>
          <p>إدارة الفواتير والاستلام والمدفوعات وحسابات الموردين.</p>
        </div>
      </header>

      {error && (
        <div role="alert" style={{
          padding: 14,
          marginTop: 18,
          borderRadius: 10,
          background: "#fee2e2",
          color: "#991b1b",
        }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{
          padding: 14,
          marginTop: 18,
          borderRadius: 10,
          background: "#dcfce7",
          color: "#166534",
        }}>
          {success}
        </div>
      )}

      <div style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        margin: "22px 0",
      }}>
        <button
          style={tab === "purchases" ? primaryStyle : buttonStyle}
          onClick={() => setTab("purchases")}
        >
          فواتير المشتريات ({purchases.length})
        </button>

        <button
          style={tab === "suppliers" ? primaryStyle : buttonStyle}
          onClick={() => setTab("suppliers")}
        >
          الموردين ({suppliers.length})
        </button>
      </div>

      {/* SUPPLIERS */}
      {tab === "suppliers" && (
        <>
          <section style={panelStyle}>
            <h2 style={{ marginBottom: 20 }}>
              {editingSupplier ? "تعديل بيانات المورد" : "إضافة مورد جديد"}
            </h2>

            <form onSubmit={saveSupplier}>
              <div style={gridStyle}>
                {[
                  ["name", "اسم المورد *", true],
                  ["phone", "رقم الهاتف"],
                  ["address", "العنوان"],
                  ["notes", "ملاحظات"],
                ].map(([key, title, required]) => (
                  <div key={key} style={fieldStyle}>
                    <label style={labelStyle}>{title}</label>
                    <input
                      style={inputStyle}
                      required={!!required}
                      value={supplierForm[key]}
                      onChange={(e) =>
                        setSupplierForm((old) => ({
                          ...old,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button style={primaryStyle} disabled={saving}>
                  {saving
                    ? "جاري الحفظ..."
                    : editingSupplier
                    ? "حفظ التعديلات"
                    : "إضافة المورد"}
                </button>

                {editingSupplier && (
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={resetSupplierForm}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </section>

          <section style={panelStyle}>
            <h2 style={{ marginBottom: 18 }}>قائمة الموردين</h2>

            <div style={gridStyle}>
              {suppliers.map((supplier) => (
                <div key={supplier.id} style={cardStyle}>
                  <strong>{supplier.name}</strong>
                  <p style={{ marginTop: 10 }}>
                    الهاتف: {supplier.phone || "-"}
                  </p>
                  <p style={{ marginTop: 5 }}>
                    العنوان: {supplier.address || "-"}
                  </p>
                  <p style={{ marginTop: 5 }}>
                    الحالة: {supplier.is_active ? "نشط" : "معطل"}
                  </p>

                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button
                      style={buttonStyle}
                      onClick={() => startEditSupplier(supplier)}
                    >
                      تعديل
                    </button>
                    <button
                      style={buttonStyle}
                      disabled={saving}
                      onClick={() => toggleSupplier(supplier)}
                    >
                      {supplier.is_active ? "تعطيل" : "تفعيل"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* PURCHASES */}
      {tab === "purchases" && (
        <>
          {/* NEW INVOICE FORM */}
          <section style={panelStyle}>
            <h2 style={{ marginBottom: 8 }}>
              إنشاء فاتورة مشتريات جديدة
            </h2>

            <p style={{ color: "#aaa", fontSize: 13, marginBottom: 20 }}>
              رقم الفاتورة وتاريخ ووقت الإنشاء يتم تسجيلهم تلقائيًا عند الحفظ.
            </p>

            <form onSubmit={createPurchase}>
              <div style={gridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>المورد *</label>

                  <select
                    style={selectStyle}
                    required
                    value={purchaseForm.supplier_id}
                    onChange={(e) =>
                      setPurchaseForm((old) => ({
                        ...old,
                        supplier_id: e.target.value,
                      }))
                    }
                  >
                    <option style={optionStyle} value="">
                      اختر المورد
                    </option>

                    {suppliers.filter((s) => s.is_active).map((supplier) => (
                      <option
                        key={supplier.id}
                        value={supplier.id}
                        style={optionStyle}
                      >
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    اسم المندوب (اختياري)
                  </label>
                  <input
                    style={inputStyle}
                    value={purchaseForm.representative_name}
                    onChange={(e) =>
                      setPurchaseForm((old) => ({
                        ...old,
                        representative_name: e.target.value,
                      }))
                    }
                    placeholder="اسم الشخص الذي أحضر البضاعة"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>ملاحظات الفاتورة</label>
                  <input
                    style={inputStyle}
                    value={purchaseForm.notes}
                    onChange={(e) =>
                      setPurchaseForm((old) => ({
                        ...old,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="ملاحظات اختيارية"
                  />
                </div>
              </div>

              <div style={{
                marginTop: 24,
                marginBottom: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}>
                <h3>أصناف الفاتورة</h3>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={addLine}
                >
                  + إضافة صنف
                </button>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                {purchaseForm.items.map((line, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 16,
                      border: "1px solid #66533d",
                      borderRadius: 12,
                      background: "#33291f",
                    }}
                  >
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 14,
                    }}>
                      <strong>الصنف رقم {index + 1}</strong>

                      <button
                        type="button"
                        style={dangerStyle}
                        onClick={() => removeLine(index)}
                      >
                        حذف السطر
                      </button>
                    </div>

                    <div style={gridStyle}>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>الصنف *</label>

                        <select
                          style={selectStyle}
                          required
                          value={line.inventory_item_id}
                          onChange={(e) =>
                            updateLine(index, "inventory_item_id", e.target.value)
                          }
                        >
                          <option style={optionStyle} value="">
                            اختر الصنف
                          </option>

                          {/* عرض الأصناف النشطة فقط في الفواتير الجديدة */}
                          {items.filter((item) => item.is_active).map((item) => (
                            <option
                              key={item.id}
                              value={item.id}
                              style={optionStyle}
                            >
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={fieldStyle}>
                        <label style={labelStyle}>وحدة الشراء *</label>

                        <select
                          style={selectStyle}
                          required
                          value={line.input_unit_id}
                          onChange={(e) =>
                            updateLine(index, "input_unit_id", e.target.value)
                          }
                        >
                          <option style={optionStyle} value="">
                            اختر الوحدة
                          </option>

                          {compatibleUnits(line.inventory_item_id).map((unit) => (
                            <option
                              key={unit.id}
                              value={unit.id}
                              style={optionStyle}
                            >
                              {unit.name} ({unit.abbreviation})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={fieldStyle}>
                        <label style={labelStyle}>الكمية *</label>
                        <input
                          style={inputStyle}
                          type="number"
                          min="0.000001"
                          step="any"
                          required
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(index, "quantity", e.target.value)
                          }
                          placeholder="الكمية"
                        />
                      </div>

                      <div style={fieldStyle}>
                        <label style={labelStyle}>
                          سعر الوحدة بالجنيه *
                        </label>
                        <input
                          style={inputStyle}
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={line.unit_price}
                          onChange={(e) =>
                            updateLine(index, "unit_price", e.target.value)
                          }
                          placeholder="السعر"
                        />
                      </div>
                    </div>

                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 14,
                      padding: 12,
                      background: "#fff",
                      color: "#166534",
                      borderRadius: 8,
                    }}>
                      <strong>إجمالي الصنف</strong>
                      <strong>
                        {money(
                          Number(line.quantity || 0) *
                          Number(line.unit_price || 0)
                        )} جنيه
                      </strong>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                marginTop: 20,
                padding: 20,
                background: "#fff",
                color: "#1f2937",
                borderRadius: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}>
                <strong>إجمالي الفاتورة</strong>
                <strong style={{ fontSize: 25 }}>
                  {money(formTotal)} جنيه
                </strong>
              </div>

              <div style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 18,
              }}>
                <button style={primaryStyle} disabled={saving}>
                  {saving ? "جاري حفظ الفاتورة..." : "حفظ الفاتورة بالكامل"}
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  disabled={saving}
                  onClick={resetPurchaseForm}
                >
                  تفريغ النموذج
                </button>
              </div>
            </form>
          </section>

          {/* INVOICES LIST */}
          <section style={panelStyle}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 18,
            }}>
              <h2>فواتير المشتريات</h2>
              <span>
                عدد الفواتير: {filteredPurchases.length} من {purchases.length}
              </span>
            </div>

            {/* DATE SEARCH */}
            <div style={{
              padding: 18,
              borderRadius: 12,
              background: "#33291f",
              border: "1px solid #66533d",
              marginBottom: 20,
            }}>
              <h3 style={{ marginBottom: 15 }}>
                <span style={{ marginLeft: 8 }}>🔎</span>
                البحث بتاريخ الفاتورة
              </h3>

              <div style={gridStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>من تاريخ</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>إلى تاريخ</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              <div style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: 15,
              }}>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={clearDateFilter}
                  disabled={!dateFrom && !dateTo}
                >
                  مسح البحث وعرض الكل
                </button>

                <span style={{ color: "#ddd", fontSize: 13 }}>
                  {dateFrom || dateTo
                    ? `نتائج البحث: ${filteredPurchases.length} فاتورة`
                    : "اعرض كل الفواتير أو حدد فترة زمنية"}
                </span>
              </div>
            </div>

            {filteredPurchases.length === 0 ? (
              <p style={{ padding: 15 }}>
                {purchases.length === 0
                  ? "لا توجد فواتير حتى الآن."
                  : "لا توجد فواتير في الفترة المحددة."}
              </p>
            ) : (
              <div style={gridStyle}>
                {filteredPurchases.map((purchase) => (
                  <div key={purchase.id} style={cardStyle}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      flexWrap: "wrap",
                    }}>
                      <strong>
                        {purchase.invoice_number || `#${purchase.id}`}
                      </strong>

                      <span style={{
                        color: statusColor(purchase.status),
                        fontSize: 13,
                      }}>
                        {getStatus(purchase.status)}
                      </span>
                    </div>

                    <p style={{ marginTop: 12 }}>
                      المورد: {getSupplierName(purchase.supplier_id)}
                    </p>

                    <p style={{ marginTop: 6 }}>
                      المندوب: {purchase.representative_name || "-"}
                    </p>

                    <p style={{ marginTop: 6 }}>
                      التاريخ: {dateText(purchase.created_at)}
                    </p>

                    <div style={{
                      background: "#fff",
                      color: "#1f2937",
                      padding: 13,
                      borderRadius: 9,
                      marginTop: 14,
                    }}>
                      <p style={{ color: "#64748b", fontSize: 13 }}>
                        إجمالي الفاتورة
                      </p>

                      <h3 style={{ fontSize: 21, marginTop: 4 }}>
                        {money(purchase.total_amount)} جنيه
                      </h3>

                      <p style={{ marginTop: 8, color: "#15803d" }}>
                        المدفوع: {money(getPaid(purchase.id))} جنيه
                      </p>

                      <p style={{ marginTop: 5, color: "#be123c" }}>
                        المتبقي: {money(getRemaining(purchase))} جنيه
                      </p>
                    </div>

                    <p style={{
                      color: paymentColor(purchase),
                      fontWeight: 700,
                      marginTop: 12,
                    }}>
                      {getPaymentStatus(purchase)}
                    </p>

                    <div style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 14,
                    }}>
                      <button
                        style={primaryStyle}
                        onClick={() => setSelectedPurchase(purchase.id)}
                      >
                        التفاصيل والدفعات
                      </button>

                      <button
                        style={buttonStyle}
                        onClick={() => printPurchase(purchase)}
                      >
                        طباعة
                      </button>

                      {purchase.status === "draft" && (
                        <>
                          <button
                            style={primaryStyle}
                            disabled={saving}
                            onClick={() => receivePurchase(purchase)}
                          >
                            استلام
                          </button>

                          <button
                            style={dangerStyle}
                            disabled={saving}
                            onClick={() => cancelPurchase(purchase)}
                          >
                            إلغاء
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* INVOICE DETAILS */}
          {selectedPurchaseData && (
            <section style={panelStyle}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 20,
              }}>
                <div>
                  <h2>تفاصيل الفاتورة</h2>

                  <p style={{ marginTop: 8 }}>
                    رقم الفاتورة: {selectedPurchaseData.invoice_number || selectedPurchaseData.id}
                  </p>

                  <p style={{ marginTop: 5 }}>
                    المورد: {getSupplierName(selectedPurchaseData.supplier_id)}
                  </p>

                  <p style={{ marginTop: 5 }}>
                    المندوب: {selectedPurchaseData.representative_name || "-"}
                  </p>

                  <p style={{ marginTop: 5 }}>
                    تاريخ الإنشاء: {dateText(selectedPurchaseData.created_at)}
                  </p>
                </div>

                <button
                  style={buttonStyle}
                  onClick={() => setSelectedPurchase(null)}
                >
                  إغلاق
                </button>
              </div>

              <h3 style={{ marginBottom: 14 }}>الأصناف</h3>

              <div style={{ display: "grid", gap: 10 }}>
                {currentLines.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      ...cardStyle,
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div>
                      <strong>{getItemName(line.inventory_item_id)}</strong>

                      <p style={{ marginTop: 6, color: "#aaa" }}>
                        {line.quantity} {getUnitName(line.input_unit_id)}
                        {" × "}
                        {money(line.unit_price)} جنيه
                      </p>
                    </div>

                    <strong>{money(line.subtotal)} جنيه</strong>
                  </div>
                ))}
              </div>

              <div style={{
                background: "#fff",
                color: "#1f2937",
                padding: 18,
                borderRadius: 12,
                marginTop: 20,
              }}>
                <h3>ملخص الحساب</h3>

                <p style={{ marginTop: 12 }}>
                  إجمالي الفاتورة:{" "}
                  <strong>
                    {money(selectedPurchaseData.total_amount)} جنيه
                  </strong>
                </p>

                <p style={{ marginTop: 8, color: "#15803d" }}>
                  إجمالي المدفوع:{" "}
                  <strong>{money(selectedSummary?.paid_amount)} جنيه</strong>
                </p>

                <p style={{ marginTop: 8, color: "#be123c" }}>
                  المتبقي:{" "}
                  <strong>
                    {money(
                      selectedSummary?.remaining_amount ??
                      selectedPurchaseData.total_amount
                    )} جنيه
                  </strong>
                </p>

                <p style={{ marginTop: 8 }}>
                  حالة السداد:{" "}
                  <strong>{getPaymentStatus(selectedPurchaseData)}</strong>
                </p>
              </div>

              {/* PAYMENT FORM */}
              {selectedPurchaseData.status === "received" &&
                getRemaining(selectedPurchaseData) > 0 && (
                  <div style={{
                    marginTop: 22,
                    padding: 18,
                    borderRadius: 12,
                    background: "#33291f",
                    border: "1px solid #66533d",
                  }}>
                    <h3 style={{ marginBottom: 16 }}>
                      تسجيل دفعة جديدة
                    </h3>

                    <p style={{ color: "#ddd", marginBottom: 15 }}>
                      المتبقي على الفاتورة:{" "}
                      {money(getRemaining(selectedPurchaseData))} جنيه
                    </p>

                    <form onSubmit={addPayment}>
                      <div style={gridStyle}>
                        <div style={fieldStyle}>
                          <label style={labelStyle}>
                            المبلغ المدفوع *
                          </label>

                          <input
                            style={inputStyle}
                            type="number"
                            min="0.01"
                            max={getRemaining(selectedPurchaseData)}
                            step="0.01"
                            required
                            value={paymentForm.amount}
                            onChange={(e) =>
                              setPaymentForm((old) => ({
                                ...old,
                                amount: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div style={fieldStyle}>
                          <label style={labelStyle}>طريقة الدفع</label>

                          <select
                            style={selectStyle}
                            value={paymentForm.payment_method}
                            onChange={(e) =>
                              setPaymentForm((old) => ({
                                ...old,
                                payment_method: e.target.value,
                              }))
                            }
                          >
                            <option style={optionStyle} value="cash">
                              نقدي
                            </option>
                            <option style={optionStyle} value="bank_transfer">
                              تحويل بنكي
                            </option>
                            <option style={optionStyle} value="card">
                              بطاقة
                            </option>
                            <option style={optionStyle} value="other">
                              أخرى
                            </option>
                          </select>
                        </div>

                        <div style={fieldStyle}>
                          <label style={labelStyle}>ملاحظات</label>
                          <input
                            style={inputStyle}
                            value={paymentForm.notes}
                            onChange={(e) =>
                              setPaymentForm((old) => ({
                                ...old,
                                notes: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <button
                        style={{ ...primaryStyle, marginTop: 16 }}
                        disabled={saving}
                      >
                        {saving ? "جاري تسجيل الدفعة..." : "تسجيل الدفعة"}
                      </button>
                    </form>
                  </div>
                )}

              {/* PAYMENT HISTORY */}
              <div style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 14 }}>سجل الدفعات</h3>

                {currentPayments.length === 0 ? (
                  <p style={{ color: "#aaa" }}>
                    لم يتم تسجيل أي دفعات لهذه الفاتورة.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {currentPayments.map((payment) => (
                      <div key={payment.id} style={cardStyle}>
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 10,
                        }}>
                          <strong>{money(payment.amount)} جنيه</strong>
                          <span>{dateText(payment.payment_date)}</span>
                        </div>

                        <p style={{ marginTop: 7 }}>
                          طريقة الدفع: {payment.payment_method || "-"}
                        </p>

                        <p style={{ marginTop: 5 }}>
                          ملاحظات: {payment.notes || "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedPurchaseData.status === "draft" && (
                <p style={{ marginTop: 20, color: "#b7791f" }}>
                  هذه الفاتورة مسودة. يجب استلامها أولًا قبل تسجيل أي دفعة.
                </p>
              )}

              {selectedPurchaseData.status === "received" &&
                getRemaining(selectedPurchaseData) <= 0 && (
                  <p style={{
                    marginTop: 20,
                    color: "#15803d",
                    fontWeight: 700,
                  }}>
                    تم سداد الفاتورة بالكامل.
                  </p>
                )}

              <button
                style={{ ...buttonStyle, marginTop: 20 }}
                onClick={() => printPurchase(selectedPurchaseData)}
              >
                طباعة الفاتورة
              </button>
            </section>
          )}
        </>
      )}

      <div style={{ marginTop: 20, textAlign: "left" }}>
        <button
          style={buttonStyle}
          disabled={loading || saving}
          onClick={loadData}
        >
          تحديث البيانات
        </button>
      </div>
    </main>
  );
}
