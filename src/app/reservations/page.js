
"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";

const initialForm = {
  name: "",
  phone: "",
  date: "",
  time: "",
  guests: "2",
  seatingArea: "indoor",
  notes: "",
};

export default function ReservationsPage() {
  const [form, setForm] = useState(initialForm);
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [minimumDate, setMinimumDate] = useState("");

  async function loadSettings() {
    setLoadingSettings(true);

    const { data, error } = await supabase
      .from("restaurant_settings")
      .select("indoor_tables, outdoor_tables, seats_per_table")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Settings error:", error);
      setMessage("تعذر تحميل إعدادات الصالة. حاول تحديث الصفحة.");
      setMessageType("error");
    } else {
      setSettings(data);
    }

    setLoadingSettings(false);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setMessage("");
  }

  function getLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  useEffect(() => {
    setMinimumDate(getLocalDate());
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (submitting) return;

    if (!settings) {
      setMessage("إعدادات الصالة غير متاحة حاليًا.");
      setMessageType("error");
      return;
    }

    if (form.date < getLocalDate()) {
      setMessage("لا يمكن اختيار تاريخ سابق.");
      setMessageType("error");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const guests = Number(form.guests);

      const tables =
        form.seatingArea === "indoor"
          ? settings.indoor_tables
          : settings.outdoor_tables;

      const capacity = tables * settings.seats_per_table;

      if (capacity < guests) {
        setMessage("عدد الأفراد أكبر من السعة المتاحة في هذه الصالة.");
        setMessageType("error");
        return;
      }

      // جلب الحجوزات النشطة لنفس التاريخ والوقت والمنطقة
      const { data: existingReservations, error: reservationsError } =
        await supabase
          .from("reservations")
          .select("guests")
          .eq("reservation_date", form.date)
          .eq("reservation_time", form.time)
          .eq("seating_area", form.seatingArea)
          .in("status", ["pending", "confirmed"]);

      if (reservationsError) {
        throw reservationsError;
      }

      const reservedGuests = (existingReservations || []).reduce(
        (total, reservation) => total + Number(reservation.guests || 0),
        0
      );

      const availableSeats = Math.max(0, capacity - reservedGuests);

      if (guests > availableSeats) {
        setMessage(
          availableSeats > 0
            ? `عذرًا، المتاح حاليًا ${availableSeats} فرد فقط في هذا الموعد.`
            : "عذرًا، هذا الموعد مكتمل الحجز. اختار موعدًا آخر."
        );
        setMessageType("error");
        return;
      }

      // تسجيل الحجز في Supabase
      const { error: insertError } = await supabase
        .from("reservations")
        .insert({
          customer_name: form.name.trim(),
          phone: form.phone.trim(),
          reservation_date: form.date,
          reservation_time: form.time,
          guests,
          notes: form.notes.trim(),
          seating_area: form.seatingArea,
          status: "pending",
        });

      if (insertError) {
        throw insertError;
      }

      setMessage(
        "تم استلام طلب الحجز بنجاح! سنتواصل معك لتأكيد الحجز."
      );
      setMessageType("success");
      setForm(initialForm);
    } catch (error) {
      console.error("Reservation error:", error);

      setMessage(
        "حصلت مشكلة أثناء تسجيل الحجز. حاول مرة أخرى."
      );
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTables =
    settings && form.seatingArea === "indoor"
      ? settings.indoor_tables
      : settings?.outdoor_tables;

  const totalCapacity = settings
    ? selectedTables * settings.seats_per_table
    : 0;

  return (
    <main dir="rtl">
      <Navbar />

      <section className="reservation-section">
        <div className="reservation-heading">
          <span className="eyebrow">ARKAN RESERVATIONS</span>
          <h1>
            احجز <span>ترابيزتك</span>
          </h1>
          <p>
            خطط لزيارتك وسيب الباقي علينا. املأ بيانات الحجز
            وهنكون مستنيينك في أركان.
          </p>
        </div>

        <div className="reservation-container">
          <div className="reservation-info">
            <span className="eyebrow">YOUR TABLE IS WAITING</span>
            <h2>
              لحظات حلوة
              <br />
              بتبدأ من أركان
            </h2>
            <p>
              سواء خروجة مع أصحابك أو وقت مميز مع العيلة،
              احجز مكانك واستمتع بتجربتك.
            </p>

            <div className="reservation-detail">
              <span>✦</span>
              <div>
                <strong>حجز سهل وسريع</strong>
                <p>سجل بياناتك في أقل من دقيقة</p>
              </div>
            </div>

            <div className="reservation-detail">
              <span>◈</span>
              <div>
                <strong>تأكيد الحجز</strong>
                <p>هنراجع طلبك ونتواصل معاك للتأكيد</p>
              </div>
            </div>

            {settings && (
              <div className="reservation-detail">
                <span>♧</span>
                <div>
                  <strong>اختيار مكانك</strong>
                  <p>متاح الحجز داخل المطعم أو في الهواء الطلق</p>
                </div>
              </div>
            )}
          </div>

          <form className="reservation-form" onSubmit={handleSubmit}>
            <h2>بيانات الحجز</h2>
            <p>من فضلك املأ البيانات التالية</p>

            <div className="reservation-fields">
              <label>
                الاسم بالكامل
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="اكتب اسمك"
                  required
                />
              </label>

              <label>
                رقم الموبايل
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="01xxxxxxxxx"
                  pattern="01[0125][0-9]{8}"
                  title="اكتب رقم موبايل مصري صحيح"
                  required
                />
              </label>

              <label>
                نوع الصالة
                <select
                  name="seatingArea"
                  value={form.seatingArea}
                  onChange={handleChange}
                  required
                  disabled={loadingSettings || !settings}
                >
                  <option value="indoor">الصالة الداخلية Indoor</option>
                  <option value="outdoor">الصالة الخارجية Outdoor</option>
                </select>
              </label>

              {settings && (
                <div className="reservation-detail">
                  <span>♧</span>
                  <div>
                    <strong>سعة الصالة المختارة</strong>
                    <p>
                      {selectedTables} طاولة × {settings.seats_per_table} أفراد
                      = {totalCapacity} فرد
                    </p>
                  </div>
                </div>
              )}

              <label>
                تاريخ الحجز
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  min={minimumDate}
                  required
                />
              </label>

              <label>
                وقت الحجز
                <input
                  type="time"
                  name="time"
                  value={form.time}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                عدد الأفراد
                <select
                  name="guests"
                  value={form.guests}
                  onChange={handleChange}
                  required
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((number) => (
                    <option key={number} value={number}>
                      {number} {number === 1 ? "فرد" : "أفراد"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="reservation-notes">
                ملاحظات إضافية (اختياري)
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="أي طلبات أو ملاحظات..."
                  rows="3"
                />
              </label>
            </div>

            <button
              type="submit"
              className="primary-button reservation-submit"
              disabled={submitting || loadingSettings || !settings}
            >
              {loadingSettings
                ? "جاري تحميل الإعدادات..."
                : submitting
                ? "جاري تسجيل الحجز..."
                : "تأكيد طلب الحجز"}
            </button>

            {message && (
              <div
                className={
                  messageType === "success"
                    ? "reservation-success"
                    : "reservation-error"
                }
                role="status"
              >
                {message}
              </div>
            )}
          </form>
        </div>
      </section>

      <Footer />
    </main>
  );
}
