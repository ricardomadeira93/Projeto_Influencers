import type { Metadata } from "next";
import { MarketingShell } from "@/components/layout/marketing-shell";
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
    images: [{ url: absoluteUrl(siteConfig.defaultOgImage), width: 1200, height: 630, alt: siteConfig.siteName }]
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    creator: siteConfig.twitterHandle || undefined,
    images: [absoluteUrl("/twitter-image")]
  },
  robots: noIndex
    ? { index: false, follow: false, nocache: true }
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
  return <MarketingShell>{children}</MarketingShell>;
}
