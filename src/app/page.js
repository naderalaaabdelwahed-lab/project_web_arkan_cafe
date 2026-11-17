
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MenuCard from "@/components/MenuCard";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchFeaturedProducts() {
      try {
        const { data, error } = await supabase
          .from("products")
          .select(`
            id,
            name,
            description,
            price,
            image_url,
            categories(name)
          `)
          .eq("is_available", true)
          .order("id", { ascending: true })
          .limit(3);

        if (error) throw error;

        if (!isMounted) return;

        const formattedItems = (data || []).map((item) => ({
          id: item.id,
          name: item.name,
          category: item.categories?.name || "عام",
          price: item.price,
          description: item.description || "",
          emoji: "🍽️",
          image_url: item.image_url,
        }));

        setMenuItems(formattedItems);
      } catch (err) {
        console.error("Home Menu Error:", err);

        if (isMounted) {
          setError("حصل خطأ أثناء تحميل المنتجات. حاول مرة تانية.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchFeaturedProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main dir="rtl">
      <Navbar />

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">WELCOME TO ARKAN</span>

          <h1>
            مش مجرد مطعم،
            <br />
            <span>دي حكاية مذاق.</span>
          </h1>

          <p>
            استمتع بأشهى الأطباق والمشروبات في أجواء
            تجمع بين الفخامة والراحة.
          </p>

          <div className="hero-actions">
            <Link href="/menu" className="primary-button">
              اكتشف المنيو
            </Link>

            <Link href="/reservations" className="secondary-button">
              احجز مكانك
            </Link>
          </div>
        </div>

        <div className="hero-image">
          <div className="hero-image-overlay" />
          <span>ARKAN EXPERIENCE</span>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <div>
          <span>✦</span>
          <h3>جودة مميزة</h3>
          <p>نهتم بكل تفصيلة</p>
        </div>

        <div>
          <span>◈</span>
          <h3>طعم استثنائي</h3>
          <p>مذاق يستحق التجربة</p>
        </div>

        <div>
          <span>♧</span>
          <h3>أجواء راقية</h3>
          <p>مكان يجمعنا</p>
        </div>
      </section>

      {/* Featured Menu */}
      <section className="menu-section">
        <div className="section-heading">
          <span className="eyebrow">OUR MENU</span>
          <h2>
            اختيارات <span>أركان</span>
          </h2>
          <p>اكتشف مجموعة من اختياراتنا المميزة</p>
        </div>

        {loading && (
          <p className="menu-message">
            جاري تحميل المنتجات...
          </p>
        )}

        {error && (
          <p className="menu-message">{error}</p>
        )}

        {!loading && !error && menuItems.length === 0 && (
          <p className="menu-message">
            المنتجات هتكون متاحة قريبًا.
          </p>
        )}

        {!loading && !error && menuItems.length > 0 && (
          <div className="menu-grid">
            {menuItems.map((item) => (
              <MenuCard key={item.id} item={item} />
            ))}
          </div>
        )}

        <div className="menu-more">
          <Link href="/menu" className="primary-button">
            شاهد المنيو بالكامل
          </Link>
        </div>
      </section>

      {/* About */}
      <section className="about-section" id="about">
        <div className="about-content">
          <span className="eyebrow">ABOUT ARKAN</span>

          <h2>
            مكانك المفضل
            <br />
            <span>في كل وقت</span>
          </h2>

          <p>
            في أركان بنهتم إن كل زيارة تكون تجربة مميزة،
            من جودة الأكل لحد الأجواء والتفاصيل الصغيرة.
          </p>

          <Link href="/menu" className="primary-button">
            جرب أركان
          </Link>
        </div>
      </section>

      {/* Customer Services */}
      <section className="menu-section">
        <div className="section-heading">
          <span className="eyebrow">ARKAN SERVICES</span>
          <h2>
            إزاي نقدر <span>نساعدك؟</span>
          </h2>
          <p>كل خدمات أركان في مكان واحد</p>
        </div>

        <div className="features">
          <div>
            <span>🍽️</span>
            <h3>اطلب أكلك</h3>
            <p>اختار من المنيو واطلب اللي بتحبه</p>
            <Link href="/menu" className="primary-button">
              اطلب الآن
            </Link>
          </div>

          <div>
            <span>📅</span>
            <h3>احجز ترابيزتك</h3>
            <p>احجز مكانك واستعد لزيارتك</p>
            <Link href="/reservations" className="primary-button">
              احجز الآن
            </Link>
          </div>

          <div>
            <span>📦</span>
            <h3>تابع طلبك</h3>
            <p>اعرف حالة طلبك في أي وقت</p>
            <Link href="/order-status" className="primary-button">
              استعلام عن الطلب
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
