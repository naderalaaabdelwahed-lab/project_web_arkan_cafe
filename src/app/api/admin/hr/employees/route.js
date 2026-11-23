import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, scryptSync } from "node:crypto";

function adminClient() {
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
  const db = adminClient();
  const { data: admin, error: adminError } = await db.from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (adminError || !admin) return { response: NextResponse.json({ error: "غير مسموح." }, { status: 403 }) };
  return { db, user: data.user };
}
function clean(body) {
  const full_name = String(body.full_name || "").trim();
  if (full_name.length < 2 || full_name.length > 150) throw new Error("اكتب اسم الموظف بشكل صحيح.");
  const number = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0;
  return {
    full_name,
    phone: String(body.phone || "").trim() || null,
    job_title: String(body.job_title || "").trim() || null,
    department: String(body.department || "").trim() || null,
    hire_date: body.hire_date || new Date().toISOString().slice(0, 10),
    monthly_salary: number(body.monthly_salary),
    overtime_hour_rate: number(body.overtime_hour_rate),
    paid_leave_days: number(body.paid_leave_days),
    daily_work_hours: Math.min(24, Math.max(1, Number(body.daily_work_hours) || 8)),
    notes: String(body.notes || "").trim() || null,
    photo_path: String(body.photo_path || "").trim() || null,
  };
}
export async function GET(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const { data, error } = await auth.db.from("hr_employees").select("id,full_name,phone,photo_path,job_title,department,hire_date,employment_status,monthly_salary,overtime_hour_rate,paid_leave_days,daily_work_hours,notes,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    const { data: faceProfiles, error: faceError } = await auth.db.from("hr_employee_face_profiles").select("employee_id");
    if (faceError) throw faceError;
    const faceIds = new Set((faceProfiles || []).map((profile) => profile.employee_id));
    const employees = await Promise.all((data || []).map(async (employee) => {
      const photoUrl = employee.photo_path
        ? (await auth.db.storage.from("hr-employee-photos").createSignedUrl(employee.photo_path, 300)).data?.signedUrl || null
        : null;
      return { ...employee, photo_url: photoUrl, has_face_profile: faceIds.has(employee.id) };
    }));
    return NextResponse.json({ employees });
  } catch (error) {
    console.error("HR employees GET:", error);
    return NextResponse.json({ error: error.message || "تعذر تحميل الموظفين." }, { status: 500 });
  }
}
export async function POST(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const values = clean(body);
    const { data, error } = await auth.db.from("hr_employees").insert(values).select("id,full_name,phone,photo_path,job_title,department,hire_date,employment_status,monthly_salary,overtime_hour_rate,paid_leave_days,daily_work_hours,notes").single();
    if (error) throw error;
    return NextResponse.json({ employee: data }, { status: 201 });
  } catch (error) {
    console.error("HR employees POST:", error);
    return NextResponse.json({ error: error.message || "تعذر إضافة الموظف." }, { status: 400 });
  }
}
export async function PATCH(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "معرّف الموظف غير صحيح." }, { status: 400 });
    }
    if (body.action === "set_pin") {
      const pin = String(body.pin || "");
      if (!/^\d{4,8}$/.test(pin)) {
        return NextResponse.json({ error: "الرقم السري يجب أن يكون من 4 إلى 8 أرقام." }, { status: 400 });
      }
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(pin, salt, 64).toString("hex");
      const { error } = await auth.db.from("hr_employees")
        .update({ attendance_pin_hash: salt + ":" + hash, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action === "deactivate" || body.action === "activate") {
      const { data, error } = await auth.db.from("hr_employees")
        .update({ employment_status: body.action === "activate" ? "active" : "inactive", updated_at: new Date().toISOString() })
        .eq("id", id).select("id,employment_status").single();
      if (error) throw error;
      return NextResponse.json({ employee: data });
    }
    const values = clean(body);
    const { data, error } = await auth.db.from("hr_employees")
      .update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
      .select("id,full_name,phone,photo_path,job_title,department,hire_date,employment_status,monthly_salary,overtime_hour_rate,paid_leave_days,daily_work_hours,notes").single();
    if (error) throw error;
    return NextResponse.json({ employee: data });
  } catch (error) {
    console.error("HR employees PATCH:", error);
    return NextResponse.json({ error: error.message || "تعذر تعديل الموظف." }, { status: 400 });
  }
}
