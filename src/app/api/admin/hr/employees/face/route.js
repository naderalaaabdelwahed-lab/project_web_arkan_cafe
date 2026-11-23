import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptFaceEmbedding, extractFaceEmbedding } from "@/lib/hr-face";

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
  return { db, user: data.user };
}

export async function GET(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const employeeId = new URL(request.url).searchParams.get("employee_id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return NextResponse.json({ error: "معرّف الموظف غير صحيح." }, { status: 400 });
    const { data, error } = await auth.db.from("hr_employee_face_profiles").select("employee_id,model_version,enrolled_at:created_at").eq("employee_id", employeeId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ enrolled: Boolean(data), model_version: data?.model_version || null, enrolled_at: data?.enrolled_at || null });
  } catch (error) {
    console.error("HR face status:", error);
    return NextResponse.json({ error: error.message || "تعذر تحميل حالة بصمة الوجه." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const employeeId = String(body.employee_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return NextResponse.json({ error: "معرّف الموظف غير صحيح." }, { status: 400 });
    if (body.consent_confirmed !== true) return NextResponse.json({ error: "يجب تأكيد موافقة الموظف قبل تسجيل بصمة الوجه." }, { status: 400 });
    const { data: employee, error: employeeError } = await auth.db.from("hr_employees").select("id,employment_status").eq("id", employeeId).maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee || employee.employment_status !== "active") return NextResponse.json({ error: "الموظف غير موجود أو غير نشط." }, { status: 404 });

    const embedding = await extractFaceEmbedding(body.image_base64);
    const encrypted = encryptFaceEmbedding(embedding);
    const now = new Date().toISOString();
    const { error } = await auth.db.from("hr_employee_face_profiles").upsert({
      employee_id: employeeId,
      ...encrypted,
      consent_confirmed_at: now,
      enrolled_by: auth.user.id,
      updated_at: now,
    }, { onConflict: "employee_id" });
    if (error) throw error;
    return NextResponse.json({ success: true, model_version: encrypted.model_version, enrolled_at: now });
  } catch (error) {
    console.error("HR face enrollment:", error);
    return NextResponse.json({ error: error.message || "تعذر تسجيل بصمة الوجه." }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await authorize(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const employeeId = String(body.employee_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return NextResponse.json({ error: "معرّف الموظف غير صحيح." }, { status: 400 });
    const { error } = await auth.db.from("hr_employee_face_profiles").delete().eq("employee_id", employeeId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("HR face deletion:", error);
    return NextResponse.json({ error: error.message || "تعذر حذف بصمة الوجه." }, { status: 400 });
  }
}
