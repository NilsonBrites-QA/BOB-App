import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { SiteShell } from "@/components/site-shell";
import { ServiceWorkerInit } from "@/components/service-worker-init";
import { ChatWidget } from "@/components/chat-widget";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BOB | Big Odds Bot",
  description:
    "Motor anal\u00edtico para apostas esportivas com big odds no Brasileir\u00e3o. Cinco varia\u00e7\u00f5es por rodada, mem\u00f3ria evolutiva e IA dual.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "BOB — Big Odds Bot",
    description: "Motor anal\u00edtico para apostas esportivas. Cinco varia\u00e7\u00f5es por rodada.",
    images: [{ url: "/web-app-manifest-512x512.png", width: 512, height: 512 }],
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary",
    title: "BOB — Big Odds Bot",
    images: ["/web-app-manifest-512x512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BOB",
    startupImage: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d5c41",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerInit />
        <SiteShell>{children}</SiteShell>
        <ChatWidget />
      </body>
    </html>
  );
}
