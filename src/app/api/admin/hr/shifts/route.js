import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authorize(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: NextResponse.json({ error: "سجل دخول المدير أولاً." }, { status: 401 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase auth configuration is missing.");
  const auth = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data?.user) return { response: NextResponse.json({ error: "جلسة الدخول غير صالحة." }, { status: 401 }) };
  const db = serviceClient();
  const { data: admin, error: adminError } = await db.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (adminError || !admin) return { response: NextResponse.json({ error: "غير مسموح." }, { status: 403 }) };
  return { db };
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const [shifts, employees, assignments] = await Promise.all([
      auth.db.from("hr_shifts").select("*").order("created_at", { ascending: false }),
      auth.db.from("hr_employees").select("id,full_name,job_title,department,employment_status").order("full_name"),
      auth.db.from("hr_employee_shift_assignments").select("id,employee_id,shift_id,effective_from,effective_to,weekday").order("effective_from", { ascending: false }),
    ]);
    for (const result of [shifts, employees, assignments]) if (result.error) throw result.error;
    return NextResponse.json({ shifts: shifts.data || [], employees: employees.data || [], assignments: assignments.data || [] });
  } catch (error) {
    console.error("HR shifts GET:", error);
    return NextResponse.json({ error: error.message || "تعذر تحميل الشيفتات." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    if (body.action === "assign") {
      const employeeId = String(body.employee_id || "");
      const shiftId = String(body.shift_id || "");
      const effectiveFrom = String(body.effective_from || "");
      const effectiveTo = String(body.effective_to || "");
      const weekday = body.weekday === "" || body.weekday == null ? null : Number(body.weekday);
      if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !/^[0-9a-f-]{36}$/i.test(shiftId) || !datePattern.test(effectiveFrom)) {
        return NextResponse.json({ error: "اختار الموظف والشيفت وتاريخ بداية صحيح." }, { status: 400 });
      }
      if (effectiveTo && (!datePattern.test(effectiveTo) || effectiveTo < effectiveFrom)) {
        return NextResponse.json({ error: "تاريخ نهاية التكليف غير صحيح." }, { status: 400 });
      }
      if (weekday !== null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
        return NextResponse.json({ error: "يوم الأسبوع غير صحيح." }, { status: 400 });
      }
      const { data, error } = await auth.db.from("hr_employee_shift_assignments").insert({
        employee_id: employeeId, shift_id: shiftId, effective_from: effectiveFrom,
        effective_to: effectiveTo || null, weekday,
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ assignment: data }, { status: 201 });
    }

    const name = String(body.name || "").trim();
    const startTime = String(body.start_time || "");
    const endTime = String(body.end_time || "");
    const breakMinutes = Number(body.break_minutes ?? 0);
    const graceMinutes = Number(body.grace_minutes ?? 0);
    const isFlexible = body.is_flexible === true;
    const latestCheckIn = String(body.latest_check_in || "");
    if (name.length < 2 || name.length > 80 || !timePattern.test(startTime) || !timePattern.test(endTime) || startTime === endTime) {
      return NextResponse.json({ error: "راجع اسم الشيفت ووقت البداية والنهاية." }, { status: 400 });
    }
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 600 || !Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 240 || (isFlexible && !timePattern.test(latestCheckIn))) {
      return NextResponse.json({ error: "مدة الراحة أو السماح غير صحيحة." }, { status: 400 });
    }
    const crossesMidnight = endTime < startTime;
    const { data, error } = await auth.db.from("hr_shifts").insert({
      name, start_time: startTime, end_time: endTime, crosses_midnight: crossesMidnight,
      break_minutes: breakMinutes, grace_minutes: graceMinutes, is_flexible: isFlexible, latest_check_in: isFlexible ? latestCheckIn : null, is_active: true,
    }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ shift: data }, { status: 201 });
  } catch (error) {
    console.error("HR shifts POST:", error);
    return NextResponse.json({ error: error.message || "تعذر حفظ الشيفت." }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "معرّف الشيفت غير صحيح." }, { status: 400 });
    const values = body.action === "update" ? {
      name: String(body.name || "").trim(),
      start_time: String(body.start_time || ""),
      end_time: String(body.end_time || ""),
      crosses_midnight: String(body.end_time || "") < String(body.start_time || ""),
      break_minutes: Number(body.break_minutes ?? 0),
      grace_minutes: Number(body.grace_minutes ?? 0),
      is_flexible: body.is_flexible === true,
      latest_check_in: body.is_flexible === true ? String(body.latest_check_in || "") : null,
    } : { is_active: body.is_active === true };
    if (body.action === "update" && (values.name.length < 2 || values.name.length > 80 || !timePattern.test(values.start_time) || !timePattern.test(values.end_time) || values.start_time === values.end_time || !Number.isInteger(values.break_minutes) || values.break_minutes < 0 || values.break_minutes > 600 || !Number.isInteger(values.grace_minutes) || values.grace_minutes < 0 || values.grace_minutes > 240 || (values.is_flexible && !timePattern.test(values.latest_check_in)))) {
      return NextResponse.json({ error: "راجع بيانات الشيفت." }, { status: 400 });
    }
    const { data, error } = await auth.db.from("hr_shifts").update(values).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ shift: data });
  } catch (error) {
    console.error("HR shifts PATCH:", error);
    return NextResponse.json({ error: error.message || "تعذر تعديل الشيفت." }, { status: 400 });
  }
}
