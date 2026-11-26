const DEFAULT_URL = "https://elbantrhzbpojhmwodbl.supabase.co";

function createSupabaseRestClient() {
  const url = (process.env.EGSOFT_SUPABASE_URL || process.env.ARKAN_SUPABASE_URL || DEFAULT_URL).replace(/\/$/, "");
  const key = process.env.EGSOFT_SUPABASE_PUBLISHABLE_KEY || process.env.ARKAN_SUPABASE_PUBLISHABLE_KEY || "";

  let accessToken = null;
  let currentUser = null;

  async function request(path, options = {}) {
    if (!key) throw new Error("EGSOFT_SUPABASE_PUBLISHABLE_KEY is not configured.");
    const response = await fetch(url + path, {
      ...options,
      headers: {
        apikey: key,
        Accept: "application/json",
        ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.text();
    if (!response.ok) {
      const error = new Error("Supabase request failed (" + response.status + "): " + body.slice(0, 400));
      error.status = response.status;
      throw error;
    }
    return body ? JSON.parse(body) : null;
  }

  return {
    configured: Boolean(key),
    async listRecords(table) { return await request("/rest/v1/" + encodeURIComponent(table) + "?select=*&order=created_at.desc"); },
    async insertRecord(table, data) {
      const rows=await request("/rest/v1/"+encodeURIComponent(table),{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(data)});
      return Array.isArray(rows)?rows[0]:rows;
    },
    async updateRecord(table,id,data) {
      const rows=await request("/rest/v1/"+encodeURIComponent(table)+"?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(data)});
      return Array.isArray(rows)?rows[0]:rows;
    },
    async deleteRecord(table,id) {
      await request("/rest/v1/"+encodeURIComponent(table)+"?id=eq."+encodeURIComponent(id),{method:"DELETE"});
      return {ok:true};
    },
    getSession() { return { authenticated: Boolean(accessToken), user: currentUser }; },
    async signIn(email, password) {
      if (!key) throw new Error("مفتاح Supabase غير مضبوط داخل desktop/.env");
      const result = await request("/auth/v1/token?grant_type=password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!result?.access_token) throw new Error("لم يتم استلام جلسة تسجيل الدخول.");
      accessToken = result.access_token;
      currentUser = result.user || null;
      try {
        const admin = await request("/rest/v1/rpc/is_admin", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
        });
        if (admin !== true) throw new Error("هذا الحساب ليس لديه صلاحية مدير النظام.");
      } catch (error) {
        accessToken = null; currentUser = null;
        throw error;
      }
      return { authenticated: true, user: currentUser };
    },
    async signOut() {
      if (accessToken) { try { await request("/auth/v1/logout", { method: "POST" }); } catch (_) {} }
      accessToken = null; currentUser = null;
      return { ok: true };
    },
    async getStatus() {
      if (!key) return { configured: false, connected: false, message: "Publishable key is missing." };
      try {
        await request("/rest/v1/categories?select=id&limit=1");
        return { configured: true, connected: true, project: "elbantrhzbpojhmwodbl" };
      } catch (error) {
        return { configured: true, connected: false, message: error.message, status: error.status || null };
      }
    },
    async getMenu() {
      const [categories, products] = await Promise.all([
        request("/rest/v1/categories?select=id,name,is_active&is_active=eq.true&order=name.asc"),
        request("/rest/v1/products?select=id,category_id,name,description,price,is_available&is_available=eq.true&order=name.asc")
      ]);
      return { categories, products };
    }
  };
}

module.exports = { createSupabaseRestClient };
