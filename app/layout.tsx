import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navigation } from "@/components/layout/Navigation";
import { DarkModeInit } from "@/components/DarkModeInit";
import { WorkoutDraftBar } from "@/components/ui/WorkoutDraftBar";

export const metadata: Metadata = {
  title: "Dziennik Treningów",
  description: "Wspólny dziennik treningów siłowych",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className="bg-gray-50 min-h-screen">
        <DarkModeInit />
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
        <WorkoutDraftBar />
        <Navigation />
        <div className="h-16" />
      </body>
    </html>
  );
}
