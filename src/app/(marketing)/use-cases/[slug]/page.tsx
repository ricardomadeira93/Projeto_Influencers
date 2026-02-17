import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FaqPageJsonLd } from "@/components/seo/FaqPageJsonLd";
import { getLandingPageBySlug, landingPages } from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";

type PageProps = {
  params: { slug: string };
};

export const dynamicParams = false;

export function generateStaticParams() {
  return landingPages.map((page) => ({ slug: page.slug }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = getLandingPageBySlug(params.slug);
  if (!page) {
    return {
      title: "Use Case Not Found",
      robots: { index: false, follow: false }
    };
  }

  const url = absoluteUrl(`/use-cases/${page.slug}`);

  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      images: [absoluteUrl("/opengraph-image")]
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [absoluteUrl("/twitter-image")]
    }
  };
}

export default function UseCasePage({ params }: PageProps) {
  const page = getLandingPageBySlug(params.slug);
  if (!page) notFound();

  return (
    <main className="space-y-6">
      <FaqPageJsonLd faqs={page.faqs} />

      <section className="card space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted">Use case</p>
        <h1 className="text-3xl font-bold">{page.h1}</h1>
        <p className="text-muted">{page.intro}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard" className="btn-primary">
            Try SplitShorts
          </Link>
          <Link href="/use-cases" className="btn-secondary">
            Back to all use cases
          </Link>
        </div>
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold">Why creators choose this workflow</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
          {page.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold">Frequently asked questions</h2>
        <div className="mt-3 space-y-2">
          {page.faqs.map((faq) => (
            <details key={faq.q} className="rounded-xl border border-black/10 p-3">
              <summary className="cursor-pointer font-medium">{faq.q}</summary>
              <p className="mt-2 text-sm text-muted">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
