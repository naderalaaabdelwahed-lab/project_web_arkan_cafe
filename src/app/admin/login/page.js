
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("الإيميل أو كلمة المرور غير صحيحة.");
      setLoading(false);
      return;
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

    if (adminError || !isAdmin) {
      await supabase.auth.signOut();
      setError("هذا الحساب ليس لديه صلاحيات الإدارة.");
      setLoading(false);
      return;
    }

    router.replace("/admin");
  }

  return (
    <main className="admin-login-page" dir="rtl">
      <form className="admin-login-card" onSubmit={handleLogin}>
        <span className="admin-eyebrow">ARKAN MANAGEMENT</span>

        <h1>تسجيل دخول الإدارة</h1>
        <p>سجل الدخول للوصول إلى لوحة تحكم ARKAN</p>

        <label>
          البريد الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            required
          />
        </label>

        <label>
          كلمة المرور
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            required
          />
        </label>

        {error && <p className="admin-login-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "جاري تسجيل الدخول..." : "دخول"}
        </button>
      </form>
    </main>
  );
}
