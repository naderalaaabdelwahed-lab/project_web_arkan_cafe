"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const reportTypes = [
  { id: "movement", label: "حركة المخزون" },
  { id: "stock", label: "أرصدة المخزون" },
  { id: "low", label: "المخزون المنخفض" },
  { id: "consumption", label: "الاستهلاك" },
  { id: "purchases", label: "المشتريات" },
  { id: "waste", label: "الهالك" },
  { id: "valuation", label: "تقييم المخزون" },
];

const movementLabels = {
  purchase: "شراء",
  sale: "بيع",
  deduction: "خصم",
  waste: "هالك",
  adjustment: "تسوية",
  production_in: "إضافة إنتاج",
  production_out: "صرف إنتاج",
  return: "مرتجع",
  reversal: "عكس حركة",
};

const number = (value) => Number(value || 0);
const formatNumber = (value) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(number(value));
const formatMoney = (value) => `${formatNumber(value)} ج.م`;
const dateOnly = (value) => (value ? new Date(value).toLocaleDateString("ar-EG") : "—");
const todayISO = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const monthStart = () => `${todayISO().slice(0, 7)}-01`;

async function fetchAll(table, columns = "*") {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

function Table({ columns, rows, empty = "لا توجد بيانات للفترة المحددة" }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <colgroup>{columns.map((column) => <col key={column.label} style={{ width: column.width ? `${column.width}%` : `${100 / columns.length}%` }} />)}</colgroup>
        <thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? index}>
              {columns.map((column) => (
                <td key={column.label}>{column.render ? column.render(row) : (row[column.key] ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InventoryReportsPage() {
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [activeReport, setActiveReport] = useState("movement");
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [itemRows, unitRows, movementRows, purchaseRows, purchaseItemRows, supplierRows] =
        await Promise.all([
          fetchAll("inventory_items", "id,name,item_type,unit_id,current_stock,min_stock,unit_cost,is_active"),
          fetchAll("inventory_units", "id,name,abbreviation,base_unit_id"),
          fetchAll("inventory_movements", "id,inventory_item_id,movement_type,quantity,unit_cost,source_type,source_id,order_id,notes,created_by,created_at"),
          fetchAll("inventory_purchases", "id,supplier_id,invoice_number,status,purchase_date,total_amount,notes,representative_name"),
          fetchAll("inventory_purchase_items", "id,purchase_id,inventory_item_id,quantity,input_unit_id,unit_price,subtotal"),
          fetchAll("inventory_suppliers", "id,name"),
        ]);
      setItems(itemRows || []);
      setUnits(unitRows || []);
      setMovements(movementRows || []);
      setPurchases(purchaseRows || []);
      setPurchaseItems(purchaseItemRows || []);
      setSuppliers(supplierRows || []);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError?.message || "تعذر تحميل بيانات التقارير من قاعدة البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const itemMap = useMemo(() => new Map(items.map((item) => [Number(item.id), item])), [items]);
  const unitMap = useMemo(() => new Map(units.map((unit) => [Number(unit.id), unit])), [units]);
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [Number(supplier.id), supplier.name])), [suppliers]);
  const unitName = (item) => {
    const unit = unitMap.get(Number(item?.unit_id));
    return unit?.abbreviation || unit?.name || "—";
  };
  const itemName = (id) => itemMap.get(Number(id))?.name || "صنف غير معروف";
  const inDateRange = (value) => {
    if (!value) return false;
    const day = String(value).slice(0, 10);
    return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
  };
  const query = search.trim().toLocaleLowerCase("ar");

  const filteredMovements = useMemo(() => movements.filter((row) => {
    const item = itemMap.get(Number(row.inventory_item_id));
    const source = row.source_type === "purchase" ? `فاتورة شراء #${row.source_id || ""}`
      : row.order_id ? `أوردر #${row.order_id}` : row.source_type || "";
    const matchesSearch = !query || [item?.name, source, row.notes, movementLabels[row.movement_type]]
      .some((value) => String(value || "").toLocaleLowerCase("ar").includes(query));
    return inDateRange(row.created_at) && matchesSearch;
  }), [movements, itemMap, dateFrom, dateTo, query]);

  const filteredPurchases = useMemo(() => purchases.filter((purchase) => {
    const supplier = supplierMap.get(Number(purchase.supplier_id)) || "";
    const matchesSearch = !query || [purchase.invoice_number, supplier, purchase.representative_name, purchase.notes]
      .some((value) => String(value || "").toLocaleLowerCase("ar").includes(query));
    return inDateRange(purchase.purchase_date) && matchesSearch && purchase.status === "received";
  }), [purchases, supplierMap, dateFrom, dateTo, query]);

  const consumptionRows = filteredMovements.filter((row) =>
    ["sale", "deduction", "production_out"].includes(row.movement_type)
  );
  const wasteRows = filteredMovements.filter((row) => row.movement_type === "waste");
  const lowStockItems = items.filter((item) => item.is_active && number(item.current_stock) <= number(item.min_stock));
  const stockValue = items.filter((item) => item.is_active)
    .reduce((sum, item) => sum + number(item.current_stock) * number(item.unit_cost), 0);
  const purchaseValue = filteredPurchases.reduce((sum, purchase) => sum + number(purchase.total_amount), 0);
  const consumptionValue = consumptionRows.reduce((sum, row) => sum + Math.abs(number(row.quantity)) * number(row.unit_cost), 0);
  const wasteValue = wasteRows.reduce((sum, row) => sum + Math.abs(number(row.quantity)) * number(row.unit_cost), 0);

  const consumptionByItem = Object.values(consumptionRows.reduce((acc, row) => {
    const id = Number(row.inventory_item_id);
    const item = itemMap.get(id);
    if (!acc[id]) acc[id] = { id, name: item?.name || "صنف غير معروف", quantity: 0, value: 0, unit: unitName(item) };
    acc[id].quantity += Math.abs(number(row.quantity));
    acc[id].value += Math.abs(number(row.quantity)) * number(row.unit_cost);
    return acc;
  }, {})).sort((a, b) => b.value - a.value);

  const purchaseLines = filteredPurchases.flatMap((purchase) =>
    purchaseItems.filter((line) => Number(line.purchase_id) === Number(purchase.id))
      .map((line) => ({ ...line, purchase, item: itemMap.get(Number(line.inventory_item_id)) }))
  ).filter((line) => !query || [line.item?.name, line.purchase.invoice_number, supplierMap.get(Number(line.purchase.supplier_id))]
    .some((value) => String(value || "").toLocaleLowerCase("ar").includes(query)));

  const exportCSV = () => {
    let headers = [];
    let rows = [];
    if (activeReport === "movement") {
      headers = ["التاريخ", "الصنف", "نوع الحركة", "الكمية", "الوحدة", "المصدر", "ملاحظات"];
      rows = filteredMovements.map((row) => [row.created_at, itemName(row.inventory_item_id), movementLabels[row.movement_type] || row.movement_type, row.quantity, unitName(itemMap.get(Number(row.inventory_item_id))), row.source_type || "", row.notes || ""]);
    } else if (activeReport === "stock" || activeReport === "valuation") {
      headers = ["الصنف", "الرصيد", "الوحدة", "حد الطلب", "تكلفة الوحدة", "قيمة المخزون"];
      rows = items.filter((item) => item.is_active && (!query || item.name.toLocaleLowerCase("ar").includes(query)))
        .map((item) => [item.name, item.current_stock, unitName(item), item.min_stock, item.unit_cost, number(item.current_stock) * number(item.unit_cost)]);
    } else if (activeReport === "low") {
      headers = ["الصنف", "الرصيد الحالي", "حد الطلب", "الوحدة"];
      rows = lowStockItems.filter((item) => !query || item.name.toLocaleLowerCase("ar").includes(query))
        .map((item) => [item.name, item.current_stock, item.min_stock, unitName(item)]);
    } else if (activeReport === "consumption") {
      headers = ["الصنف", "الكمية المستهلكة", "الوحدة", "القيمة التقديرية"];
      rows = consumptionByItem.filter((row) => !query || row.name.toLocaleLowerCase("ar").includes(query))
        .map((row) => [row.name, row.quantity, row.unit, row.value]);
    } else if (activeReport === "purchases") {
      headers = ["التاريخ", "رقم الفاتورة", "المورد", "الصنف", "الكمية", "تكلفة الوحدة", "الإجمالي"];
      rows = purchaseLines.map((line) => [line.purchase.purchase_date, line.purchase.invoice_number, supplierMap.get(Number(line.purchase.supplier_id)) || "", line.item?.name || "", line.quantity, line.unit_price, line.subtotal]);
    } else {
      headers = ["التاريخ", "الصنف", "الكمية", "الوحدة", "القيمة", "ملاحظات"];
      rows = wasteRows.map((row) => [row.created_at, itemName(row.inventory_item_id), Math.abs(number(row.quantity)), unitName(itemMap.get(Number(row.inventory_item_id))), Math.abs(number(row.quantity)) * number(row.unit_cost), row.notes || ""]);
    }
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arkan-inventory-${activeReport}-${todayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredItems = items.filter((item) => item.is_active && (!query || item.name.toLocaleLowerCase("ar").includes(query)));
  const columns = activeReport === "movement" ? [
    { label: "التاريخ", width: 12, render: (row) => dateOnly(row.created_at) },
    { label: "الصنف", width: 20, render: (row) => itemName(row.inventory_item_id) },
    { label: "نوع الحركة", width: 13, render: (row) => movementLabels[row.movement_type] || row.movement_type },
    { label: "الكمية", width: 10, render: (row) => formatNumber(row.quantity) },
    { label: "الوحدة", width: 8, render: (row) => unitName(itemMap.get(Number(row.inventory_item_id))) },
    { label: "المصدر", width: 15, render: (row) => row.order_id ? `أوردر #${row.order_id}` : row.source_type === "purchase" ? `فاتورة #${row.source_id || ""}` : row.source_type || "—" },
    { label: "ملاحظات", width: 22, render: (row) => row.notes || "—" },
  ] : activeReport === "stock" || activeReport === "valuation" ? [
    { label: "الصنف", key: "name" },
    { label: "الرصيد", render: (row) => formatNumber(row.current_stock) },
    { label: "الوحدة", render: (row) => unitName(row) },
    { label: "حد الطلب", render: (row) => formatNumber(row.min_stock) },
    { label: "تكلفة الوحدة", render: (row) => formatMoney(row.unit_cost) },
    { label: "قيمة المخزون", render: (row) => formatMoney(number(row.current_stock) * number(row.unit_cost)) },
  ] : activeReport === "low" ? [
    { label: "الصنف", key: "name" },
    { label: "الرصيد الحالي", render: (row) => formatNumber(row.current_stock) },
    { label: "حد الطلب", render: (row) => formatNumber(row.min_stock) },
    { label: "الوحدة", render: (row) => unitName(row) },
  ] : activeReport === "consumption" ? [
    { label: "الصنف", key: "name" },
    { label: "الكمية المستهلكة", render: (row) => formatNumber(row.quantity) },
    { label: "الوحدة", key: "unit" },
    { label: "القيمة التقديرية", render: (row) => formatMoney(row.value) },
  ] : activeReport === "purchases" ? [
    { label: "التاريخ", width: 11, render: (row) => dateOnly(row.purchase.purchase_date) },
    { label: "الفاتورة", width: 14, render: (row) => row.purchase.invoice_number || `#${row.purchase.id}` },
    { label: "المورد", width: 15, render: (row) => supplierMap.get(Number(row.purchase.supplier_id)) || "—" },
    { label: "الصنف", width: 20, render: (row) => row.item?.name || "—" },
    { label: "الكمية", width: 10, render: (row) => formatNumber(row.quantity) },
    { label: "تكلفة الوحدة", width: 14, render: (row) => formatMoney(row.unit_price) },
    { label: "الإجمالي", width: 16, render: (row) => formatMoney(row.subtotal) },
  ] : [
    { label: "التاريخ", render: (row) => dateOnly(row.created_at) },
    { label: "الصنف", render: (row) => itemName(row.inventory_item_id) },
    { label: "الكمية", render: (row) => formatNumber(Math.abs(number(row.quantity))) },
    { label: "الوحدة", render: (row) => unitName(itemMap.get(Number(row.inventory_item_id))) },
    { label: "القيمة", render: (row) => formatMoney(Math.abs(number(row.quantity)) * number(row.unit_cost)) },
    { label: "ملاحظات", render: (row) => row.notes || "—" },
  ];

  const reportRows = activeReport === "movement" ? filteredMovements
    : activeReport === "stock" || activeReport === "valuation" ? filteredItems
    : activeReport === "low" ? lowStockItems.filter((item) => !query || item.name.toLocaleLowerCase("ar").includes(query))
    : activeReport === "consumption" ? consumptionByItem.filter((row) => !query || row.name.toLocaleLowerCase("ar").includes(query))
    : activeReport === "purchases" ? purchaseLines
    : wasteRows;

  const printReport = () => {
    const reportElement = document.querySelector(".inventory-reports .report");
    if (!reportElement) return;

    const printWindow = window.open("", "_blank", "width=1200,height=850");
    if (!printWindow) {
      window.alert("اسمح بفتح النوافذ المنبثقة من المتصفح حتى تتمكن من طباعة التقرير.");
      return;
    }

    const reportCopy = reportElement.cloneNode(true);
    reportCopy.querySelector(".report-actions")?.remove();
    const reportTitle = reportCopy.querySelector("h2")?.textContent || "تقرير المخزن";
    const printedAt = new Date();
    const dateTime = printedAt.toLocaleString("ar-EG", { dateStyle: "full", timeStyle: "short" });
    const period = dateFrom || dateTo
      ? `من ${dateFrom ? dateOnly(dateFrom) : "البداية"} إلى ${dateTo ? dateOnly(dateTo) : "اليوم"}`
      : "كل الفترات";
    const searchLabel = search.trim() ? `بحث: ${search.trim()}` : "بدون فلتر بحث";
    const summaryText = reportCopy.querySelector(".summary")?.textContent || `عدد السجلات: ${formatNumber(reportRows.length)}`;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${reportTitle} - مطعم أركان</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #172033; background: #fff; direction: rtl; font-family: Tahoma, Arial, sans-serif; }
            .print-sheet { width: 100%; }
            .brand { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:0 0 14px; border-bottom:3px solid #1e3a5f; }
            .brand-name { font-size:25px; font-weight:800; color:#17365d; margin:0 0 5px; }
            .brand-subtitle { margin:0; color:#64748b; font-size:11px; }
            .print-meta { text-align:left; color:#475569; font-size:10px; line-height:1.9; }
            .report-title { margin:18px 0 10px; font-size:19px; color:#172033; }
            .meta-strip { display:flex; flex-wrap:wrap; gap:8px 22px; padding:10px 12px; margin-bottom:14px; background:#f1f5f9; border:1px solid #d7dee8; border-radius:6px; font-size:11px; }
            .report { width:100%; padding:0; color:#172033; }
            .report-heading { display:none; }
            .table-wrap { width:100%; overflow:visible; border:0; }
            table { width:100% !important; min-width:100% !important; table-layout:fixed !important; border-collapse:collapse; text-align:right; direction:rtl; }
            col { width:auto; }
            th, td { padding:9px 10px; border:1px solid #aeb8c5; color:#172033; font-size:10pt; line-height:1.55; vertical-align:middle; white-space:normal; overflow-wrap:anywhere; word-break:normal; }
            th { background:#e8eef5 !important; color:#17365d; font-weight:700; }
            tbody tr:nth-child(even) td { background:#f7f9fc !important; }
            .empty, .summary { margin-top:12px; padding:11px; color:#172033; background:#f8fafc; border:1px solid #cbd5e1; }
            .summary strong { color:#17365d; }
            thead { display:table-header-group; }
            tr { break-inside:avoid; page-break-inside:avoid; }
            .print-footer { margin-top:16px; padding-top:8px; border-top:1px solid #cbd5e1; color:#64748b; font-size:9px; display:flex; justify-content:space-between; }
            @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
          </style>
        </head>
        <body>
          <main class="print-sheet">
            <header class="brand">
              <div><div class="brand-name">مطعم أركان</div><p class="brand-subtitle">إدارة المخزون والتقارير</p></div>
              <div class="print-meta"><div>تاريخ ووقت الطباعة: ${dateTime}</div><div>المكان: مطعم أركان</div></div>
            </header>
            <h1 class="report-title">${reportTitle}</h1>
            <div class="meta-strip"><span><strong>الفترة:</strong> ${period}</span><span><strong>الفلاتر:</strong> ${searchLabel}</span><span><strong>عدد السجلات:</strong> ${formatNumber(reportRows.length)}</span></div>
            ${reportCopy.outerHTML}
            <footer class="print-footer"><span>مطعم أركان - تقرير داخلي</span><span>تم إنشاء التقرير إلكترونيًا</span></footer>
          </main>
        </body>
      </html>`);
    printWindow.document.close();
    window.setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.focus();
        printWindow.print();
      }
    }, 700);
  };

  return (
    <main dir="rtl" className="inventory-reports">
      <header className="header">
        <div>
          <div className="breadcrumb">المخزن / التقارير</div>
          <h1>تقارير المخزن</h1>
          <p>التقارير مرتبطة مباشرة ببيانات المخزن في Supabase.</p>
        </div>
        <div className="actions">
          <button onClick={loadData} disabled={loading}>↻ تحديث البيانات</button>
          <button className="primary" onClick={exportCSV} disabled={loading}>تصدير CSV</button>
        </div>
      </header>

      {error && <div className="error"><strong>تعذر تحميل التقارير من قاعدة البيانات</strong><span>{error}</span><small>تأكد من تسجيل الدخول وامتلاك صلاحية قراءة المخزن أو التقارير.</small></div>}

      <section className="filters">
        <label>من تاريخ<input type="date" value={dateFrom} max={dateTo || todayISO()} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>إلى تاريخ<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label className="search">بحث<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن صنف أو فاتورة..." /></label>
        <button onClick={() => { setDateFrom(""); setDateTo(""); setSearch(""); }}>كل الفترات</button>
      </section>

      <section className="stats">
        <article><span>عدد الأصناف النشطة</span><strong>{formatNumber(items.filter((item) => item.is_active).length)}</strong></article>
        <article><span>حركات الفترة</span><strong>{formatNumber(filteredMovements.length)}</strong></article>
        <article><span>قيمة المشتريات</span><strong>{formatMoney(purchaseValue)}</strong></article>
        <article><span>قيمة المخزون الحالي</span><strong>{formatMoney(stockValue)}</strong></article>
      </section>

      <nav className="tabs">{reportTypes.map((report) => <button key={report.id} className={activeReport === report.id ? "active" : ""} onClick={() => setActiveReport(report.id)}>{report.label}</button>)}</nav>

      <section className="report">
        <div className="report-heading">
          <div><h2>{reportTypes.find((report) => report.id === activeReport)?.label}</h2><p>{loading ? "جارٍ تحميل البيانات..." : `عدد السجلات: ${formatNumber(reportRows.length)}`}</p></div>
          <div className="report-actions">
            <span>{lastUpdated ? `آخر تحديث: ${lastUpdated.toLocaleTimeString("ar-EG")}` : ""}</span>
            <button className="print-button" onClick={printReport} disabled={loading || !!error || !reportRows.length}>🖨️ طباعة التقرير</button>
          </div>
        </div>
        {loading ? <div className="empty">جارٍ تحميل بيانات التقارير من قاعدة البيانات...</div> : !error ? <Table columns={columns} rows={reportRows} /> : null}
        {activeReport === "consumption" && !loading && !error && <p className="summary">إجمالي قيمة الاستهلاك التقديرية للفترة: <strong>{formatMoney(consumptionValue)}</strong></p>}
        {activeReport === "waste" && !loading && !error && <p className="summary">إجمالي قيمة الهالك التقديرية للفترة: <strong>{formatMoney(wasteValue)}</strong></p>}
        {activeReport === "purchases" && !loading && !error && <p className="summary">إجمالي فواتير المشتريات للفترة: <strong>{formatMoney(purchaseValue)}</strong></p>}
        {activeReport === "low" && !loading && !error && <p className="summary">عدد الأصناف عند حد الطلب أو أقل: <strong>{formatNumber(lowStockItems.length)}</strong></p>}
      </section>

      <style jsx global>{`
        .inventory-reports .table-wrap {
          display: block;
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          border: 1px solid #3b4960;
          border-radius: 12px;
          background: #0f172a;
        }
        .inventory-reports .table-wrap table {
          display: table;
          width: 100% !important;
          min-width: 100% !important;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed !important;
          direction: rtl;
          text-align: right;
        }
        .inventory-reports .table-wrap th,
        .inventory-reports .table-wrap td {
          box-sizing: border-box;
          padding: 15px 14px;
          border-bottom: 1px solid #334155;
          border-left: 1px solid #293548;
          min-width: 0;
          font-size: 14px;
          line-height: 1.85;
          text-align: right;
          vertical-align: middle;
          white-space: normal !important;
          overflow-wrap: anywhere;
          word-break: normal;
        }
        .inventory-reports .table-wrap th {
          background: #26364d;
          color: #fff;
          font-weight: 800;
          font-size: 13px;
          letter-spacing: .1px;
        }
        .inventory-reports .table-wrap td { color: #e5edf8; }
        .inventory-reports .table-wrap tbody tr:nth-child(even) td { background: #172438; }
        .inventory-reports .table-wrap tbody tr:hover td { background: #20324b; }
        .inventory-reports .table-wrap tbody tr:last-child td { border-bottom: 0; }
        .inventory-reports .table-wrap th:last-child,
        .inventory-reports .table-wrap td:last-child { border-left: 0; }
        .inventory-reports .table-wrap tbody tr { height: 58px; }
        @media (max-width: 750px) {
          .inventory-reports .table-wrap table { min-width: 760px !important; }
        }
      `}</style>
      <style jsx>{`
        .inventory-reports{color:#f8fafc;padding:12px 0 40px;direction:rtl}
        .header,.report-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
        .header{margin-bottom:22px}.breadcrumb{color:#94a3b8;font-size:13px;margin-bottom:7px}
        h1{font-size:27px;margin:0 0 7px;font-weight:900}p{color:#aebbd0;margin:0;font-size:13px;line-height:1.8}
        .actions{display:flex;gap:9px}button{border:1px solid #39465a;background:#202b3c;color:#f8fafc;padding:10px 14px;border-radius:9px;font-weight:700;cursor:pointer}
        button:disabled{opacity:.5;cursor:not-allowed}.actions .primary{background:#244cc5;border-color:#244cc5}
        .filters,.report,.stats article,.tabs{background:#111827;border:1px solid #293548;border-radius:13px}
        .filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:17px;margin-bottom:17px}
        label{display:flex;flex-direction:column;gap:7px;color:#cbd5e1;font-size:12px;font-weight:700;min-width:155px;flex:1}
        input{background:#0b1220;border:1px solid #3b4960;color:white;border-radius:8px;padding:10px;min-height:40px}
        .search{flex:2}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:17px}
        .stats article{padding:16px;display:flex;flex-direction:column;gap:9px}.stats span{font-size:12px;color:#aebbd0}.stats strong{font-size:20px}
        .tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px;margin-bottom:17px}.tabs button.active{background:#244cc5;border-color:#244cc5}
        .report{padding:22px}.report-heading{margin-bottom:20px;align-items:flex-start}.report-heading h2{font-size:20px;margin:0 0 7px;font-weight:900}
        .report-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.report-heading span{font-size:12px;color:#94a3b8}
        .print-button{background:#14532d;border-color:#166534;padding:10px 16px}
        .table-wrap{display:block;width:100%;max-width:100%;overflow-x:auto;border:1px solid #3b4960;border-radius:10px}
        table{display:table;width:100% !important;min-width:100% !important;border-collapse:collapse;table-layout:fixed;text-align:right;direction:rtl}
        col{width:auto}
        th,td{padding:17px 16px;border-bottom:1px solid #334155;border-left:1px solid #293548;font-size:14px;line-height:1.9;vertical-align:middle;text-align:right;min-width:0}
        th{background:#202b3c;color:#f1f5f9;font-size:14px;font-weight:900;white-space:normal}
        td{color:#f1f5f9;white-space:normal;overflow-wrap:anywhere;word-break:normal;min-width:0}
        th:last-child,td:last-child{border-left:0}
        tbody tr{min-height:58px}
        tbody tr:nth-child(even){background:#172235}tbody tr:hover{background:#1e293b}
        tbody tr:last-child td{border-bottom:0}
        .empty{padding:35px;text-align:center;color:#cbd5e1}.error{display:flex;flex-direction:column;gap:7px;background:#451a1a;border:1px solid #991b1b;border-radius:10px;padding:14px;margin-bottom:15px;color:#fecaca}
        .error span{overflow-wrap:anywhere;font-size:13px}.error small{color:#fca5a5}.summary{margin-top:15px;background:#172554;padding:13px;border-radius:9px}.summary strong{color:#fff}
        @media(max-width:750px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.header{align-items:flex-start}.actions{width:100%}.actions button{flex:1}.report{padding:14px}.report-actions{width:100%;justify-content:space-between}}
        @media(max-width:450px){.stats{grid-template-columns:1fr 1fr}.stats article{padding:11px}.stats strong{font-size:15px}.filters{align-items:stretch}label{min-width:100%}}
      `}</style>
    </main>
  );
}
