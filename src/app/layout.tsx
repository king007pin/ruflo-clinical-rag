import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Agentation } from "agentation";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Mediq",
  description:
    "Multi-model clinical research copilot — ingest medical PDFs, guidelines, and lectures, then query with a swarm of AI agents grounded in your corpus.",
  openGraph: {
    title: "Mediq",
    description: "AI-powered clinical swarm notebook for licensed physicians.",
    type: "website",
  },
};

// Sync the `dark` class on <html> before first paint to avoid FOUC and to
// keep the toggle's localStorage state in agreement with the rendered theme.
// Honors (in order): user's saved preference, OS `prefers-color-scheme`, light.
const themeInitScript = `(function(){try{var s=localStorage.getItem('mediq-theme');var t=(s==='dark'||s==='light')?s:((window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased" style={{ background: "var(--bg)", color: "var(--text)" }}>
        {children}
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
