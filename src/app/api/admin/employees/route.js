
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
  "pos.use",
  "pos.sales.view",
  "pos.discount.apply",
  "pos.items.remove",
  "pos.table.empty",
  "pos.table.transfer",
  "pos.items.transfer",
  "pos.table.merge",
  "pos.order.finish",
  "pos.receipt.print",
  "inventory.view",
  "inventory.items.manage",
  "inventory.recipes.manage",
  "inventory.purchases.manage",
  "inventory.movements.manage",
  "inventory.reports.view",
  "hr.employees.view",
  "hr.employees.create",
  "hr.employees.update",
  "hr.employees.archive",
  "hr.employees.accounts.manage",
  "hr.attendance.view",
  "hr.attendance.manage",
  "hr.shifts.view",
  "hr.shifts.manage",
  "hr.payroll.view",
  "hr.payroll.adjust",
  "hr.payroll.create",
  "hr.payroll.finalize",
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase authentication environment variables are missing.");
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function authorize(request) {
  const authorization =
    request.headers.get("authorization") || "";

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

function validatePermissions(permissions) {
  return (
    Array.isArray(permissions) &&
    permissions.every((permission) =>
      allowedPermissions.includes(permission)
    )
  );
}

// GET: عرض الموظفين والصلاحيات
export async function GET(request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;

    const {
      data: employees,
      error: employeesError,
    } = await auth.adminClient
      .from("employee_profiles")
      .select("user_id, username, display_name, is_active, created_at")
      .order("created_at", { ascending: false });

    if (employeesError) throw employeesError;

    const {
      data: permissions,
      error: permissionsError,
    } = await auth.adminClient
      .from("employee_permissions")
      .select("user_id, permission_key");

    if (permissionsError) throw permissionsError;

    const result = (employees || []).map((employee) => ({
      ...employee,
      permissions: (permissions || [])
        .filter((permission) => permission.user_id === employee.user_id)
        .map((permission) => permission.permission_key),
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

    if (!validatePermissions(permissions)) {
      return NextResponse.json(
        { error: "قائمة الصلاحيات غير صالحة." },
        { status: 400 }
      );
    }

    const uniquePermissions = [...new Set(permissions)];

    const { data: existing, error: existingError } =
      await adminClient
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

    const email = `${username}@employees.arkan.local`;

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

    if (uniquePermissions.length > 0) {
      const permissionRows = uniquePermissions.map((permission) => ({
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
          permissions: uniquePermissions,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST employees error:", error);

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

// PATCH: تعديل بيانات الموظف وكلمة المرور والصلاحيات
export async function PATCH(request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;

    const adminClient = auth.adminClient;
    const body = await request.json();

    const userId = String(body.user_id || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    const password = String(body.password || "");
    const permissions = body.permissions;

    if (!userId) {
      return NextResponse.json(
        { error: "معرّف الموظف غير صالح." },
        { status: 400 }
      );
    }

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

    if (password && password.length < 8) {
      return NextResponse.json(
        { error: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف." },
        { status: 400 }
      );
    }

    if (!validatePermissions(permissions)) {
      return NextResponse.json(
        { error: "قائمة الصلاحيات غير صالحة." },
        { status: 400 }
      );
    }

    const { data: employee, error: employeeError } =
      await adminClient
        .from("employee_profiles")
        .select("user_id, username, display_name")
        .eq("user_id", userId)
        .maybeSingle();

    if (employeeError) throw employeeError;

    if (!employee) {
      return NextResponse.json(
        { error: "الموظف غير موجود." },
        { status: 404 }
      );
    }

    const { data: duplicate, error: duplicateError } =
      await adminClient
        .from("employee_profiles")
        .select("user_id")
        .eq("username", username)
        .neq("user_id", userId)
        .maybeSingle();

    if (duplicateError) throw duplicateError;

    if (duplicate) {
      return NextResponse.json(
        { error: "اسم المستخدم مستخدم بالفعل." },
        { status: 409 }
      );
    }

    const newEmail = `${username}@employees.arkan.local`;

    const authUpdate = {
      email: newEmail,
      email_confirm: true,
      user_metadata: {
        username,
        display_name: displayName,
      },
    };

    if (password) {
      authUpdate.password = password;
    }

    const { error: authUpdateError } =
      await adminClient.auth.admin.updateUserById(
        userId,
        authUpdate
      );

    if (authUpdateError) throw authUpdateError;

    const { error: profileUpdateError } = await adminClient
      .from("employee_profiles")
      .update({
        username,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (profileUpdateError) {
      // محاولة إعادة بيانات الدخول القديمة إذا فشل تحديث الملف
      await adminClient.auth.admin.updateUserById(userId, {
        email: `${employee.username}@employees.arkan.local`,
        email_confirm: true,
        user_metadata: {
          username: employee.username,
          display_name: employee.display_name,
        },
      });

      throw profileUpdateError;
    }

    const { error: deletePermissionsError } = await adminClient
      .from("employee_permissions")
      .delete()
      .eq("user_id", userId);

    if (deletePermissionsError) throw deletePermissionsError;

    const uniquePermissions = [...new Set(permissions)];

    if (uniquePermissions.length > 0) {
      const permissionRows = uniquePermissions.map((permission) => ({
        user_id: userId,
        permission_key: permission,
      }));

      const { error: insertPermissionsError } = await adminClient
        .from("employee_permissions")
        .insert(permissionRows);

      if (insertPermissionsError) throw insertPermissionsError;
    }

    return NextResponse.json({
      message: "تم تحديث بيانات الموظف بنجاح.",
    });
  } catch (error) {
    console.error("PATCH employees error:", error);

    return NextResponse.json(
      { error: error.message || "تعذر تعديل بيانات الموظف." },
      { status: 500 }
    );
  }
}

// DELETE: حذف حساب الموظف نهائيًا
export async function DELETE(request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const userId = String(body.user_id || "").trim();

    if (!userId) {
      return NextResponse.json(
        { error: "معرّف الموظف غير صالح." },
        { status: 400 }
      );
    }

    if (userId === auth.user.id) {
      return NextResponse.json(
        { error: "لا يمكنك حذف حسابك الحالي من هذه الصفحة." },
        { status: 400 }
      );
    }

    const { data: employee, error: employeeError } =
      await auth.adminClient
        .from("employee_profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (employeeError) throw employeeError;

    if (!employee) {
      return NextResponse.json(
        { error: "الموظف غير موجود." },
        { status: 404 }
      );
    }

    // حذف حساب Auth، مع حذف profile والصلاحيات عبر ON DELETE CASCADE
    const { error: deleteError } =
      await auth.adminClient.auth.admin.deleteUser(userId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      message: "تم حذف حساب الموظف نهائيًا.",
    });
  } catch (error) {
    console.error("DELETE employees error:", error);

    return NextResponse.json(
      { error: error.message || "تعذر حذف الموظف." },
      { status: 500 }
    );
  }
}
