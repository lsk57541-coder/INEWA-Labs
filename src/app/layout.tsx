import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SplashScreen from "@/components/SplashScreen";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aimaptube.vercel.app"),
  title: "MAPTUBE",
  description: "영상 속 장소를 지도로 — 유튜버 콘텐츠를 지도에서 발견하세요",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MAPTUBE",
  },
  openGraph: {
    type: "website",
    siteName: "MAPTUBE",
    title: "MAPTUBE — 영상 속 장소를 지도로",
    description: "유튜버가 다녀온 맛집·카페·여행지를 지도에서 바로 찾아보세요",
    url: "https://aimaptube.vercel.app",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MAPTUBE — 영상 속 장소를 지도로" }],
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "MAPTUBE — 영상 속 장소를 지도로",
    description: "유튜버가 다녀온 맛집·카페·여행지를 지도에서 바로 찾아보세요",
    images: ["/og.png"],
  },
};

// Without this, pinching the map to zoom also triggers the browser's own
// page-zoom gesture, which scales every absolute-positioned panel/sheet
// along with it. Kakao Maps handles its own zoom via JS, independent of
// the page's scale factor, so disabling page zoom doesn't affect it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body>
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
