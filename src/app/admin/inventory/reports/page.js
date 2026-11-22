
"use client";

import { useMemo, useState } from "react";

// بيانات تجريبية - سيتم ربطها بقاعدة البيانات لاحقًا
const inventoryItems = [
  { id: 1, name: "دقيق", currentStock: 5000, minStock: 2000, unit: "جم", unitCost: 0.035 },
  { id: 2, name: "عجين فطير", currentStock: 20, minStock: 10, unit: "قطعة", unitCost: 18 },
  { id: 3, name: "موزاريلا", currentStock: 10, minStock: 8, unit: "كجم", unitCost: 220 },
  { id: 4, name: "جبنة رومي", currentStock: 5, minStock: 6, unit: "كجم", unitCost: 180 },
  { id: 5, name: "خضار فطير", currentStock: 4, minStock: 5, unit: "كجم", unitCost: 65 },
  { id: 6, name: "فراخ", currentStock: 0, minStock: 3, unit: "كجم", unitCost: 150 },
  { id: 7, name: "زيت", currentStock: 12000, minStock: 3000, unit: "مللي", unitCost: 0.09 },
  { id: 8, name: "سكر", currentStock: 1500, minStock: 1000, unit: "جم", unitCost: 0.04 },
];

const movements = [
  { id: 1, date: "2026-11-01", itemId: 1, type: "purchase", quantity: 3000, source: "مورد الدقيق", employee: "أحمد", notes: "شراء دقيق", unitCost: 0.035 },
  { id: 2, date: "2026-11-02", itemId: 2, type: "production_in", quantity: 15, source: "الإنتاج", employee: "محمد", notes: "إنتاج عجين", unitCost: 18 },
  { id: 3, date: "2026-11-03", itemId: 3, type: "purchase", quantity: 5, source: "مورد الألبان", employee: "أحمد", notes: "شراء موزاريلا", unitCost: 220 },
  { id: 4, date: "2026-11-04", itemId: 1, type: "production_out", quantity: -1200, source: "المطبخ", employee: "محمد", notes: "صرف للإنتاج", unitCost: 0.035 },
  { id: 5, date: "2026-11-05", itemId: 4, type: "purchase", quantity: 3, source: "مورد الجبن", employee: "أحمد", notes: "شراء جبنة رومي", unitCost: 180 },
  { id: 6, date: "2026-11-06", itemId: 5, type: "waste", quantity: -2, source: "المطبخ", employee: "محمود", notes: "تلف بعض الخضار", unitCost: 65 },
  { id: 7, date: "2026-11-07", itemId: 6, type: "purchase", quantity: 5, source: "مورد الفراخ", employee: "أحمد", notes: "شراء فراخ", unitCost: 150 },
  { id: 8, date: "2026-11-08", itemId: 7, type: "purchase", quantity: 5000, source: "مورد الزيوت", employee: "أحمد", notes: "شراء زيت", unitCost: 0.09 },
  { id: 9, date: "2026-11-09", itemId: 2, type: "sale", quantity: -4, source: "المبيعات", employee: "محمد", notes: "صرف مبيعات", unitCost: 18 },
  { id: 10, date: "2026-11-10", itemId: 3, type: "production_out", quantity: -2, source: "المطبخ", employee: "محمود", notes: "استخدام في الإنتاج", unitCost: 220 },
  { id: 11, date: "2026-11-11", itemId: 1, type: "purchase", quantity: 2000, source: "مورد الدقيق", employee: "أحمد", notes: "شراء دقيق", unitCost: 0.035 },
  { id: 12, date: "2026-11-12", itemId: 4, type: "sale", quantity: -1, source: "المبيعات", employee: "محمد", notes: "صرف مبيعات", unitCost: 180 },
  { id: 13, date: "2026-11-13", itemId: 6, type: "waste", quantity: -1, source: "المطبخ", employee: "محمود", notes: "تلف فراخ", unitCost: 150 },
  { id: 14, date: "2026-11-14", itemId: 5, type: "purchase", quantity: 4, source: "مورد الخضار", employee: "أحمد", notes: "شراء خضار", unitCost: 65 },
  { id: 15, date: "2026-11-15", itemId: 7, type: "production_out", quantity: -1500, source: "المطبخ", employee: "محمد", notes: "استخدام زيت", unitCost: 0.09 },
  { id: 16, date: "2026-11-16", itemId: 8, type: "purchase", quantity: 1000, source: "مورد السكر", employee: "أحمد", notes: "شراء سكر", unitCost: 0.04 },
  { id: 17, date: "2026-11-17", itemId: 2, type: "sale", quantity: -3, source: "المبيعات", employee: "محمد", notes: "صرف مبيعات", unitCost: 18 },
  { id: 18, date: "2026-11-18", itemId: 3, type: "waste", quantity: -1, source: "المطبخ", employee: "محمود", notes: "تلف جزء من الجبنة", unitCost: 220 },
  { id: 19, date: "2026-11-19", itemId: 1, type: "production_out", quantity: -800, source: "المطبخ", employee: "محمد", notes: "صرف للإنتاج", unitCost: 0.035 },
  { id: 20, date: "2026-11-20", itemId: 6, type: "purchase", quantity: 3, source: "مورد الفراخ", employee: "أحمد", notes: "شراء فراخ", unitCost: 150 },
  { id: 21, date: "2026-11-21", itemId: 2, type: "deduction", quantity: -2, source: "المطبخ", employee: "محمود", notes: "استخدام داخلي", unitCost: 18 },
  { id: 22, date: "2026-11-22", itemId: 7, type: "sale", quantity: -500, source: "المبيعات", employee: "محمد", notes: "صرف زيت", unitCost: 0.09 },
];

const reportTypes = [
  { id: "movement", label: "حركة المخزون", icon: "↕", description: "عرض جميع حركات الإضافة والخصم خلال الفترة المحددة." },
  { id: "stock", label: "أرصدة المخزون", icon: "▤", description: "عرض الرصيد الحالي لجميع أصناف المخزن." },
  { id: "low", label: "المخزون المنخفض", icon: "⚠", description: "الأصناف التي وصلت إلى حد إعادة الطلب أو أقل." },
  { id: "consumption", label: "الاستهلاك", icon: "◉", description: "متابعة كميات وقيمة الأصناف المستهلكة." },
  { id: "purchases", label: "المشتريات", icon: "＋", description: "تفاصيل عمليات الشراء خلال الفترة المحددة." },
  { id: "waste", label: "الهالك", icon: "⌁", description: "متابعة كميات وقيمة الأصناف التالفة." },
  { id: "valuation", label: "تقييم المخزون", icon: "ج", description: "حساب القيمة المالية الحالية للمخزون." },
];

const typeLabels = {
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

const formatNumber = (value) =>
  new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatCurrency = (value) => `${formatNumber(value)} ج.م`;

const formatDate = (date) => {
  if (!date) return "-";
  return new Date(`${date}T00:00:00`).toLocaleDateString("ar-EG");
};

const getToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const getMonthStart = () => `${getToday().slice(0, 7)}-01`;

function StatCard({ title, value, subtitle, icon, color = "blue" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <div className="stat-content">
        <span className="stat-title">{title}</span>
        <strong>{value}</strong>
        <small>{subtitle}</small>
      </div>
    </div>
  );
}

function ReportTable({ columns, rows, emptyMessage = "لا توجد بيانات لعرضها" }) {
  if (!rows.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">▤</div>
        <strong>{emptyMessage}</strong>
        <p>لا توجد سجلات مطابقة للفترة المحددة.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? index}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : row[column.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InventoryReportsPage() {
  const today = getToday();

  const [activeReport, setActiveReport] = useState("movement");
  const [dateFrom, setDateFrom] = useState(getMonthStart());
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");

  const itemNameFor = (id) =>
    inventoryItems.find((item) => item.id === id)?.name || "غير معروف";

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const matchesFrom = !dateFrom || movement.date >= dateFrom;
      const matchesTo = !dateTo || movement.date <= dateTo;

      const item = inventoryItems.find(
        (product) => product.id === movement.itemId
      );

      const searchText = search.trim().toLowerCase();

      const matchesSearch =
        !searchText ||
        item?.name.toLowerCase().includes(searchText) ||
        movement.employee.toLowerCase().includes(searchText) ||
        movement.source.toLowerCase().includes(searchText) ||
        movement.notes.toLowerCase().includes(searchText);

      return matchesFrom && matchesTo && matchesSearch;
    });
  }, [dateFrom, dateTo, search]);

  const reportData = useMemo(() => {
    const purchases = filteredMovements.filter(
      (movement) => movement.type === "purchase"
    );

    const consumption = filteredMovements.filter((movement) =>
      ["sale", "deduction", "production_out"].includes(movement.type)
    );

    const waste = filteredMovements.filter(
      (movement) => movement.type === "waste"
    );

    const totalPurchaseValue = purchases.reduce(
      (sum, movement) =>
        sum + Math.abs(movement.quantity) * movement.unitCost,
      0
    );

    const totalConsumptionValue = consumption.reduce(
      (sum, movement) =>
        sum + Math.abs(movement.quantity) * movement.unitCost,
      0
    );

    const totalWasteValue = waste.reduce(
      (sum, movement) =>
        sum + Math.abs(movement.quantity) * movement.unitCost,
      0
    );

    const totalStockValue = inventoryItems.reduce(
      (sum, item) => sum + item.currentStock * item.unitCost,
      0
    );

    const lowStock = inventoryItems.filter(
      (item) => item.currentStock <= item.minStock
    );

    const consumptionByItem = inventoryItems
      .map((item) => {
        const itemMovements = consumption.filter(
          (movement) => movement.itemId === item.id
        );

        const quantity = itemMovements.reduce(
          (sum, movement) => sum + Math.abs(movement.quantity),
          0
        );

        return {
          id: item.id,
          name: item.name,
          quantity,
          unit: item.unit,
          value: itemMovements.reduce(
            (sum, movement) =>
              sum + Math.abs(movement.quantity) * movement.unitCost,
            0
          ),
        };
      })
      .filter((item) => item.quantity > 0)
      .sort((a, b) => b.value - a.value);

    return {
      purchases,
      consumption,
      waste,
      totalPurchaseValue,
      totalConsumptionValue,
      totalWasteValue,
      totalStockValue,
      lowStock,
      consumptionByItem,
    };
  }, [filteredMovements]);

  const selectedReport = reportTypes.find(
    (report) => report.id === activeReport
  );

  const totalItems = inventoryItems.length;
  const totalMovements = filteredMovements.length;

  const handleReset = () => {
    setDateFrom(getMonthStart());
    setDateTo(today);
    setSearch("");
  };

  const handleAllPeriod = () => {
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  const handleQuickPeriod = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));

    const toISO = (date) => {
      const offset = date.getTimezoneOffset();
      return new Date(date.getTime() - offset * 60000)
        .toISOString()
        .slice(0, 10);
    };

    setDateFrom(toISO(start));
    setDateTo(toISO(end));
    setSearch("");
  };

  const exportCSV = () => {
    let rows = [];
    let headers = [];

    if (activeReport === "movement") {
      headers = ["التاريخ", "الصنف", "نوع الحركة", "الكمية", "الوحدة", "المصدر", "الموظف", "ملاحظات"];

      rows = filteredMovements.map((m) => {
        const item = inventoryItems.find((i) => i.id === m.itemId);
        return [
          m.date,
          itemNameFor(m.itemId),
          typeLabels[m.type],
          m.quantity,
          item?.unit,
          m.source,
          m.employee,
          m.notes,
        ];
      });
    } else if (activeReport === "stock") {
      headers = ["الصنف", "الرصيد", "الوحدة", "حد الطلب", "الحالة", "تكلفة الوحدة", "قيمة المخزون"];

      rows = inventoryItems.map((item) => [
        item.name,
        item.currentStock,
        item.unit,
        item.minStock,
        item.currentStock <= item.minStock ? "منخفض" : "متوفر",
        item.unitCost,
        item.currentStock * item.unitCost,
      ]);
    } else if (activeReport === "low") {
      headers = ["الصنف", "الرصيد الحالي", "حد الطلب", "العجز", "الوحدة"];

      rows = reportData.lowStock.map((item) => [
        item.name,
        item.currentStock,
        item.minStock,
        Math.max(item.minStock - item.currentStock, 0),
        item.unit,
      ]);
    } else if (activeReport === "consumption") {
      headers = ["الصنف", "الكمية المستهلكة", "الوحدة", "التكلفة التقديرية"];

      rows = reportData.consumptionByItem.map((item) => [
        item.name,
        item.quantity,
        item.unit,
        item.value,
      ]);
    } else if (activeReport === "purchases") {
      headers = ["التاريخ", "الصنف", "الكمية", "الوحدة", "تكلفة الوحدة", "الإجمالي", "المورد", "الموظف"];

      rows = reportData.purchases.map((m) => {
        const item = inventoryItems.find((i) => i.id === m.itemId);
        return [
          m.date,
          itemNameFor(m.itemId),
          m.quantity,
          item?.unit,
          m.unitCost,
          m.quantity * m.unitCost,
          m.source,
          m.employee,
        ];
      });
    } else if (activeReport === "waste") {
      headers = ["التاريخ", "الصنف", "الكمية", "الوحدة", "القيمة", "الملاحظات", "الموظف"];

      rows = reportData.waste.map((m) => {
        const item = inventoryItems.find((i) => i.id === m.itemId);
        return [
          m.date,
          itemNameFor(m.itemId),
          Math.abs(m.quantity),
          item?.unit,
          Math.abs(m.quantity) * m.unitCost,
          m.notes,
          m.employee,
        ];
      });
    } else if (activeReport === "valuation") {
      headers = ["الصنف", "الرصيد الحالي", "الوحدة", "تكلفة الوحدة", "قيمة المخزون"];

      rows = inventoryItems.map((item) => [
        item.name,
        item.currentStock,
        item.unit,
        item.unitCost,
        item.currentStock * item.unitCost,
      ]);
    }

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `inventory-${activeReport}-${today}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const movementColumns = [
    {
      key: "date",
      label: "التاريخ",
      render: (row) => formatDate(row.date),
    },
    {
      key: "item",
      label: "الصنف",
      render: (row) => itemNameFor(row.itemId),
    },
    {
      key: "type",
      label: "نوع الحركة",
      render: (row) => (
        <span className={`status-badge ${row.quantity > 0 ? "success" : "warning"}`}>
          {typeLabels[row.type]}
        </span>
      ),
    },
    {
      key: "quantity",
      label: "الكمية",
      render: (row) => (
        <span className={row.quantity > 0 ? "positive" : "negative"}>
          {row.quantity > 0 ? "+" : ""}
          {formatNumber(row.quantity)}
        </span>
      ),
    },
    {
      key: "unit",
      label: "الوحدة",
      render: (row) =>
        inventoryItems.find((item) => item.id === row.itemId)?.unit || "-",
    },
    { key: "source", label: "المصدر" },
    { key: "employee", label: "الموظف" },
    { key: "notes", label: "ملاحظات" },
  ];

  const purchaseRows = reportData.purchases.map((m) => ({
    ...m,
    itemName: itemNameFor(m.itemId),
    unit: inventoryItems.find((i) => i.id === m.itemId)?.unit,
    total: m.quantity * m.unitCost,
  }));

  const wasteRows = reportData.waste.map((m) => ({
    ...m,
    itemName: itemNameFor(m.itemId),
    unit: inventoryItems.find((i) => i.id === m.itemId)?.unit,
    total: Math.abs(m.quantity) * m.unitCost,
  }));

  return (
    <main className="inventory-reports" dir="rtl">
      <div className="page-header">
        <div>
          <div className="breadcrumb">المخزن / التقارير</div>
          <h1>تقارير المخزن</h1>
          <p>تابع حركة المخزون والأرصدة والمشتريات والاستهلاك والهالك.</p>
        </div>

        <div className="header-actions">
          <button className="btn btn-light" onClick={() => window.print()}>
            <span>▧</span>
            طباعة التقرير
          </button>

          <button className="btn btn-primary" onClick={exportCSV}>
            <span>⇩</span>
            تصدير Excel / CSV
          </button>
        </div>
      </div>

      <section className="filter-panel">
        <div className="filter-heading">
          <div>
            <h3>الفترة الزمنية</h3>
            <p>حدد تاريخ البداية والنهاية لعرض بيانات التقارير المطلوبة.</p>
          </div>

          <button className="reset-btn" onClick={handleReset}>
            ↻ إعادة تعيين
          </button>
        </div>

        <div className="filter-controls">
          <label className="date-field">
            <span>من تاريخ</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || today}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>

          <label className="date-field">
            <span>إلى تاريخ</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              max={today}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>

          <div className="quick-filters">
            <button onClick={() => handleQuickPeriod(7)}>آخر 7 أيام</button>
            <button onClick={() => handleQuickPeriod(30)}>آخر 30 يوم</button>
            <button onClick={handleAllPeriod}>كل الفترات</button>
          </div>
        </div>

        <div className="filter-footer">
          <span>
            <span className="live-dot" />
            يتم تحديث التقارير تلقائيًا عند تغيير التاريخ
          </span>

          <span className="selected-period">
            {dateFrom || "بداية البيانات"} — {dateTo || "حتى الآن"}
          </span>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          title="قيمة المخزون الحالية"
          value={formatCurrency(reportData.totalStockValue)}
          subtitle="إجمالي قيمة الأرصدة الحالية"
          icon="▤"
          color="blue"
        />

        <StatCard
          title="عدد الأصناف"
          value={formatNumber(totalItems)}
          subtitle="إجمالي الأصناف المسجلة"
          icon="▦"
          color="purple"
        />

        <StatCard
          title="أصناف منخفضة"
          value={formatNumber(reportData.lowStock.length)}
          subtitle="تحتاج إلى إعادة طلب"
          icon="⚠"
          color="orange"
        />

        <StatCard
          title="إجمالي الحركات"
          value={formatNumber(totalMovements)}
          subtitle="داخل الفترة المحددة"
          icon="↕"
          color="green"
        />
      </section>

      <section className="report-tabs">
        <div className="section-heading">
          <div>
            <h2>أنواع التقارير</h2>
            <p>اختر التقرير الذي تريد عرضه.</p>
          </div>
        </div>

        <div className="tabs-list">
          {reportTypes.map((report) => (
            <button
              key={report.id}
              onClick={() => setActiveReport(report.id)}
              className={`report-tab ${activeReport === report.id ? "active" : ""}`}
            >
              <span className="tab-icon">{report.icon}</span>
              {report.label}
            </button>
          ))}
        </div>
      </section>

      <section className="report-content">
        <div className="report-header">
          <div>
            <h2>{selectedReport?.label}</h2>
            <p>{selectedReport?.description}</p>
          </div>

          <div className="report-search">
            <span>⌕</span>
            <input
              type="text"
              placeholder="ابحث في التقرير..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {activeReport === "movement" && (
          <>
            <div className="mini-stats">
              <div>
                <span>عدد الحركات</span>
                <strong>{formatNumber(filteredMovements.length)}</strong>
              </div>

              <div>
                <span>حركات الإضافة</span>
                <strong className="positive">
                  {formatNumber(filteredMovements.filter((m) => m.quantity > 0).length)}
                </strong>
              </div>

              <div>
                <span>حركات الخصم</span>
                <strong className="negative">
                  {formatNumber(filteredMovements.filter((m) => m.quantity < 0).length)}
                </strong>
              </div>
            </div>

            <ReportTable columns={movementColumns} rows={filteredMovements} />
          </>
        )}

        {activeReport === "stock" && (
          <ReportTable
            columns={[
              { key: "name", label: "اسم الصنف" },
              {
                key: "currentStock",
                label: "الرصيد الحالي",
                render: (r) => formatNumber(r.currentStock),
              },
              { key: "unit", label: "الوحدة" },
              {
                key: "minStock",
                label: "حد الطلب",
                render: (r) => formatNumber(r.minStock),
              },
              {
                key: "status",
                label: "الحالة",
                render: (r) => (
                  <span className={`status-badge ${r.currentStock <= r.minStock ? "danger" : "success"}`}>
                    {r.currentStock <= r.minStock ? "مخزون منخفض" : "متوفر"}
                  </span>
                ),
              },
              {
                key: "unitCost",
                label: "تكلفة الوحدة",
                render: (r) => formatCurrency(r.unitCost),
              },
              {
                key: "value",
                label: "قيمة المخزون",
                render: (r) => formatCurrency(r.currentStock * r.unitCost),
              },
            ]}
            rows={inventoryItems.filter((item) =>
              !search || item.name.toLowerCase().includes(search.toLowerCase())
            )}
          />
        )}

        {activeReport === "low" && (
          <>
            <div className="alert-banner">
              <span className="alert-icon">⚠</span>

              <div>
                <strong>تنبيه المخزون</strong>
                <p>الأصناف التالية وصلت إلى حد الطلب أو أصبحت أقل منه.</p>
              </div>

              <strong>{reportData.lowStock.length} أصناف</strong>
            </div>

            <ReportTable
              columns={[
                { key: "name", label: "اسم الصنف" },
                {
                  key: "currentStock",
                  label: "الرصيد الحالي",
                  render: (r) => formatNumber(r.currentStock),
                },
                {
                  key: "minStock",
                  label: "حد الطلب",
                  render: (r) => formatNumber(r.minStock),
                },
                {
                  key: "shortage",
                  label: "الكمية المطلوبة",
                  render: (r) =>
                    formatNumber(Math.max(r.minStock - r.currentStock, 0)),
                },
                { key: "unit", label: "الوحدة" },
                {
                  key: "status",
                  label: "الحالة",
                  render: (r) => (
                    <span className="status-badge danger">
                      {r.currentStock === 0 ? "نفد المخزون" : "يحتاج إعادة طلب"}
                    </span>
                  ),
                },
              ]}
              rows={reportData.lowStock.filter((item) =>
                !search || item.name.toLowerCase().includes(search.toLowerCase())
              )}
            />
          </>
        )}

        {activeReport === "consumption" && (
          <>
            <div className="mini-stats">
              <div>
                <span>إجمالي قيمة الاستهلاك</span>
                <strong>{formatCurrency(reportData.totalConsumptionValue)}</strong>
              </div>

              <div>
                <span>عدد الأصناف المستهلكة</span>
                <strong>{reportData.consumptionByItem.length}</strong>
              </div>

              <div>
                <span>عدد حركات الاستهلاك</span>
                <strong>{reportData.consumption.length}</strong>
              </div>
            </div>

            <div className="chart-panel">
              <h3>الاستهلاك حسب الصنف</h3>

              {reportData.consumptionByItem.length ? (
                <div className="bars-list">
                  {reportData.consumptionByItem.map((item) => {
                    const maxValue = Math.max(
                      ...reportData.consumptionByItem.map((x) => x.value),
                      1
                    );

                    return (
                      <div className="bar-row" key={item.id}>
                        <span className="bar-label">{item.name}</span>

                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${(item.value / maxValue) * 100}%`,
                            }}
                          />
                        </div>

                        <strong>{formatCurrency(item.value)}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">لا توجد بيانات استهلاك.</div>
              )}
            </div>

            <ReportTable
              columns={[
                { key: "name", label: "الصنف" },
                {
                  key: "quantity",
                  label: "الكمية المستهلكة",
                  render: (r) => formatNumber(r.quantity),
                },
                { key: "unit", label: "الوحدة" },
                {
                  key: "value",
                  label: "التكلفة التقديرية",
                  render: (r) => formatCurrency(r.value),
                },
              ]}
              rows={reportData.consumptionByItem.filter((item) =>
                !search || item.name.toLowerCase().includes(search.toLowerCase())
              )}
            />
          </>
        )}

        {activeReport === "purchases" && (
          <>
            <div className="mini-stats">
              <div>
                <span>عدد عمليات الشراء</span>
                <strong>{reportData.purchases.length}</strong>
              </div>

              <div>
                <span>إجمالي المشتريات</span>
                <strong>{formatCurrency(reportData.totalPurchaseValue)}</strong>
              </div>

              <div>
                <span>عدد الأصناف المشتراة</span>
                <strong>
                  {new Set(reportData.purchases.map((m) => m.itemId)).size}
                </strong>
              </div>
            </div>

            <ReportTable
              columns={[
                {
                  key: "date",
                  label: "التاريخ",
                  render: (r) => formatDate(r.date),
                },
                { key: "itemName", label: "الصنف" },
                {
                  key: "quantity",
                  label: "الكمية",
                  render: (r) => formatNumber(r.quantity),
                },
                { key: "unit", label: "الوحدة" },
                {
                  key: "unitCost",
                  label: "تكلفة الوحدة",
                  render: (r) => formatCurrency(r.unitCost),
                },
                {
                  key: "total",
                  label: "الإجمالي",
                  render: (r) => formatCurrency(r.total),
                },
                { key: "source", label: "المورد" },
                { key: "employee", label: "الموظف" },
              ]}
              rows={purchaseRows.filter((r) =>
                !search || r.itemName.toLowerCase().includes(search.toLowerCase())
              )}
            />
          </>
        )}

        {activeReport === "waste" && (
          <>
            <div className="mini-stats">
              <div>
                <span>عدد حركات الهالك</span>
                <strong>{reportData.waste.length}</strong>
              </div>

              <div>
                <span>إجمالي تكلفة الهالك</span>
                <strong className="negative">
                  {formatCurrency(reportData.totalWasteValue)}
                </strong>
              </div>

              <div>
                <span>عدد الأصناف المتأثرة</span>
                <strong>
                  {new Set(reportData.waste.map((m) => m.itemId)).size}
                </strong>
              </div>
            </div>

            <ReportTable
              columns={[
                {
                  key: "date",
                  label: "التاريخ",
                  render: (r) => formatDate(r.date),
                },
                { key: "itemName", label: "الصنف" },
                {
                  key: "quantity",
                  label: "الكمية",
                  render: (r) => formatNumber(Math.abs(r.quantity)),
                },
                { key: "unit", label: "الوحدة" },
                {
                  key: "total",
                  label: "قيمة الهالك",
                  render: (r) => formatCurrency(r.total),
                },
                { key: "notes", label: "السبب / الملاحظات" },
                { key: "employee", label: "الموظف" },
              ]}
              rows={wasteRows.filter((r) =>
                !search || r.itemName.toLowerCase().includes(search.toLowerCase())
              )}
            />
          </>
        )}

        {activeReport === "valuation" && (
          <>
            <div className="valuation-card">
              <div>
                <span>إجمالي القيمة الحالية للمخزون</span>
                <strong>{formatCurrency(reportData.totalStockValue)}</strong>
                <small>بناءً على الرصيد الحالي وتكلفة الوحدة</small>
              </div>

              <div className="valuation-icon">ج.م</div>
            </div>

            <ReportTable
              columns={[
                { key: "name", label: "الصنف" },
                {
                  key: "currentStock",
                  label: "الرصيد الحالي",
                  render: (r) => formatNumber(r.currentStock),
                },
                { key: "unit", label: "الوحدة" },
                {
                  key: "unitCost",
                  label: "تكلفة الوحدة",
                  render: (r) => formatCurrency(r.unitCost),
                },
                {
                  key: "value",
                  label: "قيمة المخزون",
                  render: (r) => formatCurrency(r.currentStock * r.unitCost),
                },
              ]}
              rows={inventoryItems.filter((item) =>
                !search || item.name.toLowerCase().includes(search.toLowerCase())
              )}
            />
          </>
        )}

        <div className="report-footer">
          <span>
            عدد السجلات المعروضة:{" "}
            {formatNumber(
              activeReport === "movement"
                ? filteredMovements.length
                : activeReport === "purchases"
                ? purchaseRows.filter((r) =>
                    !search || r.itemName.toLowerCase().includes(search.toLowerCase())
                  ).length
                : activeReport === "waste"
                ? wasteRows.filter((r) =>
                    !search || r.itemName.toLowerCase().includes(search.toLowerCase())
                  ).length
                : activeReport === "low"
                ? reportData.lowStock.filter((r) =>
                    !search || r.name.toLowerCase().includes(search.toLowerCase())
                  ).length
                : activeReport === "consumption"
                ? reportData.consumptionByItem.filter((r) =>
                    !search || r.name.toLowerCase().includes(search.toLowerCase())
                  ).length
                : inventoryItems.filter((r) =>
                    !search || r.name.toLowerCase().includes(search.toLowerCase())
                  ).length
            )}
          </span>

          <span>آخر تحديث: {formatDate(today)}</span>
        </div>
      </section>

      <style jsx>{`
        .inventory-reports {
          direction: rtl;
          width: 100%;
          padding: 10px 0 40px;
          color: #ffffff;
          font-family: inherit;
          background: #000000;
          color-scheme: dark;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 25px;
          flex-wrap: wrap;
        }

        .breadcrumb {
          color: #9ca3af;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 9px;
        }

        .page-header h1 {
          color: #ffffff;
          font-size: 28px;
          font-weight: 900;
          margin: 0 0 8px;
          letter-spacing: -0.5px;
        }

        .page-header p,
        .section-heading p,
        .report-header p,
        .filter-heading p {
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 500;
          margin: 0;
          line-height: 1.8;
        }

        .header-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .btn {
          border: 1px solid #374151;
          border-radius: 10px;
          padding: 11px 17px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          gap: 8px;
          align-items: center;
          transition: 0.2s;
        }

        .btn-light {
          color: #ffffff;
          background: #1f2937;
          border-color: #374151;
        }

        .btn-light:hover {
          background: #374151;
        }

        .btn-primary {
          color: #ffffff;
          background: #244cc5;
          border-color: #244cc5;
        }

        .btn-primary:hover {
          background: #193ba5;
        }

        .filter-panel,
        .report-tabs,
        .report-content {
          background: #111111;
          border: 1px solid #303030;
          border-radius: 15px;
          padding: 22px;
          margin-bottom: 20px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        }

        .filter-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .filter-heading h3,
        .section-heading h2,
        .report-header h2 {
          color: #ffffff;
          font-size: 17px;
          margin: 0 0 7px;
          font-weight: 900;
        }

        .reset-btn {
          background: #1e293b;
          color: #93c5fd;
          border: 1px solid #334155;
          border-radius: 9px;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 800;
          font-size: 12px;
        }

        .reset-btn:hover {
          background: #263449;
        }

        .filter-controls {
          display: flex;
          align-items: end;
          gap: 15px;
          flex-wrap: wrap;
        }

        .date-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 180px;
          flex: 1;
        }

        .date-field span {
          color: #e5e7eb;
          font-size: 13px;
          font-weight: 800;
        }

        .date-field input,
        .report-search input {
          background: #1f1f1f;
          color: #ffffff;
          border: 1px solid #444444;
          border-radius: 9px;
          padding: 12px;
          outline: none;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          width: 100%;
          box-sizing: border-box;
          color-scheme: dark;
        }

        .date-field input:focus,
        .report-search input:focus {
          border-color: #3157d5;
          box-shadow: 0 0 0 3px rgba(49, 87, 213, 0.2);
        }

        .quick-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .quick-filters button {
          background: #222222;
          border: 1px solid #3b3b3b;
          color: #e5e7eb;
          border-radius: 9px;
          padding: 11px 13px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .quick-filters button:hover {
          background: #263449;
          color: #93c5fd;
          border-color: #526b9c;
        }

        .filter-footer {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          border-top: 1px solid #303030;
          padding-top: 14px;
          margin-top: 18px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 600;
        }

        .live-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          margin-left: 7px;
        }

        .selected-period {
          color: #93c5fd;
          font-weight: 800;
        }

        /* Statistics Cards */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 14px;
          background: #111111;
          border: 1px solid #303030;
          border-radius: 14px;
          padding: 19px;
          min-width: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
          transition: 0.2s;
        }

        .stat-card:hover {
          transform: translateY(-3px);
          background: #191919;
          border-color: #4b5563;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
        }

        .stat-icon {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          font-size: 21px;
          font-weight: 900;
          flex-shrink: 0;
        }

        .stat-icon.blue {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .stat-icon.purple {
          background: #ede9fe;
          color: #6d28d9;
        }

        .stat-icon.orange {
          background: #ffedd5;
          color: #c2410c;
        }

        .stat-icon.green {
          background: #dcfce7;
          color: #15803d;
        }

        .stat-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .stat-title {
          font-size: 12px;
          color: #ffffff;
          font-weight: 800;
        }

        .stat-content strong {
          color: #ffffff;
          font-size: 20px;
          font-weight: 900;
          overflow-wrap: anywhere;
        }

        .stat-content small {
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 600;
        }

        .section-heading {
          margin-bottom: 17px;
        }

        .tabs-list {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
        }

        .report-tab {
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid #3b3b3b;
          background: #1c1c1c;
          color: #e5e7eb;
          padding: 11px 15px;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          font-size: 12px;
          font-weight: 800;
          transition: 0.2s;
        }

        .report-tab:hover {
          background: #263449;
          border-color: #526b9c;
          color: #bfdbfe;
        }

        .report-tab.active {
          background: #244cc5;
          color: #ffffff;
          border-color: #244cc5;
          box-shadow: 0 4px 10px rgba(36, 76, 197, 0.25);
        }

        .tab-icon {
          font-size: 16px;
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          flex-wrap: wrap;
          margin-bottom: 21px;
        }

        .report-search {
          position: relative;
          width: 260px;
        }

        .report-search span {
          position: absolute;
          right: 12px;
          top: 9px;
          font-size: 19px;
          color: #cbd5e1;
        }

        .report-search input {
          padding-right: 37px;
        }

        .report-search input::placeholder {
          color: #9ca3af;
          font-weight: 500;
        }

        .mini-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 13px;
          margin-bottom: 19px;
        }

        .mini-stats > div {
          padding: 16px;
          background: #1b1b1b;
          border: 1px solid #353535;
          border-radius: 11px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .mini-stats span {
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 700;
        }

        .mini-stats strong {
          color: #ffffff;
          font-size: 19px;
          font-weight: 900;
        }

        .positive {
          color: #22c55e !important;
          font-weight: 900;
        }

        .negative {
          color: #f87171 !important;
          font-weight: 900;
        }

        .table-wrapper {
          width: 100%;
          overflow-x: auto;
          border: 1px solid #383838;
          border-radius: 11px;
          background: #111111;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 750px;
          text-align: right;
        }

        th {
          background: #252525;
          color: #ffffff;
          padding: 15px 14px;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
          border-bottom: 1px solid #404040;
        }

        td {
          color: #e5e7eb;
          padding: 14px;
          font-size: 12px;
          font-weight: 600;
          border-top: 1px solid #303030;
          white-space: nowrap;
        }

        tbody tr:nth-child(even) {
          background: #191919;
        }

        tbody tr:hover {
          background: #262626;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 900;
        }

        .status-badge.success {
          background: #14532d;
          color: #bbf7d0;
        }

        .status-badge.warning {
          background: #713f12;
          color: #fde68a;
        }

        .status-badge.danger {
          background: #7f1d1d;
          color: #fecaca;
        }

        .alert-banner {
          display: flex;
          align-items: center;
          gap: 14px;
          background: #422006;
          border: 1px solid #854d0e;
          border-radius: 11px;
          padding: 15px;
          margin-bottom: 18px;
        }

        .alert-icon {
          font-size: 24px;
          color: #fbbf24;
        }

        .alert-banner div {
          flex: 1;
        }

        .alert-banner strong {
          font-size: 13px;
          color: #fde68a;
          font-weight: 900;
        }

        .alert-banner p {
          font-size: 12px;
          color: #fef3c7;
          margin: 5px 0 0;
        }

        .chart-panel {
          border: 1px solid #383838;
          border-radius: 12px;
          padding: 19px;
          margin-bottom: 19px;
          background: #171717;
        }

        .chart-panel h3 {
          color: #ffffff;
          font-size: 15px;
          font-weight: 900;
          margin: 0 0 21px;
        }

        .bars-list {
          display: flex;
          flex-direction: column;
          gap: 17px;
        }

        .bar-row {
          display: grid;
          grid-template-columns: 100px minmax(80px, 1fr) 110px;
          gap: 12px;
          align-items: center;
        }

        .bar-label {
          font-size: 12px;
          color: #e5e7eb;
          font-weight: 700;
        }

        .bar-track {
          height: 11px;
          background: #333333;
          border-radius: 20px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          background: #3157d5;
          border-radius: 20px;
          min-width: 2px;
        }

        .bar-row strong {
          color: #ffffff;
          font-size: 11px;
          font-weight: 900;
          text-align: left;
        }

        .valuation-card {
          background: #172554;
          border: 1px solid #263f78;
          border-radius: 13px;
          padding: 22px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 19px;
        }

        .valuation-card div:first-child {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .valuation-card span {
          font-size: 13px;
          color: #dbeafe;
          font-weight: 800;
        }

        .valuation-card strong {
          color: #ffffff;
          font-size: 28px;
          font-weight: 900;
        }

        .valuation-card small {
          color: #bfdbfe;
          font-size: 11px;
          font-weight: 600;
        }

        .valuation-icon {
          width: 58px;
          height: 58px;
          border-radius: 14px;
          background: #d6e1ff;
          color: #193ba5;
          display: grid;
          place-items: center;
          font-size: 17px;
          font-weight: 900;
        }

        .empty-state {
          text-align: center;
          padding: 45px 15px;
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 600;
        }

        .empty-icon {
          font-size: 34px;
          margin-bottom: 13px;
          color: #9ca3af;
        }

        .empty-state strong {
          display: block;
          color: #ffffff;
          font-weight: 900;
          margin-bottom: 7px;
        }

        .empty-state p {
          color: #9ca3af;
          margin: 0;
          font-size: 12px;
        }

        .report-footer {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 600;
          padding-top: 16px;
          margin-top: 18px;
          border-top: 1px solid #303030;
        }

        @media (max-width: 1000px) {
          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 650px) {
          .page-header {
            align-items: flex-start;
          }

          .page-header h1 {
            font-size: 23px;
          }

          .header-actions {
            width: 100%;
          }

          .header-actions button {
            flex: 1;
            justify-content: center;
          }

          .filter-panel,
          .report-tabs,
          .report-content {
            padding: 15px;
          }

          .filter-heading {
            align-items: flex-start;
          }

          .filter-controls {
            flex-direction: column;
            align-items: stretch;
          }

          .date-field {
            width: 100%;
          }

          .quick-filters {
            width: 100%;
          }

          .quick-filters button {
            flex: 1;
          }

          .stats-grid {
            grid-template-columns: 1fr 1fr;
            gap: 9px;
          }

          .stat-card {
            padding: 12px 9px;
            gap: 8px;
          }

          .stat-icon {
            width: 36px;
            height: 36px;
            font-size: 16px;
          }

          .stat-content strong {
            font-size: 15px;
          }

          .stat-content small {
            font-size: 9px;
          }

          .tabs-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .report-tab {
            justify-content: center;
            padding: 10px 6px;
            font-size: 11px;
          }

          .report-search {
            width: 100%;
          }

          .mini-stats {
            grid-template-columns: 1fr;
          }

          .bar-row {
            grid-template-columns: 75px minmax(50px, 1fr) 80px;
            gap: 7px;
          }

          .bar-label {
            font-size: 10px;
          }

          .bar-row strong {
            font-size: 9px;
          }

          .valuation-card strong {
            font-size: 21px;
          }
        }

        @media print {
          .header-actions,
          .filter-panel,
          .report-tabs,
          .report-search,
          .reset-btn {
            display: none !important;
          }

          .inventory-reports {
            background: #ffffff;
            color: #000000;
          }

          .report-content,
          .stat-card {
            box-shadow: none;
            break-inside: avoid;
          }

          .table-wrapper {
            overflow: visible;
          }

          table {
            min-width: 100%;
          }

          th,
          td {
            font-size: 10px;
            padding: 7px;
          }
        }
      `}</style>
    </main>
  );
}
