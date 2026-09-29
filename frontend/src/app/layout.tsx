import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { TVProvider } from "@/lib/tv-context";
import { ProfileProvider } from "@/lib/profile-context";
import { ThemeProvider } from "@/lib/theme-context";
import { FloatingPlayerProvider } from "@/lib/floating-player-context";
import { ProfileSelector } from "@/components/ProfileSelector";
import { FloatingPlayer } from "@/components/FloatingPlayer";

export const viewport: Viewport = {
  themeColor: "#E11D34",
};

export const metadata: Metadata = {
  title: "SilvaFlix — Streaming Familiar",
  description: "O catálogo de filmes da família, sempre no ar.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SilvaFlix",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="font-sans min-h-screen bg-void text-ink antialiased selection:bg-brand selection:text-white">
        <AuthProvider>
          <TVProvider>
            <ProfileProvider>
              <ThemeProvider>
                <FloatingPlayerProvider>
                  <ProfileSelector />
                  <FloatingPlayer />
                  {children}
                </FloatingPlayerProvider>
              </ThemeProvider>
            </ProfileProvider>
          </TVProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
