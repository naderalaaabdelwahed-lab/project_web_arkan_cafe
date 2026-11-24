import { NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
  const p = cairoParts(date);
  return p.year + "-" + p.month + "-" + p.day;
}
function addDays(value, amount) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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
  return current.count <= 20;
}
function latestMovement(rows) {
  const events = [];
  for (const row of rows || []) {
    if (row.check_in_at) events.push({ action: "check_in", recorded_at: row.check_in_at, shift_date: row.shift_date });
    if (row.check_out_at) events.push({ action: "check_out", recorded_at: row.check_out_at, shift_date: row.shift_date });
  }
  events.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  return events[0] || null;
}

export async function GET(request) {
  try {
    const db = dbClient();
    const employeeId = new URL(request.url).searchParams.get("employee_id");
    if (!employeeId) {
      const { data, error } = await db.from("hr_employees")
        .select("id,full_name,job_title")
        .eq("employment_status", "active")
        .not("attendance_pin_hash", "is", null)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ employees: data || [] });
    }
    if (!/^[0-9a-f-]{36}$/i.test(employeeId)) {
      return NextResponse.json({ error: "اختيار الموظف غير صحيح." }, { status: 400 });
    }
    const { data: employee, error: employeeError } = await db.from("hr_employees")
      .select("id,full_name").eq("id", employeeId).eq("employment_status", "active").maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee) return NextResponse.json({ error: "الموظف غير موجود أو غير نشط." }, { status: 404 });

    const [{ data: rows, error: rowsError }, { data: openRows, error: openError }] = await Promise.all([
      db.from("hr_attendance").select("shift_date,check_in_at,check_out_at")
        .eq("employee_id", employeeId).order("shift_date", { ascending: false }).limit(10),
      db.from("hr_attendance").select("shift_date,check_in_at")
        .eq("employee_id", employeeId).not("check_in_at", "is", null)
        .is("check_out_at", null).is("checkout_skipped_at", null).order("shift_date", { ascending: false }).limit(1)
    ]);
    if (rowsError) throw rowsError;
    if (openError) throw openError;
    const today = cairoDate(new Date());
    const openPrevious = (openRows || []).find(row => row.shift_date < today) || null;
    return NextResponse.json({
      employee,
      last_movement: latestMovement(rows),
      open_previous_shift: openPrevious ? { shift_date: openPrevious.shift_date, check_in_at: openPrevious.check_in_at } : null
    });
  } catch (error) {
    console.error("HR attendance-code GET:", error);
    return NextResponse.json({ error: "تعذر تحميل بيانات الموظف." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    if (!rateLimit(ip)) return NextResponse.json({ error: "محاولات كثيرة. انتظر 10 دقائق ثم حاول مرة أخرى." }, { status: 429 });
    const body = await request.json();
    const action = String(body.action || "");
    const code = String(body.code || "").trim();
    const employeeId = String(body.employee_id || "");
    if (!["check_in", "check_out", "skip_previous"].includes(action)) {
      return NextResponse.json({ error: "اختار حضور أو انصراف." }, { status: 400 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return NextResponse.json({ error: "اختار الموظف أولاً." }, { status: 400 });
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "أدخل كودًا صحيحًا مكوّنًا من 6 أرقام." }, { status: 400 });

    const db = dbClient();
    const { data: employee, error: employeeError } = await db.from("hr_employees")
      .select("id,full_name,daily_work_hours,attendance_pin_hash")
      .eq("id", employeeId).eq("employment_status", "active").maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee || !verifyCode(code, employee.attendance_pin_hash)) {
      return NextResponse.json({ error: "الكود غير صحيح أو الموظف غير نشط. راجع الإدارة." }, { status: 401 });
    }

    const now = new Date();
    const today = cairoDate(now);
    const todayRow = await db.from("hr_attendance").select("id,check_in_at")
      .eq("employee_id", employee.id).eq("shift_date", today).maybeSingle();
    if (todayRow.error) throw todayRow.error;

    if (action === "skip_previous") {
      const { data: skipped, error: skipError } = await db.rpc("hr_skip_previous_checkout_and_check_in", {
        p_employee_id: employee.id,
        p_shift_date: today,
        p_check_in_at: now.toISOString()
      });
      if (skipError) {
        if (skipError.code === "23505") return NextResponse.json({ error: "تم تسجيل حضور الموظف لهذا اليوم بالفعل." }, { status: 409 });
        if (skipError.code === "P0002") return NextResponse.json({ error: "مفيش حضور سابق مفتوح يحتاج التجاوز." }, { status: 409 });
        throw skipError;
      }
      return NextResponse.json({
        success: true,
        employee_name: employee.full_name,
        action: "check_in",
        recorded_at: now.toISOString(),
        shift_date: today,
        skipped_previous_checkout: true,
        previous_shift_date: skipped?.skipped_shift_date || null
      });
    }

    if (action === "check_in") {
      if (todayRow.data?.check_in_at) {
        return NextResponse.json({ error: "تم تسجيل حضور الموظف لهذا اليوم بالفعل." }, { status: 409 });
      }
      const { data: openRows, error: openError } = await db.from("hr_attendance")
        .select("id,shift_date,check_in_at").eq("employee_id", employee.id)
        .not("check_in_at", "is", null).is("check_out_at", null).is("checkout_skipped_at", null)
        .lt("shift_date", today).order("shift_date", { ascending: false }).limit(1);
      if (openError) throw openError;
      const openPrevious = openRows?.[0] || null;
      if (openPrevious) {
        return NextResponse.json({
          needs_skip: true,
          open_shift_date: openPrevious.shift_date,
          error: "فيه حضور مفتوح من يوم سابق من غير انصراف. راجع التاريخ واضغط زر تجاوز الانصراف السابق لتسجيل حضور اليوم."
        }, { status: 409 });
      }
      const saved = await db.from("hr_attendance").insert({
        employee_id: employee.id, shift_date: today, check_in_at: now.toISOString(),
        check_in_method: "pin", attendance_status: "present", late_minutes: 0, updated_at: now.toISOString()
      });
      if (saved.error) {
        if (saved.error.code === "23505") return NextResponse.json({ error: "تم تسجيل حضور الموظف لهذا اليوم بالفعل." }, { status: 409 });
        throw saved.error;
      }
      return NextResponse.json({
        success: true, employee_name: employee.full_name, action: "check_in",
        recorded_at: now.toISOString(), shift_date: today
      });
    }
    const parts = cairoParts(now);
    const checkoutShiftDate = Number(parts.hour) < 4 ? addDays(today, -1) : today;
    const { data: open, error: openError } = await db.from("hr_attendance")
      .select("id,shift_date,check_in_at").eq("employee_id", employee.id)
      .eq("shift_date", checkoutShiftDate)
      .not("check_in_at", "is", null).is("check_out_at", "is", null).is("checkout_skipped_at", "is", null).maybeSingle();
    if (openError) throw openError;
    if (!open) {
      return NextResponse.json({
        error: Number(parts.hour) < 4
          ? "مفيش حضور مفتوح بتاريخ أمس لتسجيل الانصراف عليه."
          : "مفيش حضور مفتوح لليوم. سجل الحضور الأول."
      }, { status: 409 });
    }
    const worked = Math.max(0, Math.round((now - new Date(open.check_in_at)) / 60000));
    const planned = Math.round(Number(employee.daily_work_hours || 8) * 60);
    const overtime = Math.max(0, worked - planned);
    const shortage = Math.max(0, planned - worked);
    const { error: updateError } = await db.from("hr_attendance").update({
      check_out_at: now.toISOString(), check_out_method: "pin", worked_minutes: worked,
      overtime_minutes: overtime, shortage_minutes: shortage, updated_at: now.toISOString()
    }).eq("id", open.id);
    if (updateError) throw updateError;
    return NextResponse.json({
      success: true, employee_name: employee.full_name, action,
      recorded_at: now.toISOString(), shift_date: open.shift_date
    });
  } catch (error) {
    console.error("HR attendance code:", error);
    return NextResponse.json({ error: "حصل خطأ أثناء التسجيل. حاول مرة أخرى أو راجع المدير." }, { status: 500 });
  }
}
