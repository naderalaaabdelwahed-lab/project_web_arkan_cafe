
"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MenuCard from "@/components/MenuCard";
import { supabase } from "@/lib/supabase";

export default function MenuPage() {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    async function fetchMenu() {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id,
          name,
          description,
          price,
          image_url,
          is_available,
          category_id,
          categories(name)
        `)
        .eq("is_available", true)
        .order("id", { ascending: true });

      if (error) {
        console.error("Menu Error:", error);
        setError("حصل خطأ أثناء تحميل المنيو.");
        setLoading(false);
        return;
      }

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
      setLoading(false);
    }

    fetchMenu();
  }, []);

  const groupedMenu = menuItems.reduce((groups, item) => {
    if (!groups[item.category]) {
      groups[item.category] = [];
    }

    groups[item.category].push(item);
    return groups;
  }, {});

  const categories = Object.keys(groupedMenu);

  const displayedCategories =
    activeCategory === "all"
      ? categories
      : categories.filter((category) => category === activeCategory);

  function selectCategory(category) {
    setActiveCategory(category);

    if (category !== "all") {
      setTimeout(() => {
        document
          .getElementById(`category-${categories.indexOf(category)}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } else {
      document
        .getElementById("menu-content")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <main dir="rtl">
      <Navbar />

      <section className="menu-section menu-page">
        <div className="section-heading menu-main-heading">
          <span className="eyebrow">WELCOME TO ARKAN</span>

          <h2>
            مذاق يجمعنا في <span>ARKAN</span>
          </h2>

          <p>
            اكتشف تشكيلتنا المميزة واختر وجبتك المفضلة
          </p>

          <div className="menu-heading-decoration">
            <span />
            <span className="decoration-diamond">◆</span>
            <span />
          </div>
        </div>

        {loading && (
          <p className="menu-message">
            جاري تحميل المنيو...
          </p>
        )}

        {error && (
          <p className="menu-message">{error}</p>
        )}

        {!loading && !error && menuItems.length === 0 && (
          <p className="menu-message">
            المنيو هتكون متاحة قريبًا.
          </p>
        )}

        {!loading && !error && menuItems.length > 0 && (
          <>
            <div className="menu-category-nav">
              <button
                className={activeCategory === "all" ? "active" : ""}
                onClick={() => selectCategory("all")}
              >
                كل الأصناف
              </button>

              {categories.map((category) => (
                <button
                  key={category}
                  className={activeCategory === category ? "active" : ""}
                  onClick={() => selectCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="menu-categories" id="menu-content">
              {displayedCategories.map((category) => {
                const items = groupedMenu[category];
                const categoryIndex = categories.indexOf(category);

                return (
                  <section
                    className="menu-category"
                    id={`category-${categoryIndex}`}
                    key={category}
                  >
                    <div className="menu-category-heading">
                      <div>
                        <span className="eyebrow">DISCOVER OUR TASTE</span>
                        <h2>{category}</h2>
                      </div>

                      <span className="category-count">
                        {items.length} {items.length === 1 ? "صنف" : "أصناف"}
                      </span>
                    </div>

                    <div className="menu-grid">
                      {items.map((item) => (
                        <MenuCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </section>

      <Footer />
    </main>
  );
}
