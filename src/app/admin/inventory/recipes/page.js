
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const fieldStyle = {
  width: "100%",
  minHeight: "44px",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "#fff",
  color: "#111827",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  fontWeight: 600,
  fontSize: "14px",
};

const buttonStyle = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 600,
};

export default function Page() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  const [productId, setProductId] = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [recipeItems, setRecipeItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [editing, setEditing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data: recipeData, error: recipeError } =
      await supabase.rpc("get_inventory_recipes");

    if (recipeError) {
      setMessage("خطأ في تحميل الوصفات: " + recipeError.message);
      setMessageType("error");
      setLoading(false);
      return;
    }

    const uniqueProducts = [];
    const seen = new Set();

    (recipeData || []).forEach((row) => {
      if (!seen.has(row.product_id)) {
        seen.add(row.product_id);
        uniqueProducts.push({
          id: row.product_id,
          name: row.product_name,
          recipe_id: row.recipe_id,
          recipe_name: row.recipe_name,
        });
      }
    });

    setRows(recipeData || []);
    setProducts(uniqueProducts);

    const { data: ingredientData, error: ingredientError } =
      await supabase
        .from("inventory_items")
        .select("id, name, current_stock, unit_id")
        .eq("is_active", true)
        .eq("item_type", "raw")
        .order("name");

    if (ingredientError) {
      setMessage("خطأ في تحميل الخامات: " + ingredientError.message);
      setMessageType("error");
      setLoading(false);
      return;
    }

    const { data: unitData, error: unitError } = await supabase
      .from("inventory_units")
      .select("id, name, abbreviation, base_unit_id");

    if (unitError) {
      setMessage("خطأ في تحميل الوحدات: " + unitError.message);
      setMessageType("error");
      setLoading(false);
      return;
    }

    const units = unitData || [];

    setIngredients(
      (ingredientData || []).map((item) => {
        const unit = units.find((u) => u.id === item.unit_id);
        const baseUnitId = unit?.base_unit_id || unit?.id;
        const baseUnit = units.find((u) => u.id === baseUnitId);

        return {
          ...item,
          unit_name: baseUnit?.abbreviation || baseUnit?.name || "",
        };
      })
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setProductId("");
    setRecipeName("");
    setRecipeItems([]);
    setEditing(false);
  };

  const handleProductChange = (value) => {
    setProductId(value);

    const productRows = rows.filter(
      (row) => String(row.product_id) === String(value)
    );

    const firstRow = productRows[0];

    if (firstRow?.recipe_id) {
      setRecipeName(firstRow.recipe_name || "");
      setEditing(true);

      setRecipeItems(
        productRows
          .filter((row) => row.inventory_item_id)
          .map((row) => ({
            inventory_item_id: row.inventory_item_id,
            quantity: row.quantity,
          }))
      );
    } else {
      setRecipeName("");
      setRecipeItems([]);
      setEditing(false);
    }
  };

  const addIngredient = () => {
    setRecipeItems((prev) => [
      ...prev,
      { inventory_item_id: "", quantity: "" },
    ]);
  };

  const updateIngredient = (index, field, value) => {
    setRecipeItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  };

  const removeIngredient = (index) => {
    setRecipeItems((prev) => prev.filter((_, i) => i !== index));
  };

  const saveRecipe = async () => {
    if (!productId) {
      setMessage("اختار المنتج أولاً");
      setMessageType("error");
      return;
    }

    if (!recipeName.trim()) {
      setMessage("اكتب اسم الوصفة");
      setMessageType("error");
      return;
    }

    if (!recipeItems.length) {
      setMessage("أضف خامة واحدة على الأقل");
      setMessageType("error");
      return;
    }

    const invalid = recipeItems.some(
      (item) =>
        !item.inventory_item_id ||
        !item.quantity ||
        Number(item.quantity) <= 0
    );

    if (invalid) {
      setMessage("تأكد من اختيار الخامات وإدخال كميات صحيحة");
      setMessageType("error");
      return;
    }

    const ids = recipeItems.map((item) =>
      String(item.inventory_item_id)
    );

    if (new Set(ids).size !== ids.length) {
      setMessage("لا يمكن إضافة نفس الخامة أكثر من مرة");
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = recipeItems.map((item) => ({
      inventory_item_id: Number(item.inventory_item_id),
      quantity: Number(item.quantity),
    }));

    const { error } = await supabase.rpc("save_inventory_recipe", {
      p_product_id: Number(productId),
      p_name: recipeName.trim(),
      p_items: payload,
    });

    if (error) {
      setMessage("فشل حفظ الوصفة: " + error.message);
      setMessageType("error");
    } else {
      setMessage("تم حفظ الوصفة بنجاح");
      setMessageType("success");
      resetForm();
      await loadData();
    }

    setSaving(false);
  };

  const deleteRecipe = async () => {
    if (!productId) return;

    if (!window.confirm("هل أنت متأكد من حذف الوصفة؟")) return;

    setSaving(true);

    const { error } = await supabase.rpc("delete_inventory_recipe", {
      p_product_id: Number(productId),
    });

    if (error) {
      setMessage("فشل حذف الوصفة: " + error.message);
      setMessageType("error");
    } else {
      setMessage("تم حذف الوصفة بنجاح");
      setMessageType("success");
      resetForm();
      await loadData();
    }

    setSaving(false);
  };

  return (
    <main className="recipe-page" style={{ width: "100%" }}>
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">ARKAN INVENTORY</p>
          <h1>الوصفات</h1>
          <p>إدارة وصفات المنيو وتحديد الخامات والكميات المستخدمة.</p>
        </div>
      </header>

      <section className="admin-panel recipe-panel">
        <div className="recipe-section-heading">
          <h2>{editing ? "تعديل الوصفة" : "إضافة وصفة جديدة"}</h2>
          <p>حدد المنتج ثم أضف الخامات والكميات اللازمة لتحضيره.</p>
        </div>

        {message && (
          <div className={`recipe-message ${messageType}`}>
            {message}
          </div>
        )}

        {loading ? (
          <p>جاري تحميل البيانات...</p>
        ) : (
          <>
            <div className="recipe-field">
              <label style={labelStyle}>المنتج</label>
              <select
                value={productId}
                onChange={(e) => handleProductChange(e.target.value)}
                style={fieldStyle}
              >
                <option value="">اختر المنتج</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="recipe-field">
              <label style={labelStyle}>اسم الوصفة</label>
              <input
                type="text"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="مثال: وصفة الفطير الشرقي"
                style={fieldStyle}
              />
            </div>

            <div className="recipe-ingredients-heading">
              <div>
                <h3>الخامات المستخدمة</h3>
                <p>الكميات تُسجل بالوحدة الأساسية للخامة.</p>
              </div>

              <button
                type="button"
                onClick={addIngredient}
                style={{
                  ...buttonStyle,
                  background: "#2563eb",
                  color: "#fff",
                }}
              >
                + إضافة خامة
              </button>
            </div>

            {recipeItems.length === 0 && (
              <div className="recipe-empty">
                لم تتم إضافة خامات بعد. اضغط على إضافة خامة للبدء.
              </div>
            )}

            {recipeItems.map((item, index) => {
              const selected = ingredients.find(
                (ingredient) =>
                  String(ingredient.id) === String(item.inventory_item_id)
              );

              return (
                <div className="recipe-ingredient-row" key={index}>
                  <div className="recipe-field">
                    <label style={labelStyle}>اسم الخامة</label>
                    <select
                      value={item.inventory_item_id}
                      onChange={(e) =>
                        updateIngredient(
                          index,
                          "inventory_item_id",
                          e.target.value
                        )
                      }
                      style={fieldStyle}
                    >
                      <option value="">اختر الخامة</option>
                      {ingredients.map((ingredient) => (
                        <option key={ingredient.id} value={ingredient.id}>
                          {ingredient.name}
                        </option>
                      ))}
                    </select>

                    {selected && (
                      <small className="recipe-stock">
                        المتاح: {selected.current_stock} {selected.unit_name}
                      </small>
                    )}
                  </div>

                  <div className="recipe-field">
                    <label style={labelStyle}>
                      الكمية ({selected?.unit_name || "الوحدة الأساسية"})
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) =>
                        updateIngredient(index, "quantity", e.target.value)
                      }
                      placeholder="أدخل الكمية"
                      style={fieldStyle}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    className="recipe-delete-button"
                  >
                    حذف
                  </button>
                </div>
              );
            })}

            <div className="recipe-actions">
              <button
                type="button"
                onClick={saveRecipe}
                disabled={saving}
                style={{
                  ...buttonStyle,
                  background: "#15803d",
                  color: "#fff",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "جاري الحفظ..." : "حفظ الوصفة"}
              </button>

              {editing && (
                <button
                  type="button"
                  onClick={deleteRecipe}
                  disabled={saving}
                  style={{
                    ...buttonStyle,
                    background: "#dc2626",
                    color: "#fff",
                  }}
                >
                  حذف الوصفة
                </button>
              )}

              <button
                type="button"
                onClick={resetForm}
                style={{
                  ...buttonStyle,
                  background: "#e2e8f0",
                  color: "#334155",
                }}
              >
                تفريغ الحقول
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-panel recipe-panel">
        <div className="recipe-section-heading">
          <h2>المنتجات والوصفات المسجلة</h2>
          <p>عرض سريع للوصفات المرتبطة بمنتجات المنيو.</p>
        </div>

        {products.length === 0 ? (
          <p>لا توجد منتجات حالياً.</p>
        ) : (
          <div className="recipe-table-wrapper">
            <table className="recipe-table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الوصفة</th>
                  <th>عدد الخامات</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const count = rows.filter(
                    (row) =>
                      row.product_id === product.id &&
                      row.inventory_item_id
                  ).length;

                  return (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.recipe_name || "لا توجد وصفة"}</td>
                      <td>{count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx>{`
        .recipe-panel {
          margin-top: 24px;
          padding: 26px;
        }

        .recipe-section-heading {
          margin-bottom: 24px;
        }

        .recipe-section-heading h2,
        .recipe-ingredients-heading h3 {
          margin: 0 0 8px;
        }

        .recipe-section-heading p,
        .recipe-ingredients-heading p {
          margin: 0;
          opacity: 0.75;
          font-size: 14px;
        }

        .recipe-field {
          margin-bottom: 20px;
          min-width: 0;
        }

        .recipe-field input,
        .recipe-field select {
          color: #111827 !important;
          background: #fff !important;
        }

        .recipe-field input::placeholder {
          color: #64748b !important;
          opacity: 1;
        }

        .recipe-field select option {
          color: #111827 !important;
          background: #fff !important;
        }

        .recipe-field input:focus,
        .recipe-field select:focus {
          border-color: #64748b;
          box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.15);
        }

        .recipe-ingredients-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          flex-wrap: wrap;
          margin: 28px 0 18px;
        }

        .recipe-ingredient-row {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
          padding: 18px;
          margin-bottom: 14px;
          border: 1px solid rgba(128, 128, 128, 0.25);
          border-radius: 12px;
          background: rgba(128, 128, 128, 0.06);
        }

        .recipe-ingredient-row .recipe-field {
          margin: 0;
        }

        .recipe-stock {
          display: block;
          margin-top: 7px;
          opacity: 0.8;
        }

        .recipe-delete-button {
          padding: 10px 16px;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fff1f2;
          color: #b91c1c;
          cursor: pointer;
          font-weight: 600;
        }

        .recipe-empty {
          padding: 22px;
          text-align: center;
          border: 1px dashed rgba(128, 128, 128, 0.4);
          border-radius: 10px;
          opacity: 0.75;
        }

        .recipe-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 25px;
        }

        .recipe-message {
          padding: 13px 16px;
          border-radius: 9px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .recipe-message.success {
          background: #dcfce7;
          color: #166534;
        }

        .recipe-message.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .recipe-message.info {
          background: #e0f2fe;
          color: #075985;
        }

        .recipe-table-wrapper {
          overflow-x: auto;
        }

        .recipe-table {
          width: 100%;
          border-collapse: collapse;
          text-align: right;
        }

        .recipe-table th,
        .recipe-table td {
          padding: 14px;
          border-bottom: 1px solid rgba(128, 128, 128, 0.2);
        }

        .recipe-table th {
          background: rgba(128, 128, 128, 0.08);
          font-weight: 700;
        }

        @media (max-width: 650px) {
          .recipe-panel {
            padding: 17px;
          }

          .recipe-ingredient-row {
            grid-template-columns: 1fr;
          }

          .recipe-delete-button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
