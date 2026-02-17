import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";

const noIndex = process.env.NEXT_PUBLIC_NOINDEX === "true";

export const metadata: Metadata = {
  title: {
    default: siteConfig.defaultTitle,
    template: siteConfig.titleTemplate
  },
  description: siteConfig.defaultDescription,
  metadataBase: new URL(siteConfig.siteUrl),
  alternates: {
    canonical: siteConfig.siteUrl
  },
  openGraph: {
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    url: siteConfig.siteUrl,
    siteName: siteConfig.siteName,
    type: "website",
    images: [
      {
        url: absoluteUrl(siteConfig.defaultOgImage),
        width: 1200,
        height: 630,
        alt: siteConfig.siteName
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    creator: siteConfig.twitterHandle || undefined,
    images: [absoluteUrl("/twitter-image")]
  },
  robots: noIndex
    ? {
        index: false,
        follow: false,
        nocache: true
      }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1
        }
      }
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <nav className="card flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold">
          {siteConfig.siteName}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/use-cases" className="btn-secondary">
            Use Cases
          </Link>
          <Link href="/dashboard" className="btn-primary">
            Open App
          </Link>
        </div>
      </nav>
      {children}
      <footer className="card text-sm text-muted">
        <div className="flex flex-wrap gap-4">
          <Link href="/">Home</Link>
          <Link href="/use-cases">Use Cases</Link>
          <a href={siteConfig.siteUrl} rel="canonical">
            Canonical
          </a>
        </div>
      </footer>
    </div>
  );
}
