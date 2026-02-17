import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/app/providers";

export const metadata: Metadata = {
  title: "SplitShorts",
  description: "Turn one tutorial video into vertical split-screen shorts.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
