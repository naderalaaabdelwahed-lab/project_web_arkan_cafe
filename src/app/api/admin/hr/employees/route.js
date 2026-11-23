import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  if (data.user.app_metadata?.account_type === "hr_employee") return { response: NextResponse.json({ error: "حساب HR مخصص للحضور والانصراف فقط." }, { status: 403 }) };
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
    const { data, error } = await auth.db.from("hr_employees").select("id,full_name,phone,photo_path,job_title,department,hire_date,employment_status,monthly_salary,overtime_hour_rate,paid_leave_days,daily_work_hours,notes,username,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    const employees = await Promise.all((data || []).map(async (employee) => {
      const photoUrl = employee.photo_path
        ? (await auth.db.storage.from("hr-employee-photos").createSignedUrl(employee.photo_path, 300)).data?.signedUrl || null
        : null;
      return { ...employee, photo_url: photoUrl };
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
    if (body.action === "create_login") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return NextResponse.json({ error: "اسم المستخدم يجب أن يكون 3 إلى 30 حرفًا إنجليزيًا أو رقمًا." }, { status: 400 });
      }
      if (password.length < 8 || password.length > 72) {
        return NextResponse.json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف." }, { status: 400 });
      }
      const { data: employee, error: employeeError } = await auth.db.from("hr_employees")
        .select("id,full_name,auth_user_id,username").eq("id", id).maybeSingle();
      if (employeeError) throw employeeError;
      if (!employee) return NextResponse.json({ error: "الموظف غير موجود." }, { status: 404 });
      const email = username + "@employees.arkan.local";
      const { data: duplicate } = await auth.db.from("hr_employees").select("id").eq("username", username).neq("id", id).maybeSingle();
      if (duplicate) return NextResponse.json({ error: "اسم المستخدم مستخدم لموظف آخر." }, { status: 409 });
      let authUserId = employee.auth_user_id;
      let createdUser = false;
      if (authUserId) {
        const [{ data: linkedUser, error: linkedUserError }, { data: adminLink, error: adminLinkError }, { data: systemEmployee, error: systemEmployeeError }] = await Promise.all([
          auth.db.auth.admin.getUserById(authUserId),
          auth.db.from("admin_users").select("user_id").eq("user_id", authUserId).maybeSingle(),
          auth.db.from("employee_profiles").select("user_id").eq("user_id", authUserId).maybeSingle()
        ]);
        if (linkedUserError || !linkedUser?.user) throw new Error("حساب الدخول المرتبط بالموظف غير موجود.");
        if (adminLinkError || systemEmployeeError) throw new Error("تعذر التحقق من فصل حسابات النظام وHR.");
        if (adminLink || systemEmployee) throw new Error("رفض إنشاء حساب HR: هذا المستخدم مرتبط بحساب إدارة أو حساب صلاحيات النظام. أنشئ حساب HR مستقلًا.");
        const metadata = linkedUser.user.app_metadata || {};
        if (metadata.account_type && metadata.account_type !== "hr_employee") throw new Error("الحساب المرتبط ليس حساب HR مستقلًا.");
        if (metadata.employee_id && metadata.employee_id !== id) throw new Error("حساب HR مرتبط بملف موظف آخر.");
        const { error: updateAuthError } = await auth.db.auth.admin.updateUserById(authUserId, {
          password, email, email_confirm: true,
          app_metadata: { ...metadata, account_type: "hr_employee", employee_id: id }
        });
        if (updateAuthError) throw updateAuthError;
      } else {
        const { data: created, error: createAuthError } = await auth.db.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { account_type: "hr_employee", employee_id: id, display_name: employee.full_name },
          app_metadata: { account_type: "hr_employee", employee_id: id }
        });
        if (createAuthError) throw createAuthError;
        authUserId = created.user.id;
        createdUser = true;
      }
      const { error: linkError } = await auth.db.from("hr_employees")
        .update({ auth_user_id: authUserId, username, attendance_pin_hash: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (linkError) {
        if (createdUser) await auth.db.auth.admin.deleteUser(authUserId);
        throw linkError;
      }
      return NextResponse.json({ success: true, username, account_created: createdUser });
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
