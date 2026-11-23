import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "ARKAN Cafe & Restaurant",
  description: "اطلب أشهى الفطائر الشرقية والمكرونات والأطباق الرئيسية والمشروبات من أركان.",
  applicationName: "ARKAN",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
  <CartProvider>
    {children}
  </CartProvider>
</body>
    </html>
  );
}
