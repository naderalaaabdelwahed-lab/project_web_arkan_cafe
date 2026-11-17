
"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ReservationsPage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    date: "",
    time: "",
    guests: "2",
    notes: "",
  });

  const [message, setMessage] = useState("");

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();

    const reservations = JSON.parse(
      localStorage.getItem("arkan-reservations") || "[]"
    );

    const newReservation = {
      id: Date.now(),
      ...form,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    localStorage.setItem(
      "arkan-reservations",
      JSON.stringify([...reservations, newReservation])
    );

    setMessage("تم استلام طلب الحجز بنجاح! سنتواصل معك لتأكيد الحجز.");
    setForm({
      name: "",
      phone: "",
      date: "",
      time: "",
      guests: "2",
      notes: "",
    });
  }

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
            <h2>لحظات حلوة<br />بتبدأ من أركان</h2>
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
                تاريخ الحجز
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  min={new Date().toLocaleDateString("en-CA")}
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

            <button type="submit" className="primary-button reservation-submit">
              تأكيد طلب الحجز
            </button>

            {message && (
              <div className="reservation-success" role="status">
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
