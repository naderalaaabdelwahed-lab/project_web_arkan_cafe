import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function authorizeAdminPermission(request, requiredPermission) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
  if (!token) return { response: NextResponse.json({ error: "سجل الدخول أولاً." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase auth configuration is missing.");

  const auth = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data?.user) return { response: NextResponse.json({ error: "جلسة الدخول غير صالحة." }, { status: 401 }) };
  if (data.user.app_metadata?.account_type === "hr_employee") {
    return { response: NextResponse.json({ error: "حساب HR مخصص للخدمات الشخصية فقط." }, { status: 403 }) };
  }

  const db = serviceClient();
  const { data: admin, error: adminError } = await db
    .from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (adminError) throw adminError;

  if (!admin) {
    const { data: permission, error: permissionError } = await db
      .from("employee_permissions").select("id")
      .eq("user_id", data.user.id)
      .eq("permission_key", requiredPermission)
      .maybeSingle();
    if (permissionError) throw permissionError;
    if (!permission) {
      return { response: NextResponse.json({ error: "ليس لديك الصلاحية المطلوبة لتنفيذ هذا الإجراء." }, { status: 403 }) };
    }
  }

  return { db, user: data.user, isAdmin: Boolean(admin) };
}
