
"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export default function HallManagementPage() {
  const [settings, setSettings] = useState({
    indoor_tables: 10,
    outdoor_tables: 6,
    seats_per_table: 4,
  });

  const [permissions, setPermissions] = useState({
    canView: false,
    canUpdate: false,
  });

  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchPermissions = useCallback(async () => {
    setAccessLoading(true);
    setError("");

    try {
      const [
        { data: admin, error: adminError },
        { data: view, error: viewError },
        { data: update, error: updateError },
      ] = await Promise.all([
        supabase.rpc("is_admin"),
        supabase.rpc("has_permission", {
          requested_permission: "hall.view",
        }),
        supabase.rpc("has_permission", {
          requested_permission: "hall.update",
        }),
      ]);

      if (adminError) throw adminError;
      if (viewError) throw viewError;
      if (updateError) throw updateError;

      const isAdmin = Boolean(admin);

      const currentPermissions = {
        canView: isAdmin || Boolean(view),
        canUpdate: isAdmin || Boolean(update),
      };

      setPermissions(currentPermissions);
      return currentPermissions;
    } catch (err) {
      console.error("Hall Permissions Error:", err);
      setError("تعذر التحقق من الصلاحيات: " + err.message);
      return null;
    } finally {
      setAccessLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) throw error;

      setSettings({
        indoor_tables: data.indoor_tables,
        outdoor_tables: data.outdoor_tables,
        seats_per_table: data.seats_per_table,
      });
    } catch (err) {
      setError("فشل تحميل إعدادات الصالة: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initializePage() {
      const currentPermissions = await fetchPermissions();

      if (currentPermissions?.canView) {
        await loadSettings();
      } else {
        setLoading(false);
      }
    }

    initializePage();
  }, [fetchPermissions, loadSettings]);

  function updateSetting(name, value) {
    if (!permissions.canUpdate) return;

    setSettings((previous) => ({
      ...previous,
      [name]: value,
    }));

    setMessage("");
    setError("");
  }

  async function saveSettings() {
    if (!permissions.canUpdate) {
      setError("ليس لديك صلاحية تعديل إعدادات الصالة.");
      return;
    }

    const indoor = Number(settings.indoor_tables);
    const outdoor = Number(settings.outdoor_tables);
    const seats = Number(settings.seats_per_table);

    if (
      !Number.isInteger(indoor) ||
      !Number.isInteger(outdoor) ||
      !Number.isInteger(seats) ||
      indoor < 0 ||
      outdoor < 0 ||
      seats < 1
    ) {
      setError(
        "أدخل أرقامًا صحيحة. الطاولات لا تقل عن صفر والأفراد لا يقلوا عن 1."
      );
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { error } = await supabase
        .from("restaurant_settings")
        .update({
          indoor_tables: indoor,
          outdoor_tables: outdoor,
          seats_per_table: seats,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) throw error;

      setSettings({
        indoor_tables: indoor,
        outdoor_tables: outdoor,
        seats_per_table: seats,
      });

      setMessage("تم حفظ إعدادات الصالة بنجاح.");
    } catch (err) {
      setError("فشل حفظ الإعدادات: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const totalTables =
    Number(settings.indoor_tables || 0) +
    Number(settings.outdoor_tables || 0);

  const totalCapacity =
    totalTables * Number(settings.seats_per_table || 0);

  if (accessLoading) {
    return (
      <div dir="rtl" className="admin-empty">
        جاري التحقق من الصلاحيات...
      </div>
    );
  }

  if (!permissions.canView) {
    return (
      <div dir="rtl">
        <header className="admin-header">
          <div>
            <span className="admin-eyebrow">HALL MANAGEMENT</span>
            <h1>إدارة الصالة</h1>
          </div>
        </header>

        <div className="admin-empty">
          ليس لديك صلاحية عرض إعدادات الصالة.
        </div>

        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  return (
    <div dir="rtl">
      <header className="admin-header">
        <div>
          <span className="admin-eyebrow">HALL MANAGEMENT</span>
          <h1>إدارة الصالة</h1>
          <p>إدارة سعة الصالة الداخلية والخارجية وإعدادات الطاولات</p>
        </div>

        <div className="admin-date">
          {new Date().toLocaleDateString("ar-EG")}
        </div>
      </header>

      {loading ? (
        <section className="admin-panel">
          جاري تحميل إعدادات الصالة...
        </section>
      ) : (
        <>
          {message && (
            <div
              className="admin-panel"
              style={{
                marginBottom: 20,
                color: "green",
                borderRight: "4px solid green",
              }}
            >
              {message}
            </div>
          )}

          {error && (
            <div
              className="admin-panel"
              style={{
                marginBottom: 20,
                color: "#c0392b",
                borderRight: "4px solid #c0392b",
              }}
            >
              {error}
            </div>
          )}

          <div className="admin-stats">
            <article className="admin-stat-card">
              <span className="stat-icon">⌂</span>
              <p>الطاولات الداخلية</p>
              <h2>{settings.indoor_tables}</h2>
              <small>Indoor Tables</small>
            </article>

            <article className="admin-stat-card">
              <span className="stat-icon">☀</span>
              <p>الطاولات الخارجية</p>
              <h2>{settings.outdoor_tables}</h2>
              <small>Outdoor Tables</small>
            </article>

            <article className="admin-stat-card">
              <span className="stat-icon">▦</span>
              <p>إجمالي الطاولات</p>
              <h2>{totalTables}</h2>
              <small>كل طاولات المطعم</small>
            </article>

            <article className="admin-stat-card">
              <span className="stat-icon">♙</span>
              <p>السعة الإجمالية</p>
              <h2>{totalCapacity}</h2>
              <small>فرد حسب الإعداد الحالي</small>
            </article>
          </div>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h2>إعدادات الطاولات</h2>
                <p>
                  {permissions.canUpdate
                    ? "يمكنك تعديل الأعداد حسب سعة المطعم الفعلية"
                    : "يمكنك الاطلاع على إعدادات الطاولات"}
                </p>
              </div>
            </div>

            <div className="admin-stats">
              <article className="admin-stat-card">
                <span className="stat-icon">⌂</span>
                <p>عدد طاولات Indoor</p>

                {permissions.canUpdate ? (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.indoor_tables}
                    onChange={(e) =>
                      updateSetting("indoor_tables", e.target.value)
                    }
                  />
                ) : (
                  <h2>{settings.indoor_tables}</h2>
                )}
              </article>

              <article className="admin-stat-card">
                <span className="stat-icon">☀</span>
                <p>عدد طاولات Outdoor</p>

                {permissions.canUpdate ? (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.outdoor_tables}
                    onChange={(e) =>
                      updateSetting("outdoor_tables", e.target.value)
                    }
                  />
                ) : (
                  <h2>{settings.outdoor_tables}</h2>
                )}
              </article>

              <article className="admin-stat-card">
                <span className="stat-icon">♙</span>
                <p>الأفراد لكل طاولة</p>

                {permissions.canUpdate ? (
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={settings.seats_per_table}
                    onChange={(e) =>
                      updateSetting("seats_per_table", e.target.value)
                    }
                  />
                ) : (
                  <h2>{settings.seats_per_table}</h2>
                )}
              </article>
            </div>

            {permissions.canUpdate && (
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                style={{
                  marginTop: 24,
                  padding: "13px 30px",
                  border: "none",
                  borderRadius: 8,
                  background: "#b88946",
                  color: "#fff",
                  fontWeight: "bold",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </button>
            )}
          </section>

          <section className="admin-panel" style={{ marginTop: 25 }}>
            <div className="admin-panel-heading">
              <div>
                <h2>معلومات إدارة الصالة</h2>
                <p>الخطوات القادمة لتطوير نظام الحجوزات</p>
              </div>
            </div>

            <div className="admin-reservation-list">
              <div className="admin-reservation-item">
                <div>
                  <strong>إدارة مواعيد الحجز</strong>
                  <p>تحديد ساعات استقبال الحجوزات</p>
                </div>
                <span>قريبًا</span>
              </div>

              <div className="admin-reservation-item">
                <div>
                  <strong>إدارة أيام الإجازات</strong>
                  <p>إيقاف الحجوزات في أيام محددة</p>
                </div>
                <span>قريبًا</span>
              </div>

              <div className="admin-reservation-item">
                <div>
                  <strong>التحكم في توافر الصالة</strong>
                  <p>إيقاف الحجوزات الداخلية أو الخارجية مؤقتًا</p>
                </div>
                <span>قريبًا</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
