"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const panel = { background: "#171717", border: "1px solid #303030", borderRadius: 14, padding: 20, marginBottom: 18 };
const field = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 8, border: "1px solid #444", background: "#202020", color: "#fff", minHeight: 42 };
const button = { border: 0, borderRadius: 8, padding: "11px 16px", background: "#b88946", color: "#111", fontWeight: 800, cursor: "pointer" };
const secondary = { ...button, background: "#292929", color: "#eee", border: "1px solid #444" };
const emptyLine = () => ({ inventory_item_id: "", quantity: "", unit_id: "" });
const number = (value) => Number(value || 0).toLocaleString("ar-EG", { maximumFractionDigits: 3 });
const money = (value) => `${number(value)} ج.م`;

export default function ProductionPage() {
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateLines, setTemplateLines] = useState([]);
  const [history, setHistory] = useState([]);
  const [outputId, setOutputId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("1");
  const [outputUnit, setOutputUnit] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [itemsResult, unitsResult, templatesResult, linesResult, historyResult] = await Promise.all([
      supabase.from("inventory_items").select("id,name,item_type,unit_id,current_stock,unit_cost,is_active").eq("is_active", true).order("name"),
      supabase.from("inventory_units").select("id,name,abbreviation,base_unit_id,conversion_factor").order("id"),
      supabase.from("inventory_production_templates").select("*").order("name"),
      supabase.from("inventory_production_template_items").select("*").order("id"),
      supabase.from("inventory_productions").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    const failed = [itemsResult, unitsResult, templatesResult, linesResult, historyResult].find((result) => result.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }
    setItems(itemsResult.data || []);
    setUnits(unitsResult.data || []);
    setTemplates(templatesResult.data || []);
    setTemplateLines(linesResult.data || []);
    setHistory(historyResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const unitById = useMemo(() => Object.fromEntries(units.map((unit) => [String(unit.id), unit])), [units]);
  const itemById = useMemo(() => Object.fromEntries(items.map((item) => [String(item.id), item])), [items]);
  const baseUnit = (unitId) => {
    const unit = unitById[String(unitId)];
    return unit ? String(unit.base_unit_id || unit.id) : "";
  };
  const compatibleUnits = (itemId) => {
    const item = itemById[String(itemId)];
    if (!item) return [];
    const base = baseUnit(item.unit_id);
    return units.filter((unit) => baseUnit(unit.id) === base);
  };
  const outputUnits = outputItem ? compatibleUnits(outputId) : [];
  const getItemName = (id) => itemById[String(id)]?.name || `صنف #${id}`;
  const getUnitName = (id) => unitById[String(id)]?.abbreviation || unitById[String(id)]?.name || "-";

  function updateLine(index, key, value) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [key]: value, ...(key === "inventory_item_id" ? { unit_id: "" } : {}) } : line));
  }

  function selectTemplate(id) {
    setSelectedTemplateId(id);
    const template = templates.find((row) => String(row.id) === String(id));
    if (!template) return;
    setOutputId(String(template.output_item_id));
    setOutputQuantity(String(template.output_quantity));
    setOutputUnit(String(template.output_unit_id));
    setNotes(template.notes || "");
    setLines(templateLines.filter((line) => String(line.template_id) === String(id)).map((line) => ({
      inventory_item_id: String(line.inventory_item_id),
      quantity: String(line.quantity),
      unit_id: String(line.unit_id),
    })));
    setTemplateName(template.name);
    setEditingTemplateId(template.id);
    setMessage("تم تحميل بيانات القالب. راجع الكميات قبل التنفيذ.");
  }

  function resetForm() {
    setSelectedTemplateId("");
    setOutputId("");
    setOutputQuantity("1");
    setOutputUnit("");
    setLines([emptyLine()]);
    setNotes("");
    setTemplateName("");
    setEditingTemplateId(null);
  }

  function validateForm() {
    if (!outputId || !outputUnit || !(Number(outputQuantity) > 0)) return "اختار الصنف الناتج والوحدة واكتب كمية صحيحة.";
    if (!lines.length || lines.some((line) => !line.inventory_item_id || !line.unit_id || !(Number(line.quantity) > 0))) return "أكمل كل مكونات التصنيع بكميات ووحدات صحيحة.";
    if (lines.some((line) => String(line.inventory_item_id) === String(outputId))) return "مينفعش الصنف الناتج يكون أحد مكونات نفس عملية التصنيع.";
    return "";
  }

  async function executeProduction(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    const validation = validateForm();
    if (validation) { setError(validation); return; }
    setSaving(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("execute_inventory_production", {
        p_output_item_id: Number(outputId),
        p_output_quantity: Number(outputQuantity),
        p_output_unit_id: Number(outputUnit),
        p_items: lines.map((line) => ({ inventory_item_id: Number(line.inventory_item_id), quantity: Number(line.quantity), unit_id: Number(line.unit_id) })),
        p_notes: notes.trim() || null,
      });
      if (rpcError) throw rpcError;
      setMessage(`تم تسجيل عملية التصنيع رقم #${data} وتحديث المخزون بنجاح.`);
      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || "تعذر تنفيذ التصنيع.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    setMessage("");
    setError("");
    const validation = validateForm();
    if (validation) { setError(validation); return; }
    if (!templateName.trim()) { setError("اكتب اسم القالب أولًا."); return; }
    setSaving(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("save_inventory_production_template", {
        p_template_id: editingTemplateId,
        p_name: templateName.trim(),
        p_output_item_id: Number(outputId),
        p_output_quantity: Number(outputQuantity),
        p_output_unit_id: Number(outputUnit),
        p_items: lines.map((line) => ({ inventory_item_id: Number(line.inventory_item_id), quantity: Number(line.quantity), unit_id: Number(line.unit_id) })),
        p_notes: notes.trim() || null,
      });
      if (rpcError) throw rpcError;
      setMessage(`تم حفظ قالب التصنيع #${data}.`);
      await loadData();
    } catch (err) {
      setError(err.message || "تعذر حفظ القالب.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTemplate(template) {
    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("set_inventory_production_template_active", {
      p_template_id: template.id,
      p_is_active: !template.is_active,
    });
    if (rpcError) { setError(rpcError.message); return; }
    setMessage(template.is_active ? "تم إيقاف القالب." : "تم تفعيل القالب.");
    await loadData();
  }

  if (loading) return <div dir="rtl" style={{ color: "#fff", padding: 30 }}>جاري تحميل بيانات التصنيع...</div>;

  return (
    <main dir="rtl" style={{ color: "#fff", width: "100%", maxWidth: 1250, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <div><p style={{ color: "#b88946", margin: "0 0 7px", fontSize: 12, fontWeight: 800 }}>ARKAN INVENTORY</p><h1 style={{ margin: 0, fontSize: 28 }}>التصنيع والإنتاج</h1><p style={{ color: "#aaa", marginBottom: 0 }}>حوّل الخامات إلى منتجات وسيطة أو جاهزة مع تحديث المخزون والتكلفة تلقائيًا.</p></div>
        <button type="button" style={secondary} onClick={loadData}>تحديث البيانات ↻</button>
      </header>

      {error && <div role="alert" style={{ ...panel, borderColor: "#9f3434", color: "#fecaca" }}>{error}</div>}
      {message && <div role="status" style={{ ...panel, borderColor: "#276749", color: "#bbf7d0" }}>{message}</div>}

      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>قوالب التصنيع</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select style={{ ...field, flex: "1 1 240px" }} value={selectedTemplateId} onChange={(e) => selectTemplate(e.target.value)}>
            <option value="">اختار قالب محفوظ لتحميله</option>
            {templates.filter((template) => template.is_active).map((template) => <option key={template.id} value={template.id}>{template.name} — {getItemName(template.output_item_id)}</option>)}
          </select>
          <button type="button" style={secondary} onClick={resetForm}>تصنيع جديد</button>
        </div>
        {templates.length > 0 && <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          {templates.map((template) => <div key={template.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #333", paddingTop: 10 }}>
            <span>{template.name} <small style={{ color: "#aaa" }}>({getItemName(template.output_item_id)})</small> <small style={{ color: template.is_active ? "#86efac" : "#fca5a5" }}>{template.is_active ? "نشط" : "متوقف"}</small></span>
            <div style={{ display: "flex", gap: 8 }}><button type="button" style={secondary} onClick={() => selectTemplate(template.id)}>تعديل / تحميل</button><button type="button" style={secondary} onClick={() => toggleTemplate(template)}>{template.is_active ? "إيقاف" : "تفعيل"}</button></div>
          </div>)}
        </div>}
      </section>

      <form onSubmit={executeProduction} style={panel}>
        <h2 style={{ marginTop: 0 }}>تسجيل عملية تصنيع</h2>
        <label style={{ display: "block", marginBottom: 12 }}>اسم قالب التصنيع<input style={field} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="مثال: تجهيز عجينة الفطير" /></label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          <label>الصنف الناتج<select required style={field} value={outputId} onChange={(e) => { setOutputId(e.target.value); setOutputUnit(""); }}><option value="">اختار الصنف</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.item_type === "finished" ? "منتج مصنع" : "خامة"}</option>)}</select></label>
          <label>كمية الناتج<input required min="0.001" step="any" type="number" style={field} value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} /></label>
          <label>وحدة الناتج<select required style={field} value={outputUnit} onChange={(e) => setOutputUnit(e.target.value)} disabled={!outputId}><option value="">اختار الوحدة</option>{outputUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.abbreviation})</option>)}</select></label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, margin: "24px 0 12px", flexWrap: "wrap" }}><h3 style={{ margin: 0 }}>مكونات التصنيع</h3><button type="button" style={secondary} onClick={() => setLines((current) => [...current, emptyLine()])}>+ إضافة مكون</button></div>
        <div style={{ display: "grid", gap: 10 }}>
          {lines.map((line, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, padding: 12, border: "1px solid #333", borderRadius: 10 }}>
            <label>الخامة / المنتج<select required style={field} value={line.inventory_item_id} onChange={(e) => updateLine(index, "inventory_item_id", e.target.value)}><option value="">اختار المكون</option>{items.filter((item) => String(item.id) !== String(outputId)).map((item) => <option key={item.id} value={item.id}>{item.name} — المتاح {number(item.current_stock)}</option>)}</select></label>
            <label>الكمية<input required type="number" min="0.001" step="any" style={field} value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} /></label>
            <label>الوحدة<select required style={field} value={line.unit_id} disabled={!line.inventory_item_id} onChange={(e) => updateLine(index, "unit_id", e.target.value)}><option value="">اختار الوحدة</option>{compatibleUnits(line.inventory_item_id).map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.abbreviation})</option>)}</select></label>
            <div style={{ display: "flex", alignItems: "end" }}><button type="button" disabled={lines.length === 1} style={{ ...secondary, width: "100%" }} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>حذف المكون</button></div>
          </div>)}
        </div>

        <label style={{ display: "block", marginTop: 14 }}>ملاحظات<textarea style={{ ...field, minHeight: 75 }} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <button type="submit" disabled={saving} style={{ ...button, opacity: saving ? .6 : 1 }}>{saving ? "جاري التنفيذ..." : "تنفيذ التصنيع وتحديث المخزون"}</button>
          <button type="button" disabled={saving} style={secondary} onClick={saveTemplate}>{saving ? "جاري الحفظ..." : editingTemplateId ? "تحديث القالب" : "حفظ كقالب"}</button>
        </div>
        <p style={{ color: "#aaa", fontSize: 12, lineHeight: 1.8, marginBottom: 0 }}>تنفيذ التصنيع يخصم المكونات ويضيف الناتج ويحسب متوسط التكلفة داخل معاملة واحدة. لن يتم تعديل المخزون عند حفظ القالب فقط.</p>
      </form>

      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>آخر عمليات التصنيع</h2>
        {history.length === 0 ? <p style={{ color: "#aaa" }}>لا توجد عمليات تصنيع مسجلة حتى الآن.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 650, borderCollapse: "collapse", textAlign: "right" }}><thead><tr>{["رقم العملية","الصنف الناتج","الكمية","إجمالي التكلفة","تكلفة الوحدة","التاريخ"].map((label) => <th key={label} style={{ padding: 12, borderBottom: "1px solid #444", color: "#c99a55" }}>{label}</th>)}</tr></thead><tbody>{history.map((row) => <tr key={row.id}>{[<b key="production-id">#{row.id}</b>, getItemName(row.output_item_id), `${number(row.output_input_quantity)} ${getUnitName(row.output_unit_id)}`, money(row.total_cost), money(row.unit_cost), new Date(row.created_at).toLocaleString("ar-EG")].map((value, index) => <td key={index} style={{ padding: 12, borderBottom: "1px solid #303030" }}>{value}</td>)}</tr>)}</tbody></table></div>}
      </section>
    </main>
  );
}
