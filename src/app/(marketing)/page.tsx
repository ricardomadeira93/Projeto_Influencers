import Link from "next/link";
import type { Metadata } from "next";
import { SoftwareApplicationJsonLd } from "@/components/seo/SoftwareApplicationJsonLd";
import { TermsBanner } from "@/components/terms-banner";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: siteConfig.defaultTitle,
  description: siteConfig.defaultDescription,
  alternates: {
    canonical: absoluteUrl("/")
  },
  openGraph: {
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    url: absoluteUrl("/"),
    images: [absoluteUrl(siteConfig.defaultOgImage)]
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription,
    images: [absoluteUrl("/twitter-image")]
  }
};

export default function MarketingHomePage() {
  return (
    <main className="space-y-6">
      <SoftwareApplicationJsonLd
        name={siteConfig.siteName}
        description={siteConfig.defaultDescription}
        url={absoluteUrl("/")}
        offers={{ price: "0", priceCurrency: "USD" }}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted">AI tool for tutorial creators</p>
          <h1 className="text-3xl font-bold">Turn one tutorial video into multiple split-screen shorts.</h1>
          <p className="text-muted">
            SplitShorts repurposes long tutorials into vertical clips with captions and post-ready metadata for YouTube,
            TikTok, Instagram, and X.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="btn-primary">
              Start for free
            </Link>
            <Link href="/use-cases" className="btn-secondary">
              Explore use cases
            </Link>
          </div>
        </div>

        <div className="card space-y-2">
          <h2 className="text-xl font-semibold">Built for low-end creators</h2>
          <ul className="list-disc pl-5 text-sm text-muted">
            <li>Upload once via signed URL</li>
            <li>Manual webcam crop + split-screen template</li>
            <li>AI clip suggestions with strict segment schema</li>
            <li>Captioned exports + publish pack metadata</li>
          </ul>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Who it helps</h2>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <article>
            <h3 className="font-semibold">Coding creators</h3>
            <p className="text-muted">Keep both code and facecam visible in short-form clips.</p>
          </article>
          <article>
            <h3 className="font-semibold">Dev tutors</h3>
            <p className="text-muted">Extract high-impact teaching moments from long walkthroughs.</p>
          </article>
          <article>
            <h3 className="font-semibold">Educators</h3>
            <p className="text-muted">Post more consistently with reusable metadata packs.</p>
          </article>
        </div>
      </section>

      <TermsBanner />
    </main>
  );
}
