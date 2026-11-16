
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MenuCard from "@/components/MenuCard";
import { menuItems } from "@/lib/menuData";

export default function Home() {
  return (
    <main dir="rtl">
      <Navbar />

      <section className="hero" id="home">
        <div className="hero-content">
          <span className="eyebrow">WELCOME TO ARKAN</span>
          <h1>طعم مختلف،<br /><span>وتجربة تستحق</span></h1>
          <p>
            استمتع بأجواء مميزة وأطباق محضرة بعناية،
            في كافيه ومطعم أركان.
          </p>

          <div className="hero-actions">
            <Link href="/menu" className="primary-button">
              اكتشف المنيو ↙
            </Link>
            <Link href="/#about" className="secondary-button">
              اعرف قصتنا
            </Link>
          </div>
        </div>

        <div className="hero-decoration">
          <div className="hero-circle">
            <span>ARKAN</span>
            <strong>GOOD FOOD<br />GOOD MOOD</strong>
            <small>EST. 2026</small>
          </div>
        </div>

        <div className="hero-bottom">
          QUALITY · TASTE · EXPERIENCE
        </div>
      </section>

      <section className="features">
        <div>
          <span>✦</span>
          <h3>جودة مميزة</h3>
          <p>مكونات مختارة بعناية</p>
        </div>
        <div>
          <span>♨</span>
          <h3>طازج يومياً</h3>
          <p>تحضير باهتمام في كل مرة</p>
        </div>
        <div>
          <span>✧</span>
          <h3>أجواء مختلفة</h3>
          <p>مكان يجمع الأصدقاء والعائلة</p>
        </div>
      </section>

      <section className="menu-section">
        <div className="section-heading">
          <span className="eyebrow">OUR MENU</span>
          <h2>اختار <span>مفضلتك</span></h2>
          <p>مجموعة من اختياراتنا المميزة</p>
        </div>

        <div className="menu-grid">
          {menuItems.slice(0, 3).map((item) => (
            <MenuCard key={item.id} item={item} />
          ))}
        </div>

        <div className="menu-more">
          <Link href="/menu" className="primary-button">
            عرض المنيو بالكامل
          </Link>
        </div>
      </section>

      <section className="about-section" id="about">
        <span className="eyebrow">ABOUT ARKAN</span>
        <h2>أركان مش مجرد مكان،<br /><span>دي تجربة متكاملة</span></h2>
        <p>
          بنؤمن إن الأكل الحلو بيبدأ من التفاصيل الصغيرة،
          من جودة المكونات لحد اللحظة اللي بتستمتع فيها بوقتك معانا.
        </p>
        <Link href="/menu" className="primary-button">
          اكتشف المنيو
        </Link>
      </section>

      <Footer />
    </main>
  );
}
