import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "سجل دخول المدير أولاً." }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishable || !secret) throw new Error("Supabase server configuration is missing.");
    const auth = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData, error: authError } = await auth.auth.getUser(token);
    if (authError || !userData?.user) return NextResponse.json({ error: "جلسة الدخول غير صالحة." }, { status: 401 });
    const db = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: admin } = await db.from("admin_users").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (!admin) return NextResponse.json({ error: "غير مسموح." }, { status: 403 });
    const form = await request.formData();
    const employeeId = String(form.get("employee_id") || "");
    const file = form.get("file");
    if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !(file instanceof File)) return NextResponse.json({ error: "بيانات الصورة غير صحيحة." }, { status: 400 });
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "الصورة يجب أن تكون JPG أو PNG أو WebP وأقل من 5 ميجابايت." }, { status: 400 });
    const { data: employee } = await db.from("hr_employees").select("id").eq("id", employeeId).maybeSingle();
    if (!employee) return NextResponse.json({ error: "الموظف غير موجود." }, { status: 404 });
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = employeeId + "/" + randomUUID() + "." + extension;
    const { error: uploadError } = await db.storage.from("hr-employee-photos").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: updateError } = await db.from("hr_employees").update({ photo_path: path, updated_at: new Date().toISOString() }).eq("id", employeeId);
    if (updateError) throw updateError;
    return NextResponse.json({ photo_path: path });
  } catch (error) {
    console.error("HR photo upload:", error);
    return NextResponse.json({ error: error.message || "تعذر رفع الصورة." }, { status: 500 });
  }
}
