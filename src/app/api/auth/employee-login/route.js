
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    const cleanUsername = String(username || "")
      .trim()
      .toLowerCase();

    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername) || !password) {
      return NextResponse.json(
        { error: "اسم المستخدم أو كلمة المرور غير صحيحة." },
        { status: 401 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !serviceKey || !publishableKey) {
      throw new Error("Supabase environment variables are missing.");
    }

    const adminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const authClient = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: employee, error: employeeError } =
      await adminClient
        .from("employee_profiles")
        .select("user_id, username, is_active")
        .eq("username", cleanUsername)
        .maybeSingle();

    if (employeeError) throw employeeError;

    if (!employee || !employee.is_active) {
      return NextResponse.json(
        { error: "اسم المستخدم أو كلمة المرور غير صحيحة." },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } =
      await adminClient.auth.admin.getUserById(employee.user_id);

    if (userError || !userData?.user?.email) {
      return NextResponse.json(
        { error: "تعذر تسجيل الدخول." },
        { status: 401 }
      );
    }

    const { data, error } =
      await authClient.auth.signInWithPassword({
        email: userData.user.email,
        password,
      });

    if (error || !data.session) {
      return NextResponse.json(
        { error: "اسم المستخدم أو كلمة المرور غير صحيحة." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      message: "تم تسجيل الدخول بنجاح.",
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: employee.user_id,
        username: employee.username,
      },
    });
  } catch (error) {
    console.error("Employee login error:", error);

    return NextResponse.json(
      { error: "حدث خطأ أثناء تسجيل الدخول." },
      { status: 500 }
    );
  }
}
