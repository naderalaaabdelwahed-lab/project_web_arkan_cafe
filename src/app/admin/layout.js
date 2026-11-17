
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
      const { data: { session } } = await supabase.auth.getSession();

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

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(() => {
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
      <main dir="rtl" style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#101010",
        color: "#fff"
      }}>
        جاري التحقق من صلاحيات الدخول...
      </main>
    );
  }

  return children;
}
