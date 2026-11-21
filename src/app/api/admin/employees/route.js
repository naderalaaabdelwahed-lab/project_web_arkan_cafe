
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";



const allowedPermissions = [
  "dashboard.view",
  "orders.view",
  "orders.create",
  "orders.update",
  "orders.cancel",
  "reservations.view",
  "reservations.create",
  "reservations.update",
  "reservations.delete",
  "menu.view",
  "menu.create",
  "menu.update",
  "menu.delete",
  "hall.view",
  "hall.update",
  "daily_closing.view",
  "daily_closing.export",
  "daily_closing.close",
];

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function authorize(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  if (!token) {
    return {
      error: NextResponse.json(
        { error: "يجب تسجيل الدخول أولًا." },
        { status: 401 }
      ),
    };
  }

  const authClient = getAuthClient();
  const adminClient = getAdminClient();

  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data?.user) {
    return {
      error: NextResponse.json(
        { error: "جلسة الدخول غير صالحة." },
        { status: 401 }
      ),
    };
  }

  const { data: admin, error: adminError } = await adminClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return {
      error: NextResponse.json(
        { error: "غير مسموح لك بإدارة الموظفين." },
        { status: 403 }
      ),
    };
  }

  return {
    adminClient,
    user: data.user,
  };
}

// GET: عرض الموظفين
export async function GET(request) {
  try {
    const auth = await authorize(request);

    if (auth.error) return auth.error;

    const { data: employees, error } = await auth.adminClient
      .from("employee_profiles")
      .select(`
        user_id,
        username,
        display_name,
        is_active,
        created_at,
        employee_permissions (
          permission_key
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const result = (employees || []).map((employee) => ({
      ...employee,
      permissions: (employee.employee_permissions || []).map(
        (permission) => permission.permission_key
      ),
      employee_permissions: undefined,
    }));

    return NextResponse.json({ employees: result });
  } catch (error) {
    console.error("GET employees error:", error);

    return NextResponse.json(
      { error: error.message || "تعذر تحميل الموظفين." },
      { status: 500 }
    );
  }
}

// POST: إنشاء موظف جديد
export async function POST(request) {
  let adminClient;
  let createdUserId = null;

  try {
    const auth = await authorize(request);

    if (auth.error) return auth.error;

    adminClient = auth.adminClient;

    const body = await request.json();

    const username = String(body.username || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    const password = String(body.password || "");
    const permissions = body.permissions;

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: "اسم المستخدم يجب أن يكون من 3 إلى 30 حرفًا إنجليزيًا أو رقمًا أو _." },
        { status: 400 }
      );
    }

    if (!displayName || displayName.length > 100) {
      return NextResponse.json(
        { error: "اسم الموظف غير صالح." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "كلمة المرور يجب ألا تقل عن 8 أحرف." },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(permissions) ||
      permissions.some((permission) => !allowedPermissions.includes(permission))
    ) {
      return NextResponse.json(
        { error: "قائمة الصلاحيات غير صالحة." },
        { status: 400 }
      );
    }

    const email = `${username}@employees.arkan.local`;

    const { data: existing, error: existingError } = await adminClient
      .from("employee_profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      return NextResponse.json(
        { error: "اسم المستخدم مستخدم بالفعل." },
        { status: 409 }
      );
    }

    const { data: userData, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          display_name: displayName,
        },
      });

    if (createError) throw createError;

    createdUserId = userData.user.id;

    const { error: profileError } = await adminClient
      .from("employee_profiles")
      .insert({
        user_id: createdUserId,
        username,
        display_name: displayName,
        is_active: true,
      });

    if (profileError) throw profileError;

    if (permissions.length > 0) {
      const permissionRows = permissions.map((permission) => ({
        user_id: createdUserId,
        permission_key: permission,
      }));

      const { error: permissionsError } = await adminClient
        .from("employee_permissions")
        .insert(permissionRows);

      if (permissionsError) throw permissionsError;
    }

    return NextResponse.json(
      {
        message: "تم إنشاء الموظف بنجاح.",
        employee: {
          user_id: createdUserId,
          username,
          display_name: displayName,
          is_active: true,
          permissions,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST employees error:", error);

    // Rollback: حذف حساب Auth إذا فشلت عملية الإنشاء
    if (adminClient && createdUserId) {
      const { error: rollbackError } =
        await adminClient.auth.admin.deleteUser(createdUserId);

      if (rollbackError) {
        console.error("Employee rollback error:", rollbackError);
      }
    }

    return NextResponse.json(
      { error: error.message || "تعذر إنشاء حساب الموظف." },
      { status: 500 }
    );
  }
}
