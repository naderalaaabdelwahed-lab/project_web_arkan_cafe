"use client";

import { useEffect, useRef, useState } from "react";

export default function FaceEnrollment({ employee, request, onDone }) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cameraError, setCameraError] = useState("");
  const video = useRef(null);
  const stream = useRef(null);

  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

  async function startCamera() {
    setCameraError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = media;
      if (video.current) video.current.srcObject = media;
    } catch {
      setCameraError("تعذر تشغيل الكاميرا. اسمح للمتصفح باستخدامها وافتح الموقع عبر HTTPS أو localhost.");
    }
  }

  function capture() {
    const element = video.current;
    if (!element || !element.videoWidth) throw new Error("شغّل الكاميرا وانتظر ظهور الصورة أولاً.");
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext("2d").drawImage(element, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  async function enroll() {
    setBusy(true);
    setNotice("");
    try {
      if (!consent) throw new Error("أكد موافقة الموظف أولاً.");
      const image_base64 = capture();
      await request("/api/admin/hr/employees/face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employee.id, image_base64, consent_confirmed: true }),
      });
      setNotice("تم تسجيل بصمة الوجه بنجاح.");
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      await onDone?.();
    } catch (error) {
      setNotice(error.message || "تعذر تسجيل بصمة الوجه.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("حذف بصمة الوجه المخزنة لهذا الموظف؟")) return;
    setBusy(true);
    setNotice("");
    try {
      await request("/api/admin/hr/employees/face", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      setNotice("تم حذف بصمة الوجه.");
      await onDone?.();
    } catch (error) {
      setNotice(error.message || "تعذر حذف بصمة الوجه.");
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ display: "inline-grid", gap: 6, marginTop: 7 }}>
    <button type="button" onClick={() => { setOpen(!open); setNotice(""); }} style={{ marginLeft: 8 }}>
      {employee.has_face_profile ? "تحديث بصمة الوجه" : "تسجيل بصمة الوجه"}
    </button>
    {employee.has_face_profile && <button type="button" disabled={busy} onClick={remove}>حذف البصمة</button>}
    {open && <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#000b", display: "grid", placeItems: "center", padding: 16 }}>
      <section dir="rtl" style={{ width: "min(100%, 480px)", background: "#1c2935", color: "#fff", border: "1px solid #526477", borderRadius: 14, padding: 18, display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>تسجيل بصمة الوجه — {employee.full_name}</h3>
        <p style={{ margin: 0, color: "#c4d0da", fontSize: 13 }}>اطلب من الموظف النظر للكاميرا في إضاءة جيدة، بدون أشخاص آخرين في الصورة. سيتم تخزين قالب رقمي مشفر وليس صورة التسجيل.</p>
        <video ref={video} autoPlay playsInline muted style={{ width: "100%", maxHeight: 260, objectFit: "cover", background: "#000", borderRadius: 8 }} />
        <button type="button" onClick={startCamera}>تشغيل الكاميرا</button>
        <label style={{ display: "flex", gap: 8, alignItems: "start", fontSize: 13 }}>
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          أؤكد أن الموظف وافق على تسجيل واستخدام بصمة وجهه للحضور والانصراف، وتم إبلاغه بكيفية حفظها وحذفها.
        </label>
        {cameraError && <p role="alert" style={{ color: "#ff9c9c", margin: 0 }}>{cameraError}</p>}
        {notice && <p role="status" style={{ color: "#e7c98d", margin: 0 }}>{notice}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={busy || !consent} onClick={enroll}>{busy ? "جارٍ الحفظ..." : "التقاط وتسجيل البصمة"}</button>
          <button type="button" onClick={() => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setOpen(false); }}>إغلاق</button>
        </div>
      </section>
    </div>}
  </div>;
}
