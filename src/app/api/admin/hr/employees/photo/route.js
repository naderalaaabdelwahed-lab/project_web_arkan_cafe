import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authorizeAdminPermission } from "@/lib/server/admin-permissions";

export async function POST(request) {
  try {
    const auth = await authorizeAdminPermission(request, "hr.employees.update");
    if (auth.response) return auth.response;
    const db = auth.db;
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
