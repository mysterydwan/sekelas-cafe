import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Fraunces, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { RegisterSW } from "@/components/pwa/register-sw";
import { LANG_COOKIE, normalizeLang } from "@/lib/i18n/shared";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Sekelas Cafe — SMKN 1 Boyolangu",
    template: "%s · Sekelas Cafe",
  },
  description:
    "Kafe siswa SMKN 1 Boyolangu — pesan tanpa antre, lacak pesananmu, dan sistem operasional kasir-dapur dalam satu tempat.",
  keywords: ["Sekelas Cafe", "SMKN 1 Boyolangu", "kafe", "kopi", "Tulungagung"],
  icons: { icon: "/logo.png", apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sekelas Cafe",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#241610",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Language is cookie-persisted so the server render already matches the
  // client's chosen locale (no hydration flash, correct <html lang>).
  const lang = normalizeLang((await cookies()).get(LANG_COOKIE)?.value);

  return (
    <html lang={lang === "jv" ? "jv" : lang} suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${jakarta.variable} ${geistMono.variable} antialiased bg-background text-foreground font-sans`}
      >
        <Providers initialLang={lang}>
          {children}
          <RegisterSW />
        </Providers>
      </body>
    </html>
  );
}
