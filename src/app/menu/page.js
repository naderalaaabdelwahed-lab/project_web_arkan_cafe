
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MenuCard from "@/components/MenuCard";
import { menuItems } from "@/lib/menuData";

export default function MenuPage() {
  return (
    <main dir="rtl">
      <Navbar />

      <section className="menu-section menu-page">
        <div className="section-heading">
          <span className="eyebrow">ARKAN MENU</span>
          <h2>
            اكتشف <span>المنيو</span>
          </h2>
          <p>اختار من مجموعة أطباقنا ومشروباتنا المميزة</p>
        </div>

        <div className="menu-grid">
          {menuItems.map((item) => (
            <MenuCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
