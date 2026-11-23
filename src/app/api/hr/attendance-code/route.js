import { NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const attempts = new Map();

function dbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function verifyCode(code, encoded) {
  if (!encoded || typeof encoded !== "string") return false;
  const [algorithm, salt, stored] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !stored) return false;
  try {
    const actual = scryptSync(code, salt, 64);
    const expected = Buffer.from(stored, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
function cairoParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(part => [part.type, part.value]));
}
function cairoDate(date) {
  const parts = cairoParts(date);
  return parts.year + "-" + parts.month + "-" + parts.day;
}
function weekday(dateString) { return new Date(dateString + "T00:00:00Z").getUTCDay(); }
function localToUtc(dateString, timeString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = String(timeString).slice(0, 5).split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = cairoParts(new Date(guess));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    guess += target - represented;
  }
  return new Date(guess);
}
async function getShift(db, employeeId, date) {
  const { data, error } = await db.from("hr_employee_shift_assignments")
    .select("id,shift_id,effective_from,effective_to,weekday,hr_shifts(*)")
    .eq("employee_id", employeeId).lte("effective_from", date);
  if (error) throw error;
  return (data || []).find(item =>
    (!item.effective_to || item.effective_to >= date) &&
    (item.weekday === null || item.weekday === weekday(date)) &&
    item.hr_shifts?.is_active
  ) || null;
}
function rateLimit(ip) {
  const now = Date.now();
  const current = attempts.get(ip) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (now > current.resetAt) { current.count = 0; current.resetAt = now + 10 * 60 * 1000; }
  current.count += 1;
  attempts.set(ip, current);
  if (attempts.size > 5000) {
    for (const [key, value] of attempts) if (now > value.resetAt) attempts.delete(key);
  }
  return current.count <= 10;
}

export async function POST(request) {
  try {
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    if (!rateLimit(ip)) return NextResponse.json({ error: "محاولات كثيرة. انتظر 10 دقائق ثم حاول مرة أخرى." }, { status: 429 });
    const body = await request.json();
    const action = String(body.action || "");
    const code = String(body.code || "").trim();
    if (!["check_in", "check_out"].includes(action)) return NextResponse.json({ error: "اختار حضور أو انصراف." }, { status: 400 });
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "أدخل كودًا صحيحًا مكوّنًا من 6 أرقام." }, { status: 400 });

    const db = dbClient();
    const { data: employees, error: employeeError } = await db.from("hr_employees")
      .select("id,full_name,daily_work_hours,attendance_pin_hash")
      .eq("employment_status", "active").not("attendance_pin_hash", "is", null);
    if (employeeError) throw employeeError;
    const matches = (employees || []).filter(employee => verifyCode(code, employee.attendance_pin_hash));
    if (matches.length !== 1) {
      return NextResponse.json({ error: "الكود غير صحيح أو الموظف غير نشط. راجع الإدارة." }, { status: 401 });
    }
    const employee = matches[0];
    const now = new Date();
    const today = cairoDate(now);

    if (action === "check_in") {
      const assignment = await getShift(db, employee.id, today);
      const shift = assignment?.hr_shifts || null;
      const { data: existing, error } = await db.from("hr_attendance")
        .select("id,check_in_at").eq("employee_id", employee.id).eq("shift_date", today).maybeSingle();
      if (error) throw error;
      if (existing?.check_in_at) return NextResponse.json({ error: "تم تسجيل حضورك لهذا اليوم بالفعل." }, { status: 409 });
      let lateMinutes = 0;
      if (shift?.is_flexible && shift.latest_check_in) {
        const cutoff = new Date(localToUtc(today, shift.latest_check_in).getTime() + Number(shift.grace_minutes || 0) * 60000);
        if (now > cutoff) return NextResponse.json({ error: "انتهى وقت الحضور المسموح لهذا الشيفت." }, { status: 409 });
      } else if (shift) {
        lateMinutes = Math.max(0, Math.floor((now - localToUtc(today, shift.start_time)) / 60000) - Number(shift.grace_minutes || 0));
      }
      const values = {
        employee_id: employee.id, shift_date: today, check_in_at: now.toISOString(),
        check_in_method: "code", attendance_status: "present", late_minutes, updated_at: now.toISOString()
      };
      const saved = existing
        ? await db.from("hr_attendance").update(values).eq("id", existing.id)
        : await db.from("hr_attendance").insert(values);
      if (saved.error) {
        if (saved.error.code === "23505") return NextResponse.json({ error: "تم تسجيل حضورك لهذا اليوم بالفعل." }, { status: 409 });
        throw saved.error;
      }
      return NextResponse.json({ success: true, employee_name: employee.full_name, action, recorded_at: now.toISOString(), shift_date: today });
    }

    const { data: openRows, error: openError } = await db.from("hr_attendance")
      .select("id,shift_date,check_in_at").eq("employee_id", employee.id)
      .not("check_in_at", "is", null).is("check_out_at", null)
      .order("check_in_at", { ascending: false }).limit(1);
    if (openError) throw openError;
    const open = openRows?.[0];
    if (!open) return NextResponse.json({ error: "مفيش حضور مفتوح للموظف ده. سجل الحضور الأول." }, { status: 409 });
    const assignment = await getShift(db, employee.id, open.shift_date);
    const shift = assignment?.hr_shifts || null;
    const elapsed = Math.max(0, Math.round((now - new Date(open.check_in_at)) / 60000));
    const breakMinutes = Number(shift?.break_minutes || 0);
    const worked = Math.max(0, elapsed - breakMinutes);
    let planned = Number(employee.daily_work_hours || 8) * 60;
    if (shift) {
      const start = localToUtc(open.shift_date, shift.start_time);
      let end = localToUtc(open.shift_date, shift.end_time);
      if (shift.crosses_midnight || end <= start) end = new Date(end.getTime() + 86400000);
      planned = Math.max(0, Math.round((end - start) / 60000) - breakMinutes);
    }
    const { error: updateError } = await db.from("hr_attendance").update({
      check_out_at: now.toISOString(), check_out_method: "code", worked_minutes: worked,
      overtime_minutes: Math.max(0, worked - planned), updated_at: now.toISOString()
    }).eq("id", open.id);
    if (updateError) throw updateError;
    return NextResponse.json({ success: true, employee_name: employee.full_name, action, recorded_at: now.toISOString(), shift_date: open.shift_date });
  } catch (error) {
    console.error("HR attendance code:", error);
    return NextResponse.json({ error: "حصل خطأ أثناء التسجيل. حاول مرة أخرى أو راجع المدير." }, { status: 500 });
  }
}
