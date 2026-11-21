
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const inventoryLinks = [
  {
    href: "/admin/inventory",
    label: "الرئيسية",
    icon: "▦",
    permission: "inventory.view",
  },
  {
    href: "/admin/inventory/items",
    label: "الخامات والمنتجات",
    icon: "📦",
    permission: "inventory.items.manage",
  },
  {
    href: "/admin/inventory/recipes",
    label: "الوصفات",
    icon: "📋",
    permission: "inventory.recipes.manage",
  },
  {
    href: "/admin/inventory/purchases",
    label: "المشتريات والموردين",
    icon: "🚚",
    permission: "inventory.purchases.manage",
  },
  {
    href: "/admin/inventory/movements",
    label: "حركة المخزون",
    icon: "🔄",
    permission: "inventory.movements.manage",
  },
  {
    href: "/admin/inventory/reports",
    label: "تقارير المخزون",
    icon: "📊",
    permission: "inventory.reports.view",
  },
];

export default function InventoryLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState([]);

  useEffect(() => {
    let active = true;

    async function loadPermissions() {
      setLoading(true);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          router.replace("/admin/login");
          return;
        }

        const { data: adminResult, error: adminError } =
          await supabase.rpc("is_admin");

        if (!active) return;

        if (!adminError && adminResult === true) {
          setIsAdmin(true);
          setPermissions([]);
          setLoading(false);
          return;
        }

        const { data: employee, error: employeeError } =
          await supabase
            .from("employee_profiles")
            .select("is_active")
            .eq("user_id", session.user.id)
            .maybeSingle();

        if (!active) return;

        if (
          employeeError ||
          !employee ||
          employee.is_active !== true
        ) {
          await supabase.auth.signOut();
          router.replace("/admin/login");
          return;
        }

        const {
          data: permissionRows,
          error: permissionError,
        } = await supabase
          .from("employee_permissions")
          .select("permission_key")
          .eq("user_id", session.user.id);

        if (!active) return;
        if (permissionError) throw permissionError;

        const userPermissions = (permissionRows || []).map(
          (item) => item.permission_key
        );

        setPermissions(userPermissions);
        setIsAdmin(false);

        if (!userPermissions.includes("inventory.view")) {
          router.replace("/admin");
          return;
        }

        const currentLink = inventoryLinks.find(
          (link) =>
            link.href !== "/admin/inventory" &&
            (pathname === link.href ||
              pathname.startsWith(link.href + "/"))
        );

        if (
          currentLink &&
          !userPermissions.includes(currentLink.permission)
        ) {
          router.replace("/admin/inventory");
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error("Inventory permissions error:", error);
        router.replace("/admin/login");
      }
    }

    loadPermissions();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (loading) {
    return (
      <main
        dir="rtl"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#101010",
          color: "#fff",
        }}
      >
        جاري تحميل المخزن...
      </main>
    );
  }

  const visibleLinks = isAdmin
    ? inventoryLinks
    : inventoryLinks.filter((link) =>
        permissions.includes(link.permission)
      );

  return (
    <div
      className="inventory-layout"
      dir="rtl"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#101010",
        color: "#fff",
      }}
    >
      <aside
        style={{
          width: 260,
          minWidth: 260,
          minHeight: "100vh",
          background: "#171717",
          borderLeft: "1px solid #303030",
          padding: "25px 15px",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <Link
          href="/admin/inventory"
          style={{
            textDecoration: "none",
            color: "#fff",
            padding: "5px 12px 25px",
            borderBottom: "1px solid #303030",
          }}
        >
          <h2 style={{ fontSize: 25, margin: 0 }}>
            ARKAN<span style={{ color: "#b88946" }}>.</span>
          </h2>

          <p style={{ color: "#b88946", fontSize: 13 }}>
            INVENTORY MANAGEMENT
          </p>
        </Link>

        <div style={{ marginTop: 25 }}>
          <p
            style={{
              color: "#777",
              fontSize: 12,
              padding: "0 12px",
              marginBottom: 15,
            }}
          >
            إدارة المخزن
          </p>

          <nav style={{ display: "grid", gap: 7 }}>
            {visibleLinks.map((link) => {
              const active =
                link.href === "/admin/inventory"
                  ? pathname === link.href
                  : pathname === link.href ||
                    pathname.startsWith(link.href + "/");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 14px",
                    borderRadius: 8,
                    textDecoration: "none",
                    color: active ? "#fff" : "#bdbdbd",
                    background: active
                      ? "#b88946"
                      : "transparent",
                    fontSize: 14,
                    fontWeight: active ? "bold" : "normal",
                  }}
                >
                  <span>{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 25,
            borderTop: "1px solid #303030",
          }}
        >
          <Link
            href="/admin"
            style={{
              display: "block",
              padding: 13,
              color: "#b88946",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: "bold",
            }}
          >
            ↩ العودة للوحة الإدارة
          </Link>

          <p style={{ color: "#666", fontSize: 11 }}>
            ARKAN INVENTORY SYSTEM
          </p>
        </div>
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: 30,
        }}
      >
        {children}
      </main>
    </div>
  );
}
