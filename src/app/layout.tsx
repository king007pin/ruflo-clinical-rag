import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased" style={{ background: "var(--bg)", color: "var(--text)" }}>
        {children}

      </body>
    </html>
  );
}
