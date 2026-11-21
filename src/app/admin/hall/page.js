
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function HallManagementPage() {
  const [settings, setSettings] = useState({
    indoor_tables: 10,
    outdoor_tables: 6,
    seats_per_table: 4,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("restaurant_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      setError("فشل تحميل إعدادات الصالة: " + error.message);
    } else {
      setSettings({
        indoor_tables: data.indoor_tables,
        outdoor_tables: data.outdoor_tables,
        seats_per_table: data.seats_per_table,
      });
    }

    setLoading(false);
  }

  function updateSetting(name, value) {
    setSettings((previous) => ({
      ...previous,
      [name]: value,
    }));

    setMessage("");
    setError("");
  }

  async function saveSettings() {
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

    const { error } = await supabase
      .from("restaurant_settings")
      .update({
        indoor_tables: indoor,
        outdoor_tables: outdoor,
        seats_per_table: seats,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      setError("فشل حفظ الإعدادات: " + error.message);
    } else {
      setSettings({
        indoor_tables: indoor,
        outdoor_tables: outdoor,
        seats_per_table: seats,
      });
      setMessage("تم حفظ إعدادات الصالة بنجاح.");
    }

    setSaving(false);
  }

  const totalTables =
    Number(settings.indoor_tables || 0) +
    Number(settings.outdoor_tables || 0);

  const totalCapacity =
    totalTables * Number(settings.seats_per_table || 0);

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
                <p>يمكنك تعديل الأعداد حسب سعة المطعم الفعلية</p>
              </div>
            </div>

            <div className="admin-stats">
              <article className="admin-stat-card">
                <span className="stat-icon">⌂</span>
                <p>عدد طاولات Indoor</p>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={settings.indoor_tables}
                  onChange={(e) =>
                    updateSetting("indoor_tables", e.target.value)
                  }
                />
              </article>

              <article className="admin-stat-card">
                <span className="stat-icon">☀</span>
                <p>عدد طاولات Outdoor</p>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={settings.outdoor_tables}
                  onChange={(e) =>
                    updateSetting("outdoor_tables", e.target.value)
                  }
                />
              </article>

              <article className="admin-stat-card">
                <span className="stat-icon">♙</span>
                <p>الأفراد لكل طاولة</p>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={settings.seats_per_table}
                  onChange={(e) =>
                    updateSetting("seats_per_table", e.target.value)
                  }
                />
              </article>
            </div>

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
