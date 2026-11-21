
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

const money = (value) =>
  `${Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} جنيه`;

const isCancelled = (status) =>
  ["cancelled", "canceled"].includes(String(status || "").toLowerCase());

const getOrderType = (type) => {
  const value = String(type || "").toLowerCase();

  if (value === "delivery") return "دليفري";
  if (value === "takeaway") return "تيك أواي";
  if (["dine-in", "dine_in", "dinein"].includes(value))
    return "داخل المطعم";

  return type || "غير محدد";
};

const getSection = (categoryName) =>
  String(categoryName || "").trim() === "مشروبات" ? "البار" : "المطبخ";

export default function DailyClosingPage() {
  const [businessDay, setBusinessDay] = useState(null);
  const [businessDays, setBusinessDays] = useState([]);
  const [selectedDayId, setSelectedDayId] = useState("open");

  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [savedSummary, setSavedSummary] = useState(null);

  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // تحميل الطلبات والأصناف من قاعدة البيانات
  const loadLiveData = async (day) => {
    const { data: orderData, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("business_day_id", day.id)
      .order("created_at", { ascending: false });

    if (ordersError) throw ordersError;

    const orderList = orderData || [];

    if (orderList.length === 0) {
      return { orders: [], items: [] };
    }

    const orderIds = orderList.map((order) => order.id);

    const { data: itemData, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", orderIds);

    if (itemsError) throw itemsError;

    const rawItems = itemData || [];

    const productIds = [
      ...new Set(rawItems.map((item) => item.product_id).filter(Boolean)),
    ];

    let productMap = {};
    let categoryMap = {};

    if (productIds.length > 0) {
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, name, category_id")
        .in("id", productIds);

      if (productsError) throw productsError;

      const productList = products || [];

      productMap = Object.fromEntries(
        productList.map((product) => [product.id, product])
      );

      const categoryIds = [
        ...new Set(
          productList.map((product) => product.category_id).filter(Boolean)
        ),
      ];

      if (categoryIds.length > 0) {
        const { data: categories, error: categoriesError } = await supabase
          .from("categories")
          .select("id, name")
          .in("id", categoryIds);

        if (categoriesError) throw categoriesError;

        categoryMap = Object.fromEntries(
          (categories || []).map((category) => [
            category.id,
            category.name,
          ])
        );
      }
    }

    const enrichedItems = rawItems.map((item) => {
      const product = productMap[item.product_id];

      const categoryName = product
        ? categoryMap[product.category_id] || "غير محدد"
        : "غير محدد";

      return {
        ...item,
        product_name:
          item.product_name || product?.name || "منتج غير معروف",
        category_name: categoryName,
        section: getSection(categoryName),
      };
    });

    return {
      orders: orderList,
      items: enrichedItems,
    };
  };

  // تحميل اليومية الحالية أو يومية من الأرشيف
  const loadReport = useCallback(
    async (requestedDayId = "open", preserveMessage = false) => {
      setLoading(true);
      setError("");

      if (!preserveMessage) setMessage("");

      try {
        const { data: days, error: daysError } = await supabase
          .from("business_days")
          .select("*")
          .order("opened_at", { ascending: false });

        if (daysError) throw daysError;

        const dayList = days || [];
        setBusinessDays(dayList);

        const openDay = dayList.find((day) => day.status === "open");

        let selectedDay = null;

        if (requestedDayId === "open") {
          selectedDay = openDay || null;
          setSelectedDayId("open");
        } else {
          selectedDay =
            dayList.find(
              (day) => String(day.id) === String(requestedDayId)
            ) || null;

          setSelectedDayId(selectedDay ? String(selectedDay.id) : "open");
        }

        if (!selectedDay) {
          setBusinessDay(null);
          setOrders([]);
          setItems([]);
          setSavedSummary(null);
          return;
        }

        setBusinessDay(selectedDay);

        const snapshot = selectedDay.snapshot;

        // قراءة النسخة المحفوظة لليومية المقفولة
        if (
          selectedDay.status === "closed" &&
          snapshot &&
          Array.isArray(snapshot.orders)
        ) {
          const snapshotOrders = [];
          const snapshotItems = [];

          snapshot.orders.forEach((entry) => {
            const order = entry.order || entry;

            snapshotOrders.push(order);

            (entry.items || []).forEach((item) => {
              const categoryName = item.category_name || "غير محدد";

              snapshotItems.push({
                ...item,
                order_id: item.order_id || order.id,
                product_name: item.product_name || "منتج غير معروف",
                category_name: categoryName,
                section: item.section || getSection(categoryName),
              });
            });
          });

          setOrders(snapshotOrders);
          setItems(snapshotItems);
          setSavedSummary(snapshot.summary || null);
        } else {
          const result = await loadLiveData(selectedDay);

          setOrders(result.orders);
          setItems(result.items);
          setSavedSummary(null);
        }
      } catch (err) {
        console.error("Daily report error:", err);
        setError(err.message || "حصل خطأ أثناء تحميل التقرير");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadReport("open");
  }, [loadReport]);

  // حساب المبيعات
  const activeOrders = orders.filter(
    (order) => !isCancelled(order.status)
  );

  const cancelledOrders = orders.filter((order) =>
    isCancelled(order.status)
  );

  const totalSales = savedSummary
    ? Number(savedSummary.total_sales || 0)
    : activeOrders.reduce(
        (sum, order) => sum + Number(order.total_amount || 0),
        0
      );

  const deliverySales = savedSummary
    ? Number(savedSummary.delivery_sales || 0)
    : activeOrders
        .filter((order) => order.order_type === "delivery")
        .reduce(
          (sum, order) => sum + Number(order.total_amount || 0),
          0
        );

  const takeawaySales = savedSummary
    ? Number(savedSummary.takeaway_sales || 0)
    : activeOrders
        .filter((order) => order.order_type === "takeaway")
        .reduce(
          (sum, order) => sum + Number(order.total_amount || 0),
          0
        );

  const dineInSales = savedSummary
    ? Number(savedSummary.dine_in_sales || 0)
    : activeOrders
        .filter((order) =>
          ["dine-in", "dine_in", "dinein"].includes(
            String(order.order_type || "").toLowerCase()
          )
        )
        .reduce(
          (sum, order) => sum + Number(order.total_amount || 0),
          0
        );

  const deliveryFees = savedSummary
    ? Number(savedSummary.delivery_fees || 0)
    : activeOrders
        .filter((order) => order.order_type === "delivery")
        .reduce(
          (sum, order) => sum + Number(order.delivery_fee || 0),
          0
        );

  const activeOrderIds = new Set(
    activeOrders.map((order) => String(order.id))
  );

  const activeItems = items.filter((item) =>
    activeOrderIds.has(String(item.order_id))
  );

  const barSales = savedSummary
    ? Number(savedSummary.bar_sales || 0)
    : activeItems
        .filter((item) => item.section === "البار")
        .reduce(
          (sum, item) => sum + Number(item.subtotal || 0),
          0
        );

  const kitchenSales = savedSummary
    ? Number(savedSummary.kitchen_sales || 0)
    : activeItems
        .filter((item) => item.section === "المطبخ")
        .reduce(
          (sum, item) => sum + Number(item.subtotal || 0),
          0
        );

  // تصدير تقرير Excel
  const exportExcel = () => {
    if (!businessDay) return;

    const summaryRows = [
      { البيان: "رقم اليومية", القيمة: businessDay.id },
      { البيان: "تاريخ اليومية", القيمة: businessDay.business_date },
      { البيان: "حالة اليومية", القيمة: businessDay.status },
      { البيان: "وقت بداية اليومية", القيمة: businessDay.opened_at },
      { البيان: "وقت إغلاق اليومية", القيمة: businessDay.closed_at || "-" },
      { البيان: "إجمالي عدد الطلبات", القيمة: orders.length },
      { البيان: "الطلبات غير الملغاة", القيمة: activeOrders.length },
      { البيان: "الطلبات الملغاة", القيمة: cancelledOrders.length },
      { البيان: "إجمالي المبيعات", القيمة: totalSales },
      { البيان: "مبيعات الدليفري", القيمة: deliverySales },
      { البيان: "مبيعات التيك أواي", القيمة: takeawaySales },
      { البيان: "مبيعات داخل المطعم", القيمة: dineInSales },
      { البيان: "رسوم التوصيل", القيمة: deliveryFees },
      { البيان: "مبيعات البار", القيمة: barSales },
      { البيان: "مبيعات المطبخ", القيمة: kitchenSales },
    ];

    // كل صنف في صف مستقل مع بيانات الأوردر
    const orderRows = items.map((item) => {
      const order = orders.find(
        (order) => String(order.id) === String(item.order_id)
      );

      return {
        "رقم الأوردر": item.order_id,
        "اسم العميل": order?.customer_name || "",
        "رقم الهاتف": order?.phone || "",
        "نوع الطلب": getOrderType(order?.order_type),
        "حالة الطلب": order?.status || "",
        "المنتج": item.product_name || "منتج غير معروف",
        "القسم": item.category_name || "",
        "الكمية": Number(item.quantity || 0),
        "سعر الوحدة": Number(item.unit_price || 0),
        "إجمالي الصنف": Number(item.subtotal || 0),
        "إجمالي الأوردر": Number(order?.total_amount || 0),
        "رسوم التوصيل": Number(order?.delivery_fee || 0),
        "العنوان": order?.address || "",
        "التاريخ": order?.created_at || "",
      };
    });

    // إظهار الطلبات التي ليس لها أصناف
    const ordersWithoutItems = orders
      .filter(
        (order) =>
          !items.some(
            (item) => String(item.order_id) === String(order.id)
          )
      )
      .map((order) => ({
        "رقم الأوردر": order.id,
        "اسم العميل": order.customer_name || "",
        "رقم الهاتف": order.phone || "",
        "نوع الطلب": getOrderType(order.order_type),
        "حالة الطلب": order.status || "",
        "المنتج": "لا توجد أصناف",
        "القسم": "",
        "الكمية": 0,
        "سعر الوحدة": 0,
        "إجمالي الصنف": 0,
        "إجمالي الأوردر": Number(order.total_amount || 0),
        "رسوم التوصيل": Number(order.delivery_fee || 0),
        "العنوان": order.address || "",
        "التاريخ": order.created_at || "",
      }));

    const allOrderRows = [...orderRows, ...ordersWithoutItems];

    // تفاصيل الأصناف بشكل منفصل
    const itemRows = items.map((item) => ({
      "رقم الأوردر": item.order_id,
      "اسم المنتج": item.product_name,
      "القسم": item.category_name,
      "جهة العمل": item.section,
      "الكمية": Number(item.quantity || 0),
      "سعر الوحدة": Number(item.unit_price || 0),
      "الإجمالي": Number(item.subtotal || 0),
    }));

    const workbook = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    const ordersSheet = XLSX.utils.json_to_sheet(allOrderRows);
    const itemsSheet = XLSX.utils.json_to_sheet(itemRows);

    summarySheet["!cols"] = [
      { wch: 28 },
      { wch: 25 },
    ];

    ordersSheet["!cols"] = [
      { wch: 13 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 28 },
      { wch: 18 },
      { wch: 12 },
      { wch: 16 },
      { wch: 17 },
      { wch: 18 },
      { wch: 16 },
      { wch: 30 },
      { wch: 23 },
    ];

    itemsSheet["!cols"] = [
      { wch: 13 },
      { wch: 28 },
      { wch: 20 },
      { wch: 16 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      summarySheet,
      "ملخص اليومية"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      ordersSheet,
      "الطلبات"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      itemsSheet,
      "تفاصيل الأصناف"
    );

    XLSX.writeFile(
      workbook,
      `ARKAN_Daily_Report_${businessDay.business_date}_ID_${businessDay.id}.xlsx`
    );
  };

  // إنهاء اليومية
  const handleCloseDay = async () => {
    if (!businessDay || businessDay.status !== "open" || closing) return;

    const confirmed = window.confirm(
      `هل أنت متأكد من إنهاء اليومية رقم ${businessDay.id}؟\n\nسيتم حفظ التقرير وفتح يومية جديدة. لا يمكن التراجع عن الإقفال.`
    );

    if (!confirmed) return;

    setClosing(true);
    setError("");
    setMessage("");

    try {
      const { error: closeError } = await supabase.rpc(
        "close_business_day"
      );

      if (closeError) throw closeError;

      await loadReport("open", true);

      setMessage(
        "تم إغلاق اليومية وحفظ التقرير بنجاح، وبدأت يومية جديدة."
      );
    } catch (err) {
      console.error("Close day error:", err);
      setError(err.message || "فشل إغلاق اليومية");
    } finally {
      setClosing(false);
    }
  };

  const statCards = [
    ["إجمالي الطلبات", orders.length],
    ["الطلبات غير الملغاة", activeOrders.length],
    ["الطلبات الملغاة", cancelledOrders.length],
    ["إجمالي المبيعات", money(totalSales)],
    ["مبيعات البار", money(barSales)],
    ["مبيعات المطبخ", money(kitchenSales)],
    ["رسوم التوصيل", money(deliveryFees)],
  ];

  if (loading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>جاري تحميل تقرير اليومية...</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>الإقفال اليومي</h1>
          <p style={styles.muted}>
            مراجعة المبيعات والطلبات واستعراض أرشيف اليوميات
          </p>
        </div>

        <button
          style={styles.secondaryButton}
          onClick={() => loadReport(selectedDayId)}
        >
          تحديث التقرير
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <section style={styles.card}>
        <label style={styles.selectLabel}>
          اختر اليومية لعرض تقريرها
        </label>

        <select
          value={selectedDayId}
          onChange={(event) => loadReport(event.target.value)}
          style={styles.select}
        >
          <option value="open">اليومية المفتوحة الحالية</option>

          {businessDays
            .filter((day) => day.status === "closed")
            .map((day) => (
              <option key={day.id} value={String(day.id)}>
                يومية #{day.id} - {day.business_date} - مقفولة
              </option>
            ))}
        </select>
      </section>

      {!businessDay ? (
        <section style={styles.card}>
          <h2>لا توجد يومية مفتوحة</h2>
          <p style={styles.muted}>
            لا توجد يومية مفتوحة حاليًا. يمكنك اختيار يومية قديمة من الأرشيف.
          </p>
        </section>
      ) : (
        <>
          {businessDay.status === "closed" && (
            <div style={styles.archiveNotice}>
              أنت تستعرض تقريرًا محفوظًا من الأرشيف. البيانات المعروضة هي
              النسخة المحفوظة وقت إغلاق اليومية.
            </div>
          )}

          <section style={styles.card}>
            <div style={styles.dayInfo}>
              <div>
                <span style={styles.muted}>رقم اليومية</span>
                <h2>#{businessDay.id}</h2>
              </div>

              <div>
                <span style={styles.muted}>تاريخ اليومية</span>
                <h2>{businessDay.business_date}</h2>
              </div>

              <div>
                <span style={styles.muted}>بدأت في</span>
                <h2 style={styles.smallHeading}>
                  {new Date(businessDay.opened_at).toLocaleString("ar-EG")}
                </h2>
              </div>

              {businessDay.closed_at && (
                <div>
                  <span style={styles.muted}>أُغلقت في</span>
                  <h2 style={styles.smallHeading}>
                    {new Date(businessDay.closed_at).toLocaleString("ar-EG")}
                  </h2>
                </div>
              )}

              <div>
                <span style={styles.muted}>الحالة</span>
                <h2 style={styles.smallHeading}>
                  {businessDay.status === "open" ? "مفتوحة" : "مقفولة"}
                </h2>
              </div>
            </div>
          </section>

          <section style={styles.statsGrid}>
            {statCards.map(([label, value]) => (
              <div key={label} style={styles.statCard}>
                <span style={styles.muted}>{label}</span>
                <strong style={styles.statValue} dir="ltr">
                  {value}
                </strong>
              </div>
            ))}
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>تفاصيل المبيعات</h2>

            <div style={styles.salesGrid}>
              <div style={styles.salesRow}>
                <span>الدليفري</span>
                <strong dir="ltr">{money(deliverySales)}</strong>
              </div>

              <div style={styles.salesRow}>
                <span>التيك أواي</span>
                <strong dir="ltr">{money(takeawaySales)}</strong>
              </div>

              <div style={styles.salesRow}>
                <span>داخل المطعم</span>
                <strong dir="ltr">{money(dineInSales)}</strong>
              </div>

              <div style={styles.salesRow}>
                <span>رسوم التوصيل</span>
                <strong dir="ltr">{money(deliveryFees)}</strong>
              </div>

              <div style={styles.salesRow}>
                <span>البار - المشروبات</span>
                <strong dir="ltr">{money(barSales)}</strong>
              </div>

              <div style={styles.salesRow}>
                <span>المطبخ - باقي الأقسام</span>
                <strong dir="ltr">{money(kitchenSales)}</strong>
              </div>
            </div>

            <p style={styles.note}>
              المبيعات تستبعد الطلبات الملغاة فقط. رسوم التوصيل ضمن إجمالي
              الطلبات، لكنها لا تدخل في مبيعات البار أو المطبخ.
            </p>
          </section>

          <section style={styles.card}>
            <div style={styles.tableHeader}>
              <h2 style={styles.sectionTitle}>
                الطلبات ({orders.length})
              </h2>
              <span style={styles.muted}>
                الطلبات الملغاة ظاهرة للمراجعة ولا تدخل في المبيعات
              </span>
            </div>

            {orders.length === 0 ? (
              <p style={styles.muted}>لا توجد طلبات في هذه اليومية.</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th>رقم الطلب</th>
                      <th>العميل</th>
                      <th>النوع</th>
                      <th>الحالة</th>
                      <th>الإجمالي</th>
                      <th>رسوم التوصيل</th>
                      <th>التاريخ</th>
                    </tr>
                  </thead>

                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>#{order.id}</td>
                        <td>{order.customer_name || "-"}</td>
                        <td>{getOrderType(order.order_type)}</td>
                        <td>
                          <span
                            style={{
                              ...styles.status,
                              ...(isCancelled(order.status)
                                ? styles.cancelled
                                : styles.active),
                            }}
                          >
                            {order.status || "-"}
                          </span>
                        </td>
                        <td dir="ltr">{money(order.total_amount)}</td>
                        <td dir="ltr">{money(order.delivery_fee)}</td>
                        <td>
                          {order.created_at
                            ? new Date(order.created_at).toLocaleString("ar-EG")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>
              تفاصيل الأصناف ({items.length})
            </h2>

            {items.length === 0 ? (
              <p style={styles.muted}>لا توجد تفاصيل أصناف لعرضها.</p>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th>رقم الطلب</th>
                      <th>المنتج</th>
                      <th>القسم</th>
                      <th>جهة العمل</th>
                      <th>الكمية</th>
                      <th>سعر الوحدة</th>
                      <th>الإجمالي</th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.id || `${item.order_id}-${index}`}>
                        <td>#{item.order_id}</td>
                        <td>{item.product_name}</td>
                        <td>{item.category_name}</td>
                        <td>{item.section}</td>
                        <td>{item.quantity}</td>
                        <td dir="ltr">{money(item.unit_price)}</td>
                        <td dir="ltr">{money(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={styles.actions}>
            <button
              style={styles.excelButton}
              onClick={exportExcel}
              disabled={!orders.length}
            >
              تنزيل تقرير Excel
            </button>

            {businessDay.status === "open" && (
              <button
                style={styles.closeButton}
                onClick={handleCloseDay}
                disabled={closing}
              >
                {closing ? "جاري إنهاء اليومية..." : "إنهاء اليوم"}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}

const styles = {
  page: {
    padding: "24px",
    color: "var(--foreground, #f5f5f5)",
    direction: "rtl",
    minHeight: "100vh",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },
  title: { fontSize: "28px", margin: "0 0 8px" },
  muted: { color: "#999", fontSize: "14px" },
  card: {
    background: "var(--card, #1d1d1d)",
    border: "1px solid #333",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
  },
  selectLabel: {
    display: "block",
    marginBottom: "10px",
    fontWeight: "bold",
  },
  select: {
    width: "100%",
    maxWidth: "500px",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #555",
    background: "#292929",
    color: "white",
    fontSize: "15px",
  },
  archiveNotice: {
    background: "#263b50",
    color: "#c9e4ff",
    padding: "14px",
    borderRadius: "8px",
    marginBottom: "18px",
    lineHeight: 1.7,
  },
  dayInfo: {
    display: "flex",
    gap: "40px",
    flexWrap: "wrap",
  },
  smallHeading: { fontSize: "16px" },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "14px",
    marginBottom: "20px",
  },
  statCard: {
    background: "var(--card, #1d1d1d)",
    border: "1px solid #333",
    borderRadius: "12px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  statValue: { fontSize: "22px" },
  sectionTitle: { fontSize: "19px", marginTop: 0 },
  salesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  salesRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "14px",
    border: "1px solid #333",
    borderRadius: "8px",
  },
  note: {
    color: "#aaa",
    fontSize: "13px",
    marginTop: "18px",
    lineHeight: 1.8,
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
  },
  tableWrap: { overflowX: "auto", width: "100%" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "750px",
    textAlign: "right",
  },
  status: {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: "6px",
    fontSize: "12px",
  },
  cancelled: { background: "#542525", color: "#ffaaaa" },
  active: { background: "#24452d", color: "#a5e8b3" },
  actions: {
    display: "flex",
    justifyContent: "flex-start",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "24px",
    marginBottom: "40px",
  },
  secondaryButton: {
    padding: "11px 18px",
    borderRadius: "8px",
    border: "1px solid #555",
    background: "#292929",
    color: "white",
    cursor: "pointer",
  },
  excelButton: {
    padding: "13px 22px",
    borderRadius: "8px",
    border: "none",
    background: "#236b45",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
  closeButton: {
    padding: "13px 22px",
    borderRadius: "8px",
    border: "none",
    background: "#a52d2d",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
  },
  error: {
    background: "#542525",
    color: "#ffbaba",
    padding: "14px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  success: {
    background: "#24452d",
    color: "#b5efc2",
    padding: "14px",
    borderRadius: "8px",
    marginBottom: "16px",
  },
};
