import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/layout/Navigation";
import { DarkModeInit } from "@/components/DarkModeInit";
import { WorkoutDraftBar } from "@/components/ui/WorkoutDraftBar";
import { PwaInit } from "@/components/PwaInit";
import { AuthProvider } from "@/components/AuthProvider";
import { getAuthUser } from "@/lib/auth";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Auth ustalany raz na serwerze i podawany klientowi przez kontekst —
  // eliminuje fetch '/api/auth' przy każdej nawigacji.
  const authUser = await getAuthUser();

  return (
    <html lang="pl" className={inter.variable}>
      <body className="bg-gray-50 min-h-screen">
        <AuthProvider initial={authUser}>
          <DarkModeInit />
          <PwaInit />
          <main className="pb-16">{children}</main>
          <WorkoutDraftBar />
          <Navigation />
        </AuthProvider>
      </body>
    </html>
  );
}
