import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rendez-vous Parents–Professeurs",
  description:
    "Créez des créneaux de rendez-vous parents–professeurs, partagez un lien public et suivez les réservations en temps réel.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-gray-900`}>
        <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gray-900 text-white grid place-items-center text-xs font-semibold">PT</div>
              <span className="font-medium">Rendez-vous Parents–Professeurs</span>
            </div>
            <nav className="text-sm text-gray-600 hidden sm:flex gap-4">
              <Link href="/" className="hover:text-gray-900">Accueil</Link>
              <Link href="/dashboard" className="hover:text-gray-900">Tableau de bord</Link>
            </nav>
          </div>
        </header>
        <main id="contenu" className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </main>
        <footer className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-gray-500">
            © {new Date().getFullYear()} Parent–Teacher Meetings
          </div>
        </footer>
      </body>
    </html>
  );
}
