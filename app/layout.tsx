import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Your new Auth imports
import { AuthProvider } from "@/components/authprovider";

// Google AdSense: set NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-...) to load the
// script site-wide; the AdSlot component then renders real units in the ad
// spaces. Unset = the placeholder boxes stay.
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "B2Web | Smart Lead Generation Screener",
  description: "Identify and qualify the best business leads instantly with AI-powered screening tools.",
};

// Emits <meta name="viewport" content="width=device-width, initial-scale=1">
// into <head> for every route — the mobile-first foundation.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {ADSENSE_CLIENT && (
          <Script
            id="adsense"
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}