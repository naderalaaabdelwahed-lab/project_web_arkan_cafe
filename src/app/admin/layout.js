
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/admin", label: "▦ لوحة التحكم" },
  { href: "/admin/orders", label: "▤ الطلبات" },
  { href: "/admin/reservations", label: "▣ الحجوزات" },
  { href: "/admin/menu", label: "☷ إدارة المنيو" },
  { href: "/admin/hall", label: "▥ إدارة الصالة" },
  { href: "/admin/daily-closing", label: "▣ الإقفال اليومي" },
  { href: "/admin/employees", label: "♟ إدارة الموظفين" },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setChecking(false);
      return;
    }

    let active = true;

    async function checkAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (active) router.replace("/admin/login");
        return;
      }

      const { data, error } = await supabase.rpc("is_admin");

      if (error || !data) {
        await supabase.auth.signOut();

        if (active) router.replace("/admin/login");
        return;
      }

      if (active) setChecking(false);
    }

    checkAdmin();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAdmin();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (pathname === "/admin/login") {
    return children;
  }

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
        }}
      >
        <Link href="/" className="admin-logo">
          ARKAN<span>.</span>
        </Link>

        <p className="admin-menu-title">القائمة الرئيسية</p>

        <nav className="admin-nav">
          {links.map((link) => {
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

        <div className="admin-sidebar-footer">
          <span>ARKAN MANAGEMENT</span>
          <small>Admin Dashboard</small>
        </div>
      </aside>

      <section
        className="admin-main"
        style={{ minWidth: 0, flex: 1 }}
      >
        {children}
      </section>
    </main>
  );
}
