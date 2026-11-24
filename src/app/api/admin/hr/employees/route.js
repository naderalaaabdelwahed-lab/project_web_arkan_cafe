import { NextResponse } from "next/server";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { authorizeAdminPermission } from "@/lib/server/admin-permissions";

async function authorize(request, permission) {
  return authorizeAdminPermission(request, permission);
}

function hashAttendanceCode(code) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(code, salt, 64).toString("hex");
  return "scrypt$" + salt + "$" + hash;
}
function verifyAttendanceCode(code, encoded) {
  if (!encoded || typeof encoded !== "string") return false;
  const [algorithm, salt, stored] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !stored) return false;
  try {
    const actual = scryptSync(code, salt, 64);
    const expected = Buffer.from(stored, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
function validateAttendanceCode(value, required = false) {
  const code = String(value || "").trim();
  if (!code && !required) return null;
  if (!/^\d{6}$/.test(code)) throw new Error("كود الحضور والانصراف يجب أن يتكون من 6 أرقام.");
  return code;
}
function clean(body) {
  const full_name = String(body.full_name || "").trim();
  if (full_name.length < 2 || full_name.length > 150) throw new Error("اكتب اسم الموظف بشكل صحيح.");
  if (body.termination_date && (!/^\d{4}-\d{2}-\d{2}$/.test(body.termination_date) || body.termination_date < (body.hire_date || "0000-00-00"))) throw new Error("تاريخ انتهاء الخدمة يجب أن يكون بعد تاريخ التعيين.");
  const number = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0;
  return {
    full_name,
    phone: String(body.phone || "").trim() || null,
    job_title: String(body.job_title || "").trim() || null,
    department: String(body.department || "").trim() || null,
    hire_date: body.hire_date || new Date().toISOString().slice(0, 10),
    termination_date: body.termination_date || null,
    monthly_salary: number(body.monthly_salary),
    daily_work_hours: Math.min(24, Math.max(1, Number(body.daily_work_hours) || 8)),
    notes: String(body.notes || "").trim() || null,
    photo_path: String(body.photo_path || "").trim() || null,
  };
}
export async function GET(request) {
  try {
    const auth = await authorize(request, "hr.employees.view");
    if (auth.response) return auth.response;
    const { data, error } = await auth.db.from("hr_employees").select("id,full_name,phone,photo_path,job_title,department,hire_date,termination_date,employment_status,monthly_salary,daily_work_hours,notes,username,attendance_pin_hash,created_at,archived_at").is("archived_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    const employees = await Promise.all((data || []).map(async (employee) => {
      const photoUrl = employee.photo_path
        ? (await auth.db.storage.from("hr-employee-photos").createSignedUrl(employee.photo_path, 300)).data?.signedUrl || null
        : null;
      const { attendance_pin_hash, ...safeEmployee } = employee;
      return { ...safeEmployee, has_attendance_code: Boolean(attendance_pin_hash), photo_url: photoUrl };
    }));
    return NextResponse.json({ employees });
  } catch (error) {
    console.error("HR employees GET:", error);
    return NextResponse.json({ error: error.message || "تعذر تحميل الموظفين." }, { status: 500 });
  }
}
export async function POST(request) {
  try {
    const body = await request.json();
    const auth = await authorize(request, "hr.employees.create");
    if (auth.response) return auth.response;
    const values = clean(body);
    const code = validateAttendanceCode(body.attendance_code, true);
    const { data: existingEmployees, error: existingError } = await auth.db.from("hr_employees").select("id,attendance_pin_hash");
    if (existingError) throw existingError;
    if ((existingEmployees || []).some(employee => verifyAttendanceCode(code, employee.attendance_pin_hash))) {
      return NextResponse.json({ error: "كود الحضور مستخدم لموظف آخر. اختر كودًا مختلفًا." }, { status: 409 });
    }
    values.attendance_pin_hash = hashAttendanceCode(code);
    const { data, error } = await auth.db.from("hr_employees").insert(values).select("id,full_name,phone,photo_path,job_title,department,hire_date,termination_date,employment_status,monthly_salary,paid_leave_days,daily_work_hours,notes").single();
    if (error) throw error;
    return NextResponse.json({ employee: data }, { status: 201 });
  } catch (error) {
    console.error("HR employees POST:", error);
    return NextResponse.json({ error: error.message || "تعذر إضافة الموظف." }, { status: 400 });
  }
}
export async function PATCH(request) {
  try {
    const body = await request.json();
    const requiredPermission = body.action === "create_login"
      ? "hr.employees.accounts.manage"
      : body.action === "archive"
        ? "hr.employees.archive"
        : "hr.employees.update";
    const auth = await authorize(request, requiredPermission);
    if (auth.response) return auth.response;
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
    if (body.action === "archive") {
      const { data, error } = await auth.db.from("hr_employees")
        .update({
          employment_status: "inactive",
          termination_date: body.termination_date || new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", id).is("archived_at", null)
        .select("id,full_name,employment_status,termination_date,archived_at").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "الموظف غير موجود أو تم أرشفته بالفعل." }, { status: 404 });
      return NextResponse.json({ employee: data, archived: true });
    }
    if (body.action === "deactivate" || body.action === "activate") {
      const { data, error } = await auth.db.from("hr_employees")
        .update({ employment_status: body.action === "activate" ? "active" : "inactive", termination_date: body.action === "activate" ? null : (body.termination_date || new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())), updated_at: new Date().toISOString() })
        .eq("id", id).select("id,employment_status").single();
      if (error) throw error;
      return NextResponse.json({ employee: data });
    }
    const values = clean(body);
    const code = validateAttendanceCode(body.attendance_code, false);
    if (code) {
      const { data: existingEmployees, error: existingError } = await auth.db.from("hr_employees").select("id,attendance_pin_hash").neq("id", id);
      if (existingError) throw existingError;
      if ((existingEmployees || []).some(employee => verifyAttendanceCode(code, employee.attendance_pin_hash))) {
        return NextResponse.json({ error: "كود الحضور مستخدم لموظف آخر. اختر كودًا مختلفًا." }, { status: 409 });
      }
      values.attendance_pin_hash = hashAttendanceCode(code);
    }
    const { data, error } = await auth.db.from("hr_employees")
      .update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
      .select("id,full_name,phone,photo_path,job_title,department,hire_date,employment_status,monthly_salary,paid_leave_days,daily_work_hours,notes").single();
    if (error) throw error;
    return NextResponse.json({ employee: data });
  } catch (error) {
    console.error("HR employees PATCH:", error);
    return NextResponse.json({ error: error.message || "تعذر تعديل الموظف." }, { status: 400 });
  }
}
