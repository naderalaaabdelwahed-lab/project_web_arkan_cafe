
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const links = [
  {
    href: "/admin",
    label: "▦ لوحة التحكم",
    permission: "dashboard.view",
  },
  {
    href: "/admin/orders",
    label: "▤ الطلبات",
    permission: "orders.view",
  },
  {
    href: "/admin/reservations",
    label: "▣ الحجوزات",
    permission: "reservations.view",
  },
  {
    href: "/admin/menu",
    label: "☷ إدارة المنيو",
    permission: "menu.view",
  },
  {
    href: "/admin/preparation-screens",
    label: "🖥️ إدارة شاشات التجهيز",
    permission: "menu.update",
  },
  {
    href: "/admin/preparation-settings",
    label: "⚙️ توزيع أقسام التجهيز",
    permission: "menu.update",
  },
  {
    href: "/admin/hall",
    label: "▥ إدارة الصالة",
    permission: "hall.view",
  },
  {
    href: "/admin/daily-closing",
    label: "▣ الإقفال اليومي",
    permission: "daily_closing.view",
  },
  {
    href: "/admin/inventory",
    label: "▦ إدارة المخزن",
    permission: "inventory.view",
  },
  {
    href: "/admin/hr/employees",
    label: "♙ شؤون الموظفين",
    permission: "hr.employees.view",
  },
  {
    href: "/admin/hr/attendance",
    label: "✓ الحضور والانصراف",
    permission: "hr.attendance.view",
  },
  {
    href: "/admin/hr/shifts",
    label: "◷ الشيفتات",
    permission: "hr.shifts.view",
  },
  {
    href: "/admin/hr/payroll",
    label: "ج.م الرواتب",
    permission: "hr.payroll.view",
  },
  {
    href: "/admin/employees",
    label: "♟ إدارة الموظفين",
    adminOnly: true,
  },
  {
    href: "/hr/manage",
    label: "♙ نظام الموارد البشرية HR",
    adminOnly: true,
  },
];

const inventoryRoutes = [
  {
    href: "/admin/inventory/items",
    permission: "inventory.items.manage",
  },
  {
    href: "/admin/inventory/recipes",
    permission: "inventory.recipes.manage",
  },
  {
    href: "/admin/inventory/purchases",
    permission: "inventory.purchases.manage",
  },
  {
    href: "/admin/inventory/movements",
    permission: "inventory.movements.manage",
  },
  {
    href: "/admin/inventory/reports",
    permission: "inventory.reports.view",
  },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const isInventoryPage = pathname.startsWith("/admin/inventory");

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [employeeName, setEmployeeName] = useState("");
  const [switchingUser, setSwitchingUser] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setChecking(false);
      return;
    }

    let active = true;

    async function checkAccess() {
      setChecking(true);

      try {
        // التحقق من تسجيل الدخول
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          if (active) router.replace("/admin/login");
          return;
        }

        // HR employee accounts must never enter the system administration area.
        if (session.user?.app_metadata?.account_type === "hr_employee") {
          if (active) router.replace("/hr");
          return;
        }

        // التحقق من المدير
        const {
          data: adminResult,
          error: adminError,
        } = await supabase.rpc("is_admin");

        if (!active) return;

        if (!adminError && adminResult === true) {
          setIsAdmin(true);
          setPermissions([]);
          setEmployeeName("");
          setChecking(false);
          return;
        }

        // التحقق من حساب الموظف
        const {
          data: employee,
          error: employeeError,
        } = await supabase
          .from("employee_profiles")
          .select("user_id, is_active, display_name")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!active) return;

        if (
          employeeError ||
          !employee ||
          employee.is_active !== true
        ) {
          await supabase.auth.signOut();

          if (active) {
            router.replace("/admin/login");
          }

          return;
        }

        setEmployeeName(employee.display_name || "موظف");

        // جلب صلاحيات الموظف
        const {
          data: permissionRows,
          error: permissionError,
        } = await supabase
          .from("employee_permissions")
          .select("permission_key")
          .eq("user_id", session.user.id);

        if (!active) return;

        if (permissionError) {
          throw permissionError;
        }

        const userPermissions = (permissionRows || []).map(
          (item) => item.permission_key
        );

        setIsAdmin(false);
        setPermissions(userPermissions);

        // فحص صلاحيات المخزن
        if (isInventoryPage) {
          const inventoryRoute = inventoryRoutes.find(
            (route) =>
              pathname === route.href ||
              pathname.startsWith(route.href + "/")
          );

          const requiredPermission = inventoryRoute
            ? inventoryRoute.permission
            : "inventory.view";

          const allowed =
            userPermissions.includes("inventory.view") &&
            userPermissions.includes(requiredPermission);

          if (!allowed) {
            if (userPermissions.includes("inventory.view")) {
              router.replace("/admin/inventory");
            } else {
              const firstAllowed = links.find(
                (link) =>
                  !link.adminOnly &&
                  link.href !== "/admin/inventory" &&
                  userPermissions.includes(link.permission)
              );

              if (firstAllowed) {
                router.replace(firstAllowed.href);
              } else {
                await supabase.auth.signOut();
                router.replace("/admin/login");
              }
            }

            return;
          }

          setChecking(false);
          return;
        }

        // فحص صلاحيات صفحات الإدارة
        const currentLink = links.find((link) => {
          if (link.href === "/admin") {
            return pathname === "/admin";
          }

          if (link.href === "/admin/inventory") {
            return false;
          }

          return (
            pathname === link.href ||
            pathname.startsWith(link.href + "/")
          );
        });

        if (currentLink) {
          const allowed = currentLink.adminOnly
            ? false
            : userPermissions.includes(currentLink.permission);

          if (!allowed) {
            const firstAllowed = links.find(
              (link) =>
                !link.adminOnly &&
                link.href !== "/admin/inventory" &&
                userPermissions.includes(link.permission)
            );

            if (firstAllowed) {
              router.replace(firstAllowed.href);
            } else if (
              userPermissions.includes("inventory.view")
            ) {
              router.replace("/admin/inventory");
            } else {
              await supabase.auth.signOut();
              router.replace("/admin/login");
            }

            return;
          }
        }

        setChecking(false);
      } catch (error) {
        console.error("Admin layout access error:", error);

        if (active) {
          router.replace("/admin/login");
        }
      }
    }

    checkAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAccess();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router, isInventoryPage]);

  // تبديل المستخدم
  async function handleSwitchUser() {
    const confirmed = window.confirm(
      "هل تريد تسجيل الخروج والتبديل إلى مستخدم آخر؟"
    );

    if (!confirmed) return;

    setSwitchingUser(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      router.replace("/admin/login");
      router.refresh();
    } catch (error) {
      console.error("Switch user error:", error);

      alert("تعذر تسجيل الخروج: " + error.message);

      setSwitchingUser(false);
    }
  }

  // صفحة تسجيل الدخول
  if (pathname === "/admin/login") {
    return children;
  }

  // شاشة التحقق
  if (checking) {
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
        جاري التحقق من صلاحيات الدخول...
      </main>
    );
  }

  // روابط لوحة الإدارة المسموح بها
  const visibleLinks = isAdmin
    ? links
    : links.filter(
        (link) =>
          !link.adminOnly &&
          permissions.includes(link.permission)
      );

  // واجهة المخزن: إخفاء سايد بار الإدارة
  if (isInventoryPage) {
    return (
      <main
        className="admin-layout inventory-admin-layout"
        dir="rtl"
      >
        <section
          className="admin-main"
          style={{
            minWidth: 0,
            flex: 1,
            width: "100%",
          }}
        >
          {children}
        </section>
      </main>
    );
  }

  // واجهة لوحة الإدارة الرئيسية
  return (
    <main className="admin-layout" dir="rtl">
      <aside
        className="admin-sidebar"
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          alignSelf: "flex-start",
          flexShrink: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Link href="/" className="admin-logo">
          ARKAN<span>.</span>
        </Link>

        <p className="admin-menu-title">
          القائمة الرئيسية
        </p>

        <nav className="admin-nav">
          {visibleLinks.map((link) => {
            const isActive =
              link.href === "/admin"
                ? pathname === "/admin"
                : pathname === link.href ||
                  pathname.startsWith(link.href + "/");

            return (
              <Link
                key={link.href}
                href={link.href}
                className={isActive ? "active" : ""}
              >
                {link.label}
              </Link>
            );
          })}

          <Link href="/">↩ العودة للموقع</Link>
        </nav>

        <div
          className="admin-sidebar-footer"
          style={{ marginTop: "auto" }}
        >
          <span>ARKAN MANAGEMENT</span>

          <small
            style={{
              display: "block",
              marginBottom: 15,
              marginTop: 8,
            }}
          >
            {isAdmin
              ? "Administrator"
              : employeeName || "موظف"}
          </small>

          <button
            type="button"
            onClick={handleSwitchUser}
            disabled={switchingUser}
            style={{
              width: "100%",
              padding: "12px 15px",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              background: "rgba(184,137,70,0.15)",
              color: "#fff",
              cursor: switchingUser ? "not-allowed" : "pointer",
              fontWeight: "bold",
              opacity: switchingUser ? 0.6 : 1,
            }}
          >
            {switchingUser
              ? "جاري تسجيل الخروج..."
              : "⇄ تبديل المستخدم"}
          </button>
        </div>
      </aside>

      <section
        className="admin-main"
        style={{
          minWidth: 0,
          flex: 1,
        }}
      >
        {children}
      </section>
    </main>
  );
}
