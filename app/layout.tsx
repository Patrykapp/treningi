import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navigation } from "@/components/layout/Navigation";
import { DarkModeInit } from "@/components/DarkModeInit";
import { WorkoutDraftBar } from "@/components/ui/WorkoutDraftBar";
import { PwaInit } from "@/components/PwaInit";

export const metadata: Metadata = {
  title: "Dziennik Treningow",
  description: "Wspolny dziennik treningow silowych",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Treningi",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="bg-gray-50 min-h-screen">
        <DarkModeInit />
        <PwaInit />
        <main className="pb-16">{children}</main>
        <WorkoutDraftBar />
        <Navigation />
      </body>
    </html>
  );
}
