
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const sections = [
  { title: "الخامات والمنتجات", href: "/admin/inventory/items", icon: "📦" },
  { title: "الوصفات", href: "/admin/inventory/recipes", icon: "📋" },
  { title: "المشتريات والموردين", href: "/admin/inventory/purchases", icon: "🚚" },
  { title: "حركة المخزون", href: "/admin/inventory/movements", icon: "🔄" },
  { title: "تقارير المخزون", href: "/admin/inventory/reports", icon: "📊" },
];

const formatNumber = (number) =>
  new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(Number(number) || 0);

const formatCurrency = (number) => `${formatNumber(number)} ج.م`;

const formatDate = (date) =>
  new Date(date).toLocaleDateString("ar-EG");

const getLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPeriodRange = (period, startDate, endDate) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start;
  let end = today;

  switch (period) {
    case "today":
      start = today;
      break;

    case "yesterday":
      start = new Date(today);
      start.setDate(start.getDate() - 1);
      end = new Date(start);
      break;

    case "7":
      start = new Date(today);
      start.setDate(start.getDate() - 6);
      break;

    case "30":
      start = new Date(today);
      start.setDate(start.getDate() - 29);
      break;

    case "month":
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;

    case "previous":
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;

    case "custom": {
      const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
      const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

      start = new Date(startYear, startMonth - 1, startDay);
      end = new Date(endYear, endMonth - 1, endDay);
      break;
    }

    default:
      start = new Date(today);
      start.setDate(start.getDate() - 29);
  }

  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    start: start.toISOString(),
    end: endExclusive.toISOString(),
    startLabel: getLocalDate(start),
    endLabel: getLocalDate(end),
  };
};

// جلب كل النتائج حتى لو عددها أكبر من 1000
const fetchAllRows = async (createQuery) => {
  const allRows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await createQuery().range(
      from,
      from + pageSize - 1
    );

    if (error) throw error;

    allRows.push(...(data || []));

    if (!data || data.length < pageSize) break;
  }

  return allRows;
};

const fieldStyle = {
  width: "100%",
  minHeight: "44px",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#fff",
  color: "#111827",
  fontSize: "15px",
  outline: "none",
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

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [period, setPeriod] = useState("30");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [appliedPeriod, setAppliedPeriod] = useState("30");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const range = getPeriodRange(
        appliedPeriod,
        appliedStartDate,
        appliedEndDate
      );

      const [itemsData, movementsData, purchasesData] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from("inventory_items")
            .select(
              "id, name, item_type, current_stock, min_stock, unit_cost, is_active"
            )
            .order("id")
        ),

        fetchAllRows(() =>
          supabase
            .from("inventory_movements")
            .select(
              "id, inventory_item_id, movement_type, quantity, created_at, notes"
            )
            .gte("created_at", range.start)
            .lt("created_at", range.end)
            .order("created_at", { ascending: false })
        ),

        fetchAllRows(() =>
          supabase
            .from("inventory_purchases")
            .select("id, total_amount, purchase_date, status")
            .gte("purchase_date", range.start)
            .lt("purchase_date", range.end)
            .order("purchase_date", { ascending: false })
        ),
      ]);

      setItems(itemsData || []);
      setMovements(movementsData || []);
      setPurchases(purchasesData || []);
    } catch (err) {
      console.error("Inventory dashboard error:", err);
      setError(
        err?.message ||
          "حصلت مشكلة أثناء تحميل بيانات لوحة تحكم المخزن."
      );
    } finally {
      setLoading(false);
    }
  }, [appliedPeriod, appliedStartDate, appliedEndDate]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = useMemo(() => {
    const activeItems = items.filter((item) => item.is_active === true);
    const inactiveItems = items.filter((item) => item.is_active !== true);

    const outOfStockItems = activeItems.filter(
      (item) => Number(item.current_stock) <= 0
    );

    const lowStockItems = activeItems.filter((item) => {
      const stock = Number(item.current_stock) || 0;
      const minimum = Number(item.min_stock) || 0;

      return stock > 0 && minimum > 0 && stock <= minimum;
    });

    const attentionItems = activeItems.filter((item) => {
      const stock = Number(item.current_stock) || 0;
      const minimum = Number(item.min_stock) || 0;

      return stock <= 0 || (minimum > 0 && stock <= minimum);
    });

    const inventoryValue = activeItems.reduce((total, item) => {
      const stock = Number(item.current_stock) || 0;
      const cost = Number(item.unit_cost) || 0;

      return total + stock * cost;
    }, 0);

    const purchaseValue = purchases.reduce(
      (total, purchase) =>
        total + (Number(purchase.total_amount) || 0),
      0
    );

    return {
      total: items.length,
      active: activeItems.length,
      inactive: inactiveItems.length,
      lowStock: lowStockItems.length,
      outOfStock: outOfStockItems.length,
      inventoryValue,
      raw: activeItems.filter((item) => item.item_type === "raw").length,
      finished: activeItems.filter(
        (item) => item.item_type === "finished"
      ).length,
      attentionItems,
      movementCount: movements.length,
      purchaseCount: purchases.length,
      purchaseValue,
    };
  }, [items, movements, purchases]);

  const movementTypes = useMemo(() => {
    const grouped = {};

    movements.forEach((movement) => {
      const type = movement.movement_type || "غير محدد";
      grouped[type] = (grouped[type] || 0) + 1;
    });

    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [movements]);

  const itemNames = useMemo(() => {
    return Object.fromEntries(items.map((item) => [item.id, item.name]));
  }, [items]);

  const applyPeriod = () => {
    if (period === "custom") {
      if (!startDate || !endDate) {
        alert("اختار تاريخ البداية والنهاية.");
        return;
      }

      if (startDate > endDate) {
        alert("تاريخ البداية لازم يكون قبل تاريخ النهاية.");
        return;
      }
    }

    setAppliedPeriod(period);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  const resetPeriod = () => {
    setPeriod("30");
    setStartDate("");
    setEndDate("");
    setAppliedPeriod("30");
    setAppliedStartDate("");
    setAppliedEndDate("");
  };

  const periodLabel = () => {
    if (appliedPeriod === "custom") {
      return `${appliedStartDate} إلى ${appliedEndDate}`;
    }

    const labels = {
      today: "اليوم",
      yesterday: "أمس",
      "7": "آخر 7 أيام",
      "30": "آخر 30 يوم",
      month: "الشهر الحالي",
      previous: "الشهر السابق",
    };

    return labels[appliedPeriod] || "آخر 30 يوم";
  };

  const statCards = [
    {
      title: "إجمالي الأصناف",
      value: stats.total,
      icon: "📦",
      description: "كل الأصناف المسجلة",
    },
    {
      title: "الأصناف النشطة",
      value: stats.active,
      icon: "✅",
      description: "الأصناف المتاحة",
    },
    {
      title: "مخزون منخفض",
      value: stats.lowStock,
      icon: "⚠️",
      description: "أصناف وصلت للحد الأدنى",
    },
    {
      title: "نفد المخزون",
      value: stats.outOfStock,
      icon: "🚨",
      description: "أصناف رصيدها صفر أو أقل",
    },
  ];

  return (
    <main className="inventory-dashboard" dir="rtl">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">ARKAN INVENTORY</p>
          <h1>لوحة تحكم المخزن</h1>
          <p>نظرة عامة على الأصناف والأرصدة والتنبيهات.</p>
        </div>

        <button
          onClick={fetchDashboard}
          disabled={loading}
          style={{
            ...buttonStyle,
            background: "#b88946",
            color: "#fff",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "جاري التحديث..." : "↻ تحديث البيانات"}
        </button>
      </header>

      {/* Date Filter */}
      <section className="admin-panel dashboard-panel">
        <div className="dashboard-heading">
          <div>
            <h2>فلترة الفترة الزمنية</h2>
            <p>حدد الفترة لمراجعة حركات المخزون والمشتريات.</p>
          </div>

          <span className="dashboard-date">
            {new Date().toLocaleDateString("ar-EG")}
          </span>
        </div>

        <div className="dashboard-filter">
          <div className="dashboard-field">
            <label>الفترة الزمنية</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={fieldStyle}
            >
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="7">آخر 7 أيام</option>
              <option value="30">آخر 30 يوم</option>
              <option value="month">الشهر الحالي</option>
              <option value="previous">الشهر السابق</option>
              <option value="custom">فترة مخصصة</option>
            </select>
          </div>

          {period === "custom" && (
            <>
              <div className="dashboard-field">
                <label>من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={fieldStyle}
                />
              </div>

              <div className="dashboard-field">
                <label>إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </>
          )}

          <button
            onClick={applyPeriod}
            style={{
              ...buttonStyle,
              background: "#b88946",
              color: "#fff",
            }}
          >
            تطبيق
          </button>

          <button
            onClick={resetPeriod}
            style={{
              ...buttonStyle,
              background: "#e2e8f0",
              color: "#334155",
            }}
          >
            إعادة تعيين
          </button>
        </div>

        <p className="dashboard-period">
          الفترة المحددة: {periodLabel()}
        </p>
      </section>

      {error && <div className="dashboard-error">{error}</div>}

      {/* Inventory Statistics */}
      <section className="dashboard-section">
        <div className="dashboard-section-title">
          <h2>ملخص المخزون الحالي</h2>
          <p>إحصائيات الأصناف المسجلة في النظام.</p>
        </div>

        <div className="dashboard-stats">
          {statCards.map((card, index) => (
            <div className="admin-stat-card dashboard-stat" key={card.title}>
              <div className="dashboard-stat-top">
                <span className="dashboard-icon">{card.icon}</span>
                <span className={`dashboard-number-label number-${index}`}>
                  {card.title}
                </span>
              </div>

              <h2>{loading ? "..." : formatNumber(card.value)}</h2>
              <p>{card.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Extra Statistics */}
      <section className="dashboard-extra">
        <div className="admin-panel dashboard-info-card">
          <span>💰 قيمة المخزون التقديرية</span>
          <h2>{loading ? "..." : formatCurrency(stats.inventoryValue)}</h2>
          <p>الرصيد الحالي × تكلفة الوحدة المسجلة.</p>
        </div>

        <div className="admin-panel dashboard-info-card">
          <span>🥬 الخامات النشطة</span>
          <h2>{loading ? "..." : formatNumber(stats.raw)}</h2>
          <p>عدد أصناف الخامات.</p>
        </div>

        <div className="admin-panel dashboard-info-card">
          <span>🍽️ المنتجات الجاهزة</span>
          <h2>{loading ? "..." : formatNumber(stats.finished)}</h2>
          <p>عدد المنتجات الجاهزة.</p>
        </div>

        <div className="admin-panel dashboard-info-card">
          <span>⏸️ الأصناف غير النشطة</span>
          <h2>{loading ? "..." : formatNumber(stats.inactive)}</h2>
          <p>الأصناف التي تم تعطيلها.</p>
        </div>
      </section>

      {/* Low Stock Alerts */}
      <section className="admin-panel dashboard-panel">
        <div className="dashboard-heading">
          <div>
            <h2>تنبيهات المخزون</h2>
            <p>الأصناف التي تحتاج إلى متابعة أو إعادة شراء.</p>
          </div>

          <Link href="/admin/inventory/items" className="dashboard-link">
            كل الأصناف ←
          </Link>
        </div>

        {loading ? (
          <p>جاري تحميل البيانات...</p>
        ) : stats.attentionItems.length === 0 ? (
          <div className="dashboard-empty">
            <span>✅</span>
            <p>لا توجد أصناف تحتاج إلى متابعة حاليًا.</p>
          </div>
        ) : (
          <div className="dashboard-table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الرصيد الحالي</th>
                  <th>الحد الأدنى</th>
                  <th>الحالة</th>
                </tr>
              </thead>

              <tbody>
                {stats.attentionItems.slice(0, 10).map((item) => {
                  const stock = Number(item.current_stock) || 0;
                  const minimum = Number(item.min_stock) || 0;
                  const outOfStock = stock <= 0;

                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{formatNumber(stock)}</td>
                      <td>{formatNumber(minimum)}</td>
                      <td>
                        <span
                          className={
                            outOfStock ? "status-danger" : "status-warning"
                          }
                        >
                          {outOfStock ? "نفد المخزون" : "مخزون منخفض"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Movements */}
      <section className="dashboard-section">
        <div className="dashboard-section-title">
          <h2>حركة المخزون</h2>
          <p>الحركات المسجلة خلال الفترة المحددة.</p>
        </div>

        <div className="dashboard-extra">
          <div className="admin-panel dashboard-info-card">
            <span>🔄 إجمالي الحركات</span>
            <h2>{loading ? "..." : formatNumber(stats.movementCount)}</h2>
            <p>عدد الحركات المسجلة خلال الفترة.</p>
            <Link href="/admin/inventory/movements" className="dashboard-link">
              عرض الحركات ←
            </Link>
          </div>

          <div className="admin-panel dashboard-info-card">
            <span>📋 أنواع الحركات</span>
            <h2>{loading ? "..." : formatNumber(movementTypes.length)}</h2>
            <p>عدد أنواع الحركات المسجلة خلال الفترة.</p>
          </div>
        </div>

        <div className="admin-panel dashboard-panel">
          <h3>تفاصيل أنواع الحركات</h3>

          {loading ? (
            <p>جاري تحميل البيانات...</p>
          ) : movementTypes.length === 0 ? (
            <div className="dashboard-empty">
              <p>لا توجد حركات مخزون خلال الفترة المحددة.</p>
            </div>
          ) : (
            <div className="dashboard-table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>نوع الحركة</th>
                    <th>عدد الحركات</th>
                  </tr>
                </thead>
                <tbody>
                  {movementTypes.map(([type, count]) => (
                    <tr key={type}>
                      <td>{type}</td>
                      <td>{formatNumber(count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-panel dashboard-panel">
          <div className="dashboard-heading">
            <h3>أحدث الحركات</h3>
            <Link href="/admin/inventory/movements" className="dashboard-link">
              كل الحركات ←
            </Link>
          </div>

          {loading ? (
            <p>جاري تحميل البيانات...</p>
          ) : movements.length === 0 ? (
            <div className="dashboard-empty">
              <p>لا توجد حركات مسجلة خلال الفترة المحددة.</p>
            </div>
          ) : (
            <div className="dashboard-table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>نوع الحركة</th>
                    <th>الكمية</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 10).map((movement) => (
                    <tr key={movement.id}>
                      <td>
                        {itemNames[movement.inventory_item_id] || "صنف غير معروف"}
                      </td>
                      <td>{movement.movement_type}</td>
                      <td>{formatNumber(movement.quantity)}</td>
                      <td>{formatDate(movement.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Purchases */}
      <section className="dashboard-section">
        <div className="dashboard-section-title">
          <h2>ملخص المشتريات</h2>
          <p>المشتريات المسجلة خلال الفترة المحددة.</p>
        </div>

        <div className="dashboard-extra">
          <div className="admin-panel dashboard-info-card">
            <span>🚚 عدد المشتريات</span>
            <h2>{loading ? "..." : formatNumber(stats.purchaseCount)}</h2>
            <p>عدد سجلات المشتريات خلال الفترة.</p>
          </div>

          <div className="admin-panel dashboard-info-card">
            <span>💰 إجمالي قيمة المشتريات</span>
            <h2>{loading ? "..." : formatCurrency(stats.purchaseValue)}</h2>
            <p>إجمالي قيمة السجلات بكل الحالات، بما فيها المسودات.</p>
          </div>
        </div>

        <div className="admin-panel dashboard-panel">
          <div className="dashboard-heading">
            <h3>أحدث المشتريات</h3>
            <Link href="/admin/inventory/purchases" className="dashboard-link">
              عرض المشتريات ←
            </Link>
          </div>

          {loading ? (
            <p>جاري تحميل البيانات...</p>
          ) : purchases.length === 0 ? (
            <div className="dashboard-empty">
              <p>لا توجد مشتريات خلال الفترة المحددة.</p>
            </div>
          ) : (
            <div className="dashboard-table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>رقم الفاتورة</th>
                    <th>الحالة</th>
                    <th>القيمة</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.slice(0, 10).map((purchase) => (
                    <tr key={purchase.id}>
                      <td>{purchase.id}</td>
                      <td>{purchase.status}</td>
                      <td>{formatCurrency(purchase.total_amount)}</td>
                      <td>{formatDate(purchase.purchase_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Quick Navigation */}
      <section className="admin-panel dashboard-panel">
        <div className="dashboard-heading">
          <div>
            <h2>الوصول السريع</h2>
            <p>انتقل مباشرة إلى القسم المطلوب.</p>
          </div>
        </div>

        <div className="dashboard-navigation">
          {sections.map((section) => (
            <Link href={section.href} key={section.href}>
              <span>{section.icon}</span>
              {section.title}
              <b>←</b>
            </Link>
          ))}
        </div>
      </section>

      <style jsx>{`
        .inventory-dashboard {
          width: 100%;
          color: inherit;
        }

        .dashboard-panel {
          margin-top: 24px;
          padding: 26px;
        }

        .dashboard-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .dashboard-heading h2,
        .dashboard-section-title h2 {
          margin: 0 0 8px;
        }

        .dashboard-heading p,
        .dashboard-section-title p {
          margin: 0;
          opacity: 0.75;
          font-size: 14px;
        }

        .dashboard-date {
          padding: 9px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 13px;
        }

        .dashboard-filter {
          display: flex;
          align-items: end;
          flex-wrap: wrap;
          gap: 14px;
        }

        .dashboard-field {
          flex: 1;
          min-width: 160px;
        }

        .dashboard-field label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
        }

        .dashboard-field input,
        .dashboard-field select {
          color: #111827 !important;
          background: #fff !important;
        }

        .dashboard-period {
          margin: 18px 0 0;
          font-size: 13px;
          opacity: 0.75;
        }

        .dashboard-error {
          padding: 14px;
          margin-top: 20px;
          border-radius: 9px;
          background: #fee2e2;
          color: #991b1b;
        }

        .dashboard-section {
          margin-top: 28px;
        }

        .dashboard-section-title {
          margin-bottom: 18px;
        }

        .dashboard-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 16px;
        }

        .dashboard-stat {
          padding: 22px;
          min-width: 0;
        }

        .dashboard-stat-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .dashboard-icon {
          font-size: 28px;
        }

        .dashboard-number-label {
          font-size: 14px;
          font-weight: 600;
        }

        .number-0 { color: #64748b; }
        .number-1 { color: #15803d; }
        .number-2 { color: #b88946; }
        .number-3 { color: #dc2626; }

        .dashboard-stat h2 {
          font-size: 30px;
          margin: 15px 0 5px;
        }

        .dashboard-stat p {
          margin: 0;
          font-size: 13px;
          opacity: 0.7;
        }

        .dashboard-extra {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-top: 24px;
        }

        .dashboard-info-card {
          padding: 22px;
          min-width: 0;
        }

        .dashboard-info-card > span {
          font-size: 14px;
          opacity: 0.8;
        }

        .dashboard-info-card h2 {
          margin: 13px 0;
          font-size: 25px;
          color: #b88946;
        }

        .dashboard-info-card h3 {
          margin: 0 0 12px;
        }

        .dashboard-info-card p {
          font-size: 14px;
          line-height: 1.8;
          opacity: 0.75;
          margin-bottom: 12px;
        }

        .dashboard-link {
          color: #b88946;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
        }

        .dashboard-link:hover {
          text-decoration: underline;
        }

        .dashboard-empty {
          padding: 28px;
          text-align: center;
        }

        .dashboard-empty span {
          font-size: 30px;
        }

        .dashboard-empty p {
          margin-bottom: 0;
          color: #15803d;
        }

        .dashboard-table-wrapper {
          overflow-x: auto;
        }

        .dashboard-table {
          width: 100%;
          border-collapse: collapse;
          text-align: right;
          min-width: 500px;
        }

        .dashboard-table th,
        .dashboard-table td {
          padding: 14px;
          border-bottom: 1px solid rgba(128, 128, 128, 0.2);
        }

        .dashboard-table th {
          background: rgba(128, 128, 128, 0.08);
        }

        .status-danger {
          color: #dc2626;
          font-weight: 600;
        }

        .status-warning {
          color: #b88946;
          font-weight: 600;
        }

        .dashboard-navigation {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .dashboard-navigation a {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 15px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          color: inherit;
          text-decoration: none;
          font-size: 14px;
          transition: 0.2s;
        }

        .dashboard-navigation a:hover {
          border-color: #b88946;
          background: rgba(184, 137, 70, 0.07);
        }

        .dashboard-navigation a span {
          font-size: 22px;
        }

        .dashboard-navigation a b {
          margin-right: auto;
          color: #b88946;
        }

        @media (max-width: 650px) {
          .dashboard-panel {
            padding: 17px;
          }

          .dashboard-filter {
            align-items: stretch;
          }

          .dashboard-field {
            min-width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
