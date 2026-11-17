
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestSupabasePage() {
  const [status, setStatus] = useState("جاري الاتصال...");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .limit(10);

      if (error) {
        setStatus("فشل الاتصال: " + error.message);
        return;
      }

      setCategories(data || []);
      setStatus("تم الاتصال بـ Supabase بنجاح!");
    }

    testConnection();
  }, []);

  return (
    <main
      dir="rtl"
      style={{
        padding: "40px",
        fontFamily: "Arial",
        textAlign: "center",
      }}
    >
      <h1>اختبار اتصال ARKAN</h1>

      <h2>{status}</h2>

      <h3>الأقسام الموجودة في قاعدة البيانات:</h3>

      {categories.map((category) => (
        <p key={category.id}>{category.name}</p>
      ))}

      {categories.length === 0 && status.includes("بنجاح") && (
        <p>الاتصال ناجح، لكن لسه مفيش أقسام مضافة.</p>
      )}
    </main>
  );
}
