"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function PosLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const loginValue = username.trim();

    try {
      if (loginValue.includes("@")) {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: loginValue,
          password,
        });
        if (loginError) throw new Error("الإيميل أو كلمة المرور غير صحيحة.");

        const [{ data: admin }, { data: canUsePos, error: permissionError }] = await Promise.all([
          supabase.rpc("is_admin"),
          supabase.rpc("has_permission", { requested_permission: "pos.use" }),
        ]);
        if (permissionError) throw permissionError;

        if (!admin && !canUsePos) {
          await supabase.auth.signOut();
          throw new Error("هذا الحساب ليس لديه صلاحية الدخول إلى شاشة POS.");
        }
      } else {
        const response = await fetch("/api/auth/employee-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: loginValue.toLowerCase(),
            password,
          }),
        });

        const raw = await response.text();
        let result = {};
        try {
          result = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error("السيرفر رجّع استجابة غير صحيحة.");
        }
        if (!response.ok) throw new Error(result.error || "تعذر تسجيل الدخول.");
        if (!result.access_token || !result.refresh_token) {
          throw new Error("بيانات جلسة الموظف غير مكتملة.");
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (sessionError) throw sessionError;

        const { data: canUsePos, error: permissionError } = await supabase.rpc(
          "has_permission",
          { requested_permission: "pos.use" }
        );
        if (permissionError) throw permissionError;
        if (!canUsePos) {
          await supabase.auth.signOut();
          throw new Error("حسابك غير مفعل لشاشة POS. اطلب من المدير إضافة صلاحية الدخول.");
        }
      }

      router.replace("/pos");
      router.refresh();
    } catch (err) {
      setError(err.message || "حدث خطأ أثناء تسجيل الدخول.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page" dir="rtl">
      <form className="admin-login-card" onSubmit={handleLogin}>
        <span className="admin-eyebrow">ARKAN POS</span>
        <h1>دخول شاشة الكاشير</h1>
        <p>استخدم حساب الموظف المخصص لك للدخول إلى نظام الكاشير.</p>

        <label>
          اسم المستخدم
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="اسم المستخدم"
            autoComplete="username"
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
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="admin-login-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "جاري تسجيل الدخول..." : "دخول إلى POS"}
        </button>
      </form>
    </main>
  );
}
