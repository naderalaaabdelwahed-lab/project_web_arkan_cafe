
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
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
      // تسجيل دخول المدير باستخدام الإيميل
      if (loginValue.includes("@")) {
        const { error: loginError } =
          await supabase.auth.signInWithPassword({
            email: loginValue,
            password,
          });

        if (loginError) {
          throw new Error("الإيميل أو كلمة المرور غير صحيحة.");
        }

        const { data: signedInUser } = await supabase.auth.getUser();
        if (signedInUser.user?.app_metadata?.account_type === "hr_employee") {
          await supabase.auth.signOut();
          throw new Error("حساب HR مخصص للحضور والانصراف فقط. استخدم بوابة HR.");
        }

        const { data: isAdmin, error: adminError } =
          await supabase.rpc("is_admin");

        if (adminError || !isAdmin) {
          await supabase.auth.signOut();
          throw new Error(
            "هذا الحساب ليس لديه صلاحيات الإدارة."
          );
        }

        router.replace("/admin");
        return;
      }

      // تسجيل دخول الموظف باستخدام اسم المستخدم
      const response = await fetch("/api/auth/employee-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: loginValue.toLowerCase(),
          password,
        }),
      });

      // قراءة استجابة API بطريقة آمنة
      const responseText = await response.text();

      let result = {};

      try {
        result = responseText
          ? JSON.parse(responseText)
          : {};
      } catch {
        console.error("Employee login API response:", responseText);
        throw new Error("السيرفر رجّع استجابة غير صحيحة.");
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            `فشل تسجيل الدخول. Status: ${response.status}`
        );
      }

      if (!result.access_token || !result.refresh_token) {
        throw new Error("بيانات جلسة الموظف غير مكتملة.");
      }

      // حفظ جلسة الموظف في Supabase
      const { error: sessionError } =
        await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      router.replace("/admin");

    } catch (err) {
      setError(
        err.message || "حدث خطأ أثناء تسجيل الدخول."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page" dir="rtl">
      <form className="admin-login-card" onSubmit={handleLogin}>
        <span className="admin-eyebrow">
          ARKAN MANAGEMENT
        </span>

        <h1>تسجيل الدخول</h1>

        <p>
          سجل الدخول للوصول إلى لوحة تحكم ARKAN
        </p>

        <label>
          البريد الإلكتروني أو اسم المستخدم

          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="الإيميل أو اسم المستخدم"
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

        {error && (
          <p className="admin-login-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "جاري تسجيل الدخول..." : "دخول"}
        </button>
      </form>
    </main>
  );
}
