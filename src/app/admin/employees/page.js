
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const permissionGroups = [
  {
    title: "لوحة التحكم",
    items: [
      ["dashboard.view", "عرض لوحة التحكم"],
    ],
  },
  {
    title: "الطلبات",
    items: [
      ["orders.view", "عرض الطلبات"],
      ["orders.create", "إنشاء الطلبات"],
      ["orders.update", "تعديل الطلبات"],
      ["orders.cancel", "إلغاء الطلبات"],
    ],
  },
  {
    title: "الحجوزات",
    items: [
      ["reservations.view", "عرض الحجوزات"],
      ["reservations.create", "إضافة حجز"],
      ["reservations.update", "تعديل الحجز"],
      ["reservations.delete", "حذف الحجز"],
    ],
  },
  {
    title: "المنيو",
    items: [
      ["menu.view", "عرض المنيو"],
      ["menu.create", "إضافة صنف"],
      ["menu.update", "تعديل الأصناف"],
      ["menu.delete", "حذف الأصناف"],
    ],
  },
  {
    title: "الصالة",
    items: [
      ["hall.view", "عرض الصالة"],
      ["hall.update", "تعديل إعدادات الصالة"],
    ],
  },
  {
    title: "الإقفال اليومي",
    items: [
      ["daily_closing.view", "عرض الإقفال اليومي"],
      ["daily_closing.export", "تصدير التقرير"],
      ["daily_closing.close", "تنفيذ الإقفال اليومي"],
    ],
  },
];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // الحصول على Access Token
  const getToken = async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const token = data.session?.access_token;

    if (!token) {
      throw new Error("سجل الدخول أولًا.");
    }

    return token;
  };

  // قراءة رد API ومعالجة الردود غير الصالحة
  const readApiResponse = async (response) => {
    const raw = await response.text();

    console.log("API RESPONSE:", response.status, raw);

    let result;

    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `السيرفر رجّع رد غير صالح. Status: ${response.status}`
      );
    }

    if (!response.ok) {
      throw new Error(
        result.error || `حدث خطأ في السيرفر. Status: ${response.status}`
      );
    }

    return result;
  };

  // تحميل الموظفين
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = await getToken();

      const response = await fetch("/api/admin/employees", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const result = await readApiResponse(response);

      setEmployees(
        (result.employees || []).map((employee) => ({
          ...employee,
          permissions: employee.permissions || [],
        }))
      );
    } catch (err) {
      console.error("Load employees error:", err);
      setError(err.message || "تعذر تحميل الموظفين.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // تحديد أو إلغاء تحديد صلاحية
  function togglePermission(permission) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission]
    );
  }

  // إنشاء موظف جديد
  async function handleCreateEmployee(e) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const token = await getToken();

      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          display_name: displayName.trim(),
          password,
          permissions: selectedPermissions,
        }),
      });

      const result = await readApiResponse(response);

      setMessage("تم إنشاء حساب الموظف بنجاح.");

      setUsername("");
      setDisplayName("");
      setPassword("");
      setSelectedPermissions([]);

      await loadEmployees();
    } catch (err) {
      console.error("Create employee error:", err);
      setError(err.message || "تعذر إنشاء الموظف.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      dir="rtl"
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "auto",
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <h1>إدارة الموظفين</h1>
        <p>إنشاء حسابات الموظفين وتحديد صلاحيات الوصول.</p>
      </header>

      {error && (
        <p
          style={{
            color: "#dc2626",
            background: "#fee2e2",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </p>
      )}

      {message && (
        <p
          style={{
            color: "#16a34a",
            background: "#dcfce7",
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {message}
        </p>
      )}

      {/* إضافة موظف */}
      <section style={panelStyle}>
        <h2>إضافة موظف جديد</h2>

        <form onSubmit={handleCreateEmployee}>
          <div style={gridStyle}>
            <label style={fieldStyle}>
              اسم الموظف

              <input
                style={inputStyle}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
                placeholder="مثال: أحمد محمد"
              />
            </label>

            <label style={fieldStyle}>
              اسم المستخدم

              <input
                style={inputStyle}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                placeholder="مثال: ahmed_01"
                dir="ltr"
              />
            </label>

            <label style={fieldStyle}>
              كلمة المرور

              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="8 أحرف على الأقل"
              />
            </label>
          </div>

          <h3 style={{ marginTop: 28 }}>صلاحيات الموظف</h3>

          <p style={{ color: "#777" }}>
            اختر الصلاحيات التي يحتاجها الموظف فقط.
          </p>

          <div style={gridStyle}>
            {permissionGroups.map((group) => (
              <div key={group.title} style={permissionBoxStyle}>
                <h4>{group.title}</h4>

                {group.items.map(([key, label]) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      padding: "7px 0",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(key)}
                      onChange={() => togglePermission(key)}
                    />

                    {label}
                  </label>
                ))}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            style={primaryButtonStyle}
          >
            {saving ? "جاري إنشاء الحساب..." : "إنشاء حساب الموظف"}
          </button>
        </form>
      </section>

      {/* قائمة الموظفين */}
      <section
        style={{
          ...panelStyle,
          marginTop: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2>الموظفون المسجلون ({employees.length})</h2>

          <button
            type="button"
            onClick={loadEmployees}
            disabled={loading}
            style={secondaryButtonStyle}
          >
            {loading ? "جاري التحديث..." : "تحديث القائمة"}
          </button>
        </div>

        {loading ? (
          <p>جاري تحميل الموظفين...</p>
        ) : employees.length === 0 ? (
          <p>لا يوجد موظفون حتى الآن.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={cellStyle}>الاسم</th>
                  <th style={cellStyle}>اسم المستخدم</th>
                  <th style={cellStyle}>الحالة</th>
                  <th style={cellStyle}>عدد الصلاحيات</th>
                  <th style={cellStyle}>تاريخ الإضافة</th>
                </tr>
              </thead>

              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.user_id}>
                    <td style={cellStyle}>
                      {employee.display_name}
                    </td>

                    <td style={cellStyle} dir="ltr">
                      {employee.username}
                    </td>

                    <td style={cellStyle}>
                      {employee.is_active ? "نشط" : "معطل"}
                    </td>

                    <td style={cellStyle}>
                      {employee.permissions.length}
                    </td>

                    <td style={cellStyle}>
                      {employee.created_at
                        ? new Date(
                            employee.created_at
                          ).toLocaleDateString("ar-EG")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

// التصميم
const panelStyle = {
  background: "var(--admin-card, #fff)",
  color: "inherit",
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 22,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const inputStyle = {
  width: "100%",
  padding: 12,
  border: "1px solid #ccc",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
};

const permissionBoxStyle = {
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 14,
};

const primaryButtonStyle = {
  marginTop: 24,
  padding: "12px 24px",
  border: 0,
  borderRadius: 8,
  background: "#a87936",
  color: "#fff",
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "9px 16px",
  border: "1px solid #aaa",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 18,
  textAlign: "right",
};

const cellStyle = {
  borderBottom: "1px solid #ddd",
  padding: 12,
  whiteSpace: "nowrap",
};
