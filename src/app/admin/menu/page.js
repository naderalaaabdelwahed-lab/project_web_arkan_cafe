
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./menu.css";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function getStoragePath(imageUrl) {
  if (!imageUrl) return null;

  const marker = "/storage/v1/object/public/products/";
  const index = imageUrl.indexOf(marker);

  if (index === -1) return null;

  try {
    return decodeURIComponent(imageUrl.slice(index + marker.length));
  } catch {
    return null;
  }
}

export default function AdminMenuPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [originalImageUrl, setOriginalImageUrl] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [removeImage, setRemoveImage] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const can = (permission) =>
    isAdmin || permissions.includes(permission);

  useEffect(() => {
    async function initialize() {
      setAccessLoading(true);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session) throw new Error("يجب تسجيل الدخول.");

        const { data: adminResult, error: adminError } =
          await supabase.rpc("is_admin");

        if (adminError) throw adminError;

        if (adminResult === true) {
          setIsAdmin(true);
        } else {
          const { data: employee, error: employeeError } =
            await supabase
              .from("employee_profiles")
              .select("is_active")
              .eq("user_id", session.user.id)
              .maybeSingle();

          if (employeeError) throw employeeError;

          if (!employee || !employee.is_active) {
            throw new Error("حساب الموظف غير نشط.");
          }

          const { data: rows, error: permissionError } =
            await supabase
              .from("employee_permissions")
              .select("permission_key")
              .eq("user_id", session.user.id);

          if (permissionError) throw permissionError;

          setPermissions(
            (rows || []).map((row) => row.permission_key)
          );
        }
      } catch (err) {
        setError(err.message || "تعذر التحقق من الصلاحيات.");
      } finally {
        setAccessLoading(false);
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    if (accessLoading) return;

    if (!can("menu.view")) {
      setLoading(false);
      return;
    }

    loadData();
  }, [accessLoading, isAdmin, permissions]);

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  async function loadData() {
    setLoading(true);
    setError("");

    const [categoriesResult, productsResult] = await Promise.all([
      supabase.from("categories").select("*").order("id"),
      supabase.from("products").select("*, categories(name)").order("id"),
    ]);

    if (categoriesResult.error || productsResult.error) {
      setError(
        categoriesResult.error?.message ||
        productsResult.error?.message
      );
    } else {
      setCategories(categoriesResult.data || []);
      setProducts(productsResult.data || []);
    }

    setLoading(false);
  }

  function resetForm() {
    setName("");
    setDescription("");
    setPrice("");
    setCategoryId("");
    setImageUrl("");
    setOriginalImageUrl("");
    setImageFile(null);
    setImagePreview("");
    setRemoveImage(false);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function openCreateForm() {
    if (!can("menu.create")) return;
    resetForm();
    setShowForm(true);
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("من فضلك اختار ملف صورة صحيح");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("حجم الصورة لازم يكون 5 ميجابايت أو أقل");
      e.target.value = "";
      return;
    }

    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  function handleRemoveImage() {
    setImageFile(null);
    setImagePreview("");
    setImageUrl("");
    setRemoveImage(true);

    const fileInput = document.getElementById("product-image-input");
    if (fileInput) fileInput.value = "";
  }

  async function uploadImage() {
    if (!imageFile) return null;

    const extension =
      imageFile.name.split(".").pop()?.toLowerCase() || "jpg";

    const safeExtension = /^[a-z0-9]+$/.test(extension)
      ? extension
      : "jpg";

    const filePath = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${safeExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("products")
      .upload(filePath, imageFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: imageFile.type,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("products")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function saveProduct(e) {
    e.preventDefault();
    setError("");

    if (editingId && !can("menu.update")) return;
    if (!editingId && !can("menu.create")) return;

    if (!name.trim() || !price || !categoryId) {
      setError("من فضلك اكتب اسم المنتج والسعر واختار القسم");
      return;
    }

    if (!Number.isFinite(Number(price)) || Number(price) < 0) {
      setError("من فضلك اكتب سعر صحيح");
      return;
    }

    setSaving(true);
    let uploadedImagePath = null;

    try {
      const oldImageUrl = originalImageUrl;
      let newImageUrl = imageUrl || null;

      if (imageFile) {
        newImageUrl = await uploadImage();
        uploadedImagePath = getStoragePath(newImageUrl);
      }

      if (removeImage) newImageUrl = null;

      const productData = {
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        category_id: categoryId,
        image_url: newImageUrl,
      };

      const result = editingId
        ? await supabase
            .from("products")
            .update(productData)
            .eq("id", editingId)
        : await supabase
            .from("products")
            .insert([productData]);

      if (result.error) throw result.error;

      if (oldImageUrl && oldImageUrl !== newImageUrl) {
        const oldPath = getStoragePath(oldImageUrl);

        if (oldPath) {
          const { error: deleteError } = await supabase.storage
            .from("products")
            .remove([oldPath]);

          if (deleteError) {
            console.error("Old image deletion failed:", deleteError);
          }
        }
      }

      resetForm();
      await loadData();
    } catch (err) {
      if (uploadedImagePath) {
        await supabase.storage
          .from("products")
          .remove([uploadedImagePath]);
      }

      setError(err.message || "حصل خطأ أثناء حفظ المنتج");
    } finally {
      setSaving(false);
    }
  }

  function editProduct(product) {
    if (!can("menu.update")) return;

    setEditingId(product.id);
    setName(product.name || "");
    setDescription(product.description || "");
    setPrice(String(product.price ?? ""));
    setCategoryId(product.category_id || "");
    setImageUrl(product.image_url || "");
    setOriginalImageUrl(product.image_url || "");
    setImageFile(null);
    setImagePreview(product.image_url || "");
    setRemoveImage(false);
    setError("");
    setShowForm(true);
  }

  async function deleteProduct(product) {
    if (!can("menu.delete")) return;
    if (!confirm("متأكد إنك عايز تحذف المنتج؟")) return;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);

    if (error) {
      setError(error.message);
      return;
    }

    const imagePath = getStoragePath(product.image_url);

    if (imagePath) {
      const { error: imageError } = await supabase.storage
        .from("products")
        .remove([imagePath]);

      if (imageError) {
        console.error("Image deletion failed:", imageError);
      }
    }

    await loadData();
  }

  async function toggleAvailability(product) {
    if (!can("menu.update")) return;

    const { error } = await supabase
      .from("products")
      .update({ is_available: !product.is_available })
      .eq("id", product.id);

    if (error) {
      setError(error.message);
      return;
    }

    await loadData();
  }

  const filteredProducts = products.filter((product) =>
    product.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (accessLoading) {
    return (
      <main className="menu-admin" dir="rtl">
        <div className="menu-empty">جاري التحقق من الصلاحيات...</div>
      </main>
    );
  }

  if (!can("menu.view")) {
    return (
      <main className="menu-admin" dir="rtl">
        <div className="menu-empty">
          ليس لديك صلاحية عرض المنيو.
        </div>
      </main>
    );
  }

  return (
    <main className="menu-admin" dir="rtl">
      <div className="menu-admin-header">
        <div>
          <span className="menu-eyebrow">ARKAN MANAGEMENT</span>
          <h1>إدارة المنيو</h1>
          <p>تحكم في منتجات المطعم وأسعارها وتوفرها</p>
        </div>

        {can("menu.create") && (
          <button className="menu-add-btn" onClick={openCreateForm}>
            <span>＋</span> إضافة منتج جديد
          </button>
        )}
      </div>

      <div className="menu-stats">
        <div className="menu-stat-card">
          <span>إجمالي المنتجات</span>
          <strong>{products.length}</strong>
          <small>كل المنتجات المسجلة</small>
        </div>

        <div className="menu-stat-card">
          <span>المنتجات المتاحة</span>
          <strong>{products.filter((p) => p.is_available).length}</strong>
          <small>متاحة للعملاء</small>
        </div>

        <div className="menu-stat-card">
          <span>الأقسام</span>
          <strong>{categories.length}</strong>
          <small>أقسام المنيو</small>
        </div>
      </div>

      <section className="menu-products-section">
        <div className="menu-section-heading">
          <div>
            <h2>منتجات المنيو</h2>
            <p>إدارة وتعديل المنتجات الموجودة</p>
          </div>

          <input
            className="menu-search"
            placeholder="ابحث عن منتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && <div className="menu-error">{error}</div>}

        {loading ? (
          <div className="menu-empty">جاري تحميل المنتجات...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="menu-empty">
            <span>✦</span>
            <h3>لا توجد منتجات</h3>
            {can("menu.create") && (
              <>
                <p>ابدأ بإضافة أول منتج إلى المنيو</p>
                <button onClick={openCreateForm}>
                  إضافة منتج جديد
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="menu-products-grid">
            {filteredProducts.map((product) => (
              <article className="menu-product-card" key={product.id}>
                <div className="menu-product-image">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} />
                  ) : (
                    <span>ARKAN</span>
                  )}

                  <span
                    className={`menu-status ${
                      product.is_available ? "available" : "unavailable"
                    }`}
                  >
                    {product.is_available ? "متاح" : "غير متاح"}
                  </span>
                </div>

                <div className="menu-product-info">
                  <span className="menu-product-category">
                    {product.categories?.name || "بدون قسم"}
                  </span>

                  <h3>{product.name}</h3>
                  <p>{product.description || "لا يوجد وصف للمنتج"}</p>

                  <div className="menu-product-bottom">
                    <strong>
                      {product.price} <small>جنيه</small>
                    </strong>

                    <div className="menu-product-actions">
                      {can("menu.update") && (
                        <>
                          <button
                            className="edit-btn"
                            onClick={() => editProduct(product)}
                            title="تعديل"
                          >
                            ✎
                          </button>

                          <button
                            className="toggle-btn"
                            onClick={() => toggleAvailability(product)}
                            title="تغيير التوفر"
                          >
                            ◉
                          </button>
                        </>
                      )}

                      {can("menu.delete") && (
                        <button
                          className="delete-btn"
                          onClick={() => deleteProduct(product)}
                          title="حذف"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div className="menu-modal-overlay" onClick={resetForm}>
          <div className="menu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="menu-modal-header">
              <div>
                <span>ARKAN MENU</span>
                <h2>{editingId ? "تعديل المنتج" : "إضافة منتج جديد"}</h2>
              </div>

              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveProduct}>
              <label>اسم المنتج</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: فطير شرقي"
                required
              />

              <label>وصف المنتج</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="اكتب وصف المنتج..."
              />

              <div className="menu-form-row">
                <div>
                  <label>السعر بالجنيه</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label>القسم</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                  >
                    <option value="">اختار القسم</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label>صورة المنتج</label>
              <input
                id="product-image-input"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={saving}
              />

              <small>اختار صورة من جهازك (الحد الأقصى 5 ميجابايت)</small>

              {imagePreview && (
                <div className="menu-image-preview">
                  <img
                    src={imagePreview}
                    alt="معاينة صورة المنتج"
                    style={{
                      width: "100%",
                      maxWidth: "220px",
                      height: "150px",
                      objectFit: "cover",
                      borderRadius: "10px",
                      marginTop: "12px",
                    }}
                  />

                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={saving}
                    style={{
                      display: "block",
                      marginTop: "10px",
                      padding: "8px 14px",
                      border: "none",
                      borderRadius: "6px",
                      background: "#b83232",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    حذف الصورة
                  </button>
                </div>
              )}

              {error && <div className="menu-error">{error}</div>}

              <div className="menu-modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={resetForm}
                  disabled={saving}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  className="save-btn"
                  disabled={saving}
                >
                  {saving
                    ? "جاري الحفظ والرفع..."
                    : editingId
                    ? "حفظ التعديلات"
                    : "إضافة المنتج"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
