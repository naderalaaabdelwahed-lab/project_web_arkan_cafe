
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const permissionGroups = [
  {
    title: "لوحة التحكم",
    items: [["dashboard.view", "عرض لوحة التحكم"]],
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
  {
    title: "المخزن",
    items: [
      ["inventory.view", "عرض المخزن"],
      ["inventory.items.manage", "إدارة الأصناف والخامات"],
      ["inventory.recipes.manage", "إدارة الوصفات"],
      ["inventory.purchases.manage", "إدارة المشتريات"],
      ["inventory.movements.manage", "إدارة حركات المخزون"],
      ["inventory.reports.view", "عرض تقارير المخزون"],
    ],
  },
];

const colors = {
  page: "#101820",
  card: "#1c2935",
  cardInner: "#243442",
  border: "#3b4d5c",
  text: "#f8fafc",
  muted: "#c0ccd6",
  gold: "#d6a44d",
  goldHover: "#edbd68",
  green: "#22c55e",
  red: "#ef4444",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPermissions, setEditPermissions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const getToken = async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const token = data.session?.access_token;

    if (!token) {
      throw new Error("سجل الدخول أولًا.");
    }

    return token;
  };

  const readApiResponse = async (response) => {
    const raw = await response.text();

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

  function togglePermission(permission) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission]
    );
  }

  function toggleEditPermission(permission) {
    setEditPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission]
    );
  }

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

      await readApiResponse(response);

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

  function openEditEmployee(employee) {
    setEditingEmployee(employee);
    setEditUsername(employee.username || "");
    setEditDisplayName(employee.display_name || "");
    setEditPassword("");
    setEditPermissions([...(employee.permissions || [])]);
    setError("");
    setMessage("");
  }

  function closeEditEmployee() {
    if (saving) return;

    setEditingEmployee(null);
    setEditPassword("");
  }

  async function handleUpdateEmployee(e) {
    e.preventDefault();

    if (!editingEmployee) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const token = await getToken();

      const response = await fetch("/api/admin/employees", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: editingEmployee.user_id,
          username: editUsername.trim().toLowerCase(),
          display_name: editDisplayName.trim(),
          password: editPassword,
          permissions: editPermissions,
        }),
      });

      await readApiResponse(response);

      setMessage("تم تحديث بيانات الموظف بنجاح.");
      setEditingEmployee(null);
      setEditPassword("");

      await loadEmployees();
    } catch (err) {
      console.error("Update employee error:", err);
      setError(err.message || "تعذر تعديل بيانات الموظف.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEmployee(employee) {
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف الموظف "${employee.display_name}"؟\n\nسيتم حذف حساب الدخول وبيانات الموظف وصلاحياته نهائيًا. لا يمكن التراجع عن هذه العملية.`
    );

    if (!confirmed) return;

    setDeletingId(employee.user_id);
    setError("");
    setMessage("");

    try {
      const token = await getToken();

      const response = await fetch("/api/admin/employees", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: employee.user_id,
        }),
      });

      await readApiResponse(response);

      setMessage(`تم حذف الموظف ${employee.display_name} بنجاح.`);

      if (editingEmployee?.user_id === employee.user_id) {
        setEditingEmployee(null);
      }

      await loadEmployees();
    } catch (err) {
      console.error("Delete employee error:", err);
      setError(err.message || "تعذر حذف الموظف.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main dir="rtl" style={styles.page}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>ARKAN MANAGEMENT</span>
          <h1 style={styles.mainTitle}>إدارة الموظفين</h1>
          <p style={styles.subtitle}>
            إنشاء الحسابات والتحكم في بيانات الموظفين وصلاحياتهم.
          </p>
        </div>

        <div style={styles.employeeCounter}>
          <span style={styles.counterNumber}>{employees.length}</span>
          <span style={styles.counterLabel}>موظف مسجل</span>
        </div>
      </header>

      {error && (
        <div style={styles.errorBox}>
          <strong>حدث خطأ</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </div>
      )}

      {message && (
        <div style={styles.successBox}>
          <strong>تم بنجاح</strong>
          <p style={{ margin: "6px 0 0" }}>{message}</p>
        </div>
      )}

      {/* إضافة موظف */}
      <section style={styles.panel}>
        <div style={styles.sectionHeader}>
          <div>
            <span style={styles.sectionNumber}>01</span>
            <h2 style={styles.sectionTitle}>إضافة موظف جديد</h2>
            <p style={styles.sectionDescription}>
              أدخل بيانات الموظف وحدد الصلاحيات المطلوبة.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateEmployee}>
          <div style={styles.formGrid}>
            <label style={styles.field}>
              <span style={styles.label}>اسم الموظف</span>
              <input
                style={styles.input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
                placeholder="مثال: أحمد محمد"
              />
            </label>

            <label style={styles.field}>
              <span style={styles.label}>اسم المستخدم</span>
              <input
                style={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                placeholder="ahmed_01"
                dir="ltr"
              />
            </label>

            <label style={styles.field}>
              <span style={styles.label}>كلمة المرور</span>
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="8 أحرف على الأقل"
              />
            </label>
          </div>

          <div style={styles.permissionHeader}>
            <h3 style={styles.subTitle}>صلاحيات الموظف</h3>
            <span style={styles.permissionCount}>
              {selectedPermissions.length} صلاحية محددة
            </span>
          </div>

          <p style={styles.sectionDescription}>
            اختر الصلاحيات التي يحتاجها الموظف فقط.
          </p>

          <div style={styles.permissionGrid}>
            {permissionGroups.map((group, index) => (
              <div key={group.title} style={styles.permissionCard}>
                <div style={styles.permissionCardHeader}>
                  <span style={styles.groupNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h4 style={styles.groupTitle}>{group.title}</h4>
                </div>

                {group.items.map(([key, label]) => (
                  <label key={key} style={styles.permissionItem}>
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(key)}
                      onChange={() => togglePermission(key)}
                      style={styles.checkbox}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              ...styles.primaryButton,
              opacity: saving ? 0.65 : 1,
            }}
          >
            {saving ? "جاري إنشاء الحساب..." : "+ إنشاء حساب الموظف"}
          </button>
        </form>
      </section>

      {/* قائمة الموظفين */}
      <section style={{ ...styles.panel, marginTop: 26 }}>
        <div style={styles.listHeader}>
          <div>
            <span style={styles.sectionNumber}>02</span>
            <h2 style={styles.sectionTitle}>الموظفون المسجلون</h2>
            <p style={styles.sectionDescription}>
              تعديل بيانات الموظفين أو تغيير كلمات المرور أو حذف الحسابات.
            </p>
          </div>

          <button
            type="button"
            onClick={loadEmployees}
            disabled={loading}
            style={styles.secondaryButton}
          >
            {loading ? "جاري التحديث..." : "↻ تحديث القائمة"}
          </button>
        </div>

        {loading ? (
          <p style={styles.emptyText}>جاري تحميل الموظفين...</p>
        ) : employees.length === 0 ? (
          <p style={styles.emptyText}>لا يوجد موظفون حتى الآن.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {[
                    "الاسم",
                    "اسم المستخدم",
                    "الحالة",
                    "عدد الصلاحيات",
                    "تاريخ الإضافة",
                    "الإجراءات",
                  ].map((heading) => (
                    <th key={heading} style={styles.th}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.user_id}>
                    <td style={styles.td}>
                      <strong>{employee.display_name}</strong>
                    </td>

                    <td style={styles.td} dir="ltr">
                      {employee.username}
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.status,
                          background: employee.is_active
                            ? "rgba(34,197,94,0.15)"
                            : "rgba(239,68,68,0.15)",
                          color: employee.is_active
                            ? "#4ade80"
                            : "#f87171",
                        }}
                      >
                        {employee.is_active ? "نشط" : "معطل"}
                      </span>
                    </td>

                    <td style={styles.td}>
                      {employee.permissions.length}
                    </td>

                    <td style={styles.td}>
                      {employee.created_at
                        ? new Date(employee.created_at).toLocaleDateString(
                            "ar-EG"
                          )
                        : "-"}
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        <button
                          type="button"
                          onClick={() => openEditEmployee(employee)}
                          style={styles.editButton}
                        >
                          تعديل
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteEmployee(employee)}
                          disabled={deletingId === employee.user_id}
                          style={styles.deleteButton}
                        >
                          {deletingId === employee.user_id
                            ? "جاري الحذف..."
                            : "حذف"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* نافذة تعديل الموظف */}
      {editingEmployee && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.eyebrow}>EMPLOYEE SETTINGS</span>
                <h2 style={styles.sectionTitle}>تعديل بيانات الموظف</h2>
                <p style={styles.sectionDescription}>
                  تعديل بيانات وصلاحيات: {editingEmployee.display_name}
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditEmployee}
                disabled={saving}
                style={styles.closeButton}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee}>
              <div style={styles.formGrid}>
                <label style={styles.field}>
                  <span style={styles.label}>اسم الموظف</span>
                  <input
                    style={styles.input}
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    required
                    maxLength={100}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>اسم المستخدم</span>
                  <input
                    style={styles.input}
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_]+"
                    dir="ltr"
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>كلمة المرور الجديدة</span>
                  <input
                    style={styles.input}
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    minLength={8}
                    placeholder="اتركها فارغة للاحتفاظ بالحالية"
                  />
                </label>
              </div>

              <div style={styles.permissionHeader}>
                <h3 style={styles.subTitle}>صلاحيات الموظف</h3>
                <span style={styles.permissionCount}>
                  {editPermissions.length} صلاحية محددة
                </span>
              </div>

              <div style={styles.permissionGrid}>
                {permissionGroups.map((group, index) => (
                  <div key={group.title} style={styles.permissionCard}>
                    <div style={styles.permissionCardHeader}>
                      <span style={styles.groupNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h4 style={styles.groupTitle}>{group.title}</h4>
                    </div>

                    {group.items.map(([key, label]) => (
                      <label key={key} style={styles.permissionItem}>
                        <input
                          type="checkbox"
                          checked={editPermissions.includes(key)}
                          onChange={() => toggleEditPermission(key)}
                          style={styles.checkbox}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              <div style={styles.modalActions}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...styles.primaryButton,
                    marginTop: 0,
                    opacity: saving ? 0.65 : 1,
                  }}
                >
                  {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>

                <button
                  type="button"
                  onClick={closeEditEmployee}
                  disabled={saving}
                  style={styles.secondaryButton}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: colors.page,
    color: colors.text,
    padding: "32px 24px",
    maxWidth: 1250,
    margin: "0 auto",
    fontFamily: "inherit",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 20,
    marginBottom: 30,
  },
  eyebrow: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 2,
  },
  mainTitle: {
    fontSize: 30,
    fontWeight: 800,
    margin: "10px 0",
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    margin: 0,
    fontSize: 14,
  },
  employeeCounter: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  counterNumber: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: 800,
  },
  counterLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  panel: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
  },
  sectionHeader: {
    marginBottom: 24,
  },
  sectionNumber: {
    color: colors.gold,
    fontWeight: 800,
    fontSize: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    margin: "7px 0",
    fontWeight: 800,
  },
  sectionDescription: {
    color: colors.muted,
    fontSize: 13,
    margin: "5px 0 18px",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 18,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 14px",
    border: `1px solid ${colors.border}`,
    borderRadius: 9,
    background: "#14212c",
    color: "#ffffff",
    outline: "none",
    fontSize: 14,
  },
  permissionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 30,
    marginBottom: 15,
  },
  subTitle: {
    color: colors.text,
    fontSize: 18,
    margin: 0,
  },
  permissionCount: {
    color: colors.gold,
    background: "rgba(214,164,77,0.12)",
    border: "1px solid rgba(214,164,77,0.3)",
    padding: "7px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },
  permissionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 14,
  },
  permissionCard: {
    background: colors.cardInner,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 16,
  },
  permissionCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 8,
    borderBottom: `1px solid ${colors.border}`,
  },
  groupNumber: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: 800,
  },
  groupTitle: {
    color: colors.goldHover,
    fontSize: 15,
    margin: 0,
    fontWeight: 800,
  },
  permissionItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 2px",
    color: colors.text,
    fontSize: 13,
    cursor: "pointer",
  },
  checkbox: {
    width: 17,
    height: 17,
    accentColor: colors.gold,
    cursor: "pointer",
    flexShrink: 0,
  },
  primaryButton: {
    marginTop: 26,
    padding: "14px 25px",
    border: 0,
    borderRadius: 9,
    background: colors.gold,
    color: "#17212b",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "11px 17px",
    border: `1px solid ${colors.gold}`,
    borderRadius: 9,
    background: "transparent",
    color: colors.goldHover,
    fontWeight: 700,
    cursor: "pointer",
  },
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 15,
    marginBottom: 20,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "right",
    color: colors.text,
    minWidth: 850,
  },
  th: {
    background: "#14212c",
    color: colors.goldHover,
    padding: 15,
    fontSize: 13,
    borderBottom: `1px solid ${colors.border}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: 15,
    fontSize: 13,
    borderBottom: `1px solid ${colors.border}`,
    color: colors.text,
    whiteSpace: "nowrap",
  },
  status: {
    display: "inline-block",
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 800,
  },
  actionButtons: {
    display: "flex",
    gap: 8,
  },
  editButton: {
    padding: "8px 13px",
    border: "1px solid rgba(214,164,77,0.5)",
    borderRadius: 7,
    background: "rgba(214,164,77,0.12)",
    color: colors.goldHover,
    cursor: "pointer",
    fontWeight: 700,
  },
  deleteButton: {
    padding: "8px 13px",
    border: "1px solid rgba(239,68,68,0.4)",
    borderRadius: 7,
    background: "rgba(239,68,68,0.12)",
    color: "#f87171",
    cursor: "pointer",
    fontWeight: 700,
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    padding: 30,
  },
  errorBox: {
    background: "#451d25",
    color: "#fecaca",
    border: "1px solid #b91c1c",
    padding: 15,
    borderRadius: 10,
    marginBottom: 18,
  },
  successBox: {
    background: "#123c2a",
    color: "#bbf7d0",
    border: "1px solid #15803d",
    padding: 15,
    borderRadius: 10,
    marginBottom: 18,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(0,0,0,0.78)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    overflowY: "auto",
  },
  modal: {
    width: "100%",
    maxWidth: 900,
    maxHeight: "92vh",
    overflowY: "auto",
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 20px 70px rgba(0,0,0,0.5)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 15,
    marginBottom: 25,
  },
  closeButton: {
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    background: colors.cardInner,
    color: colors.text,
    padding: "9px 12px",
    cursor: "pointer",
  },
  modalActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 25,
  },
};
