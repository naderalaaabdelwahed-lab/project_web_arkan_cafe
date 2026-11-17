
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="navbar">
      <Link href="/" className="logo">
        ARKAN<span>.</span>
      </Link>

      <div className="nav-links">
        <Link href="/">الرئيسية</Link>
        <Link href="/menu">المنيو</Link>
        <Link href="/#about">عن أركان</Link>
        <Link href="/#contact">تواصل معنا</Link>
        <Link href="/reservations">احجز ترابيزتك</Link>
        <Link href="/order-status">استعلام عن الطلب</Link>
      </div>

      <Link href="/cart" className="nav-button">
        🛒 السلة
      </Link>
    </nav>
  );
}
