import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { Providers } from "@/components/providers";
import "./globals.css";

// Readex Pro للعناوين، IBM Plex Sans Arabic للنص، IBM Plex Mono لأرقام EPC والأوقات
const body = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const display = Readex_Pro({ subsets: ["arabic", "latin"], weight: ["500", "700"], variable: "--font-display", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "مخزون حي",
  description: "جرد لحظي بتقنية RFID مع تنبؤ ذكي بالطلب",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#141E1C" },
  ],
};

// يطبّق المظهر المحفوظ قبل أول رسم حتى ما يومض الوضع الفاتح
const themeScript = `try{var t=localStorage.getItem("makhzoon-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${body.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers simulatorEnabled={process.env.SIMULATOR_ENABLED === "true"}>
          <AppHeader />
          <main className="gutter mx-auto max-w-[1240px] pb-12 pt-5">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
