import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SplitShorts",
  description: "Turn one tutorial video into vertical split-screen shorts.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container-shell">
          <header className="mb-8 flex items-center justify-between rounded-2xl border border-black/10 bg-white/80 p-4 backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">SplitShorts</p>
              <h1 className="text-xl font-bold">Tutorial-to-Shorts MVP</h1>
            </div>
            <a href="/dashboard" className="btn-primary">
              Dashboard
            </a>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
