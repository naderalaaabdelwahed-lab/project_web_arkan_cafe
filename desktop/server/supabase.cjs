const DEFAULT_URL = "https://elbantrhzbpojhmwodbl.supabase.co";

function createSupabaseRestClient() {
  const url = (process.env.EGSOFT_SUPABASE_URL || process.env.ARKAN_SUPABASE_URL || DEFAULT_URL).replace(/\/$/, "");
  const key = process.env.EGSOFT_SUPABASE_PUBLISHABLE_KEY || process.env.ARKAN_SUPABASE_PUBLISHABLE_KEY || "";

  async function request(path) {
    if (!key) throw new Error("EGSOFT_SUPABASE_PUBLISHABLE_KEY is not configured.");
    const response = await fetch(url + path, {
      headers: {
        apikey: key,
        Accept: "application/json"
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
