import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../public/style.css";
import "../public/heritage.css";
import "../public/premium.css";
import "./globals.css";
import "../public/scrollbars.css";

export const metadata: Metadata = {
  title: "النائلات | ديوان النائلات",
  description:
    "منقية النائلات للشيخ عبدالله بن عامر النهدي. إرث أصيل ومسيرة من الإنجازات في مهرجان الملك عبدالعزيز للإبل.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/isotype.png" },
};
export const viewport: Viewport = { themeColor: "#273a2b" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="landing-mode">{children}</body>
    </html>
  );
}
