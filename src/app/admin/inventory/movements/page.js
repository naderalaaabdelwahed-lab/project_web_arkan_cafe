export default function Page() {
  return (
    <main style={{ width: "100%" }}>
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">ARKAN INVENTORY</p>
          <h1>حركة المخزون</h1>
          <p>متابعة جميع حركات الإضافة والخصم والتسويات والمردودات.</p>
        </div>
      </header>

      <section className="admin-panel" style={{ marginTop: "24px", padding: "30px" }}>
        <h2>حركة المخزون</h2>
        <p style={{ marginTop: "12px", color: "#888" }}>
          سيتم تجهيز وظائف هذا القسم وربطها بقاعدة بيانات المخزون.
        </p>
      </section>
    </main>
  );
}
