
"use client";

import Link from "next/link";

const sections = [
  {
    title: "الخامات والمنتجات",
    description: "إدارة الخامات والمنتجات الجاهزة ووحدات القياس والأرصدة.",
    icon: "📦",
    href: "/admin/inventory/items",
  },
  {
    title: "الوصفات",
    description: "ربط أصناف المنيو بالخامات وتحديد كميات الاستهلاك.",
    icon: "📋",
    href: "/admin/inventory/recipes",
  },
  {
    title: "المشتريات والموردين",
    description: "إدارة الموردين وفواتير المشتريات واستلام البضائع.",
    icon: "🚚",
    href: "/admin/inventory/purchases",
  },
  {
    title: "حركة المخزون",
    description: "متابعة الإضافات والصرف والتسويات والمرتجعات.",
    icon: "🔄",
    href: "/admin/inventory/movements",
  },
  {
    title: "تقارير المخزون",
    description: "متابعة الأرصدة والنواقص والاستهلاك والتكلفة.",
    icon: "📊",
    href: "/admin/inventory/reports",
  },
];

export default function InventoryPage() {
  return (
    <>
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">ARKAN INVENTORY</span>
          <h1>إدارة المخزن</h1>
          <p>كل ما يخص مخزون مطعم أركان في مكان واحد</p>
        </div>

        <div className="admin-date">
          {new Date().toLocaleDateString("ar-EG")}
        </div>
      </header>

      <section className="admin-panel" style={{ marginBottom: 25 }}>
        <div className="admin-panel-heading">
          <div>
            <h2>نظام إدارة المخزون</h2>
            <p>اختار القسم اللي عايز تديره.</p>
          </div>
        </div>
      </section>

      <div className="admin-stats">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="admin-stat-card"
            style={{
              display: "block",
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition: "0.2s",
            }}
          >
            <span className="stat-icon">{section.icon}</span>

            <h2 style={{ fontSize: 20, marginBottom: 12 }}>
              {section.title}
            </h2>

            <p style={{ lineHeight: 1.8 }}>
              {section.description}
            </p>

            <div
              style={{
                marginTop: 18,
                color: "#b88946",
                fontWeight: "bold",
              }}
            >
              فتح القسم ←
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
