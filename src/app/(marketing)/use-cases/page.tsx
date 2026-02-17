import Link from "next/link";
import type { Metadata } from "next";
import { landingPages } from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Use Cases",
  description: "SEO landing pages for tutorial creators using SplitShorts.",
  alternates: {
    canonical: absoluteUrl("/use-cases")
  },
  openGraph: {
    title: "SplitShorts Use Cases",
    description: "Find the best SplitShorts workflow for your tutorial niche.",
    url: absoluteUrl("/use-cases"),
    images: [absoluteUrl("/opengraph-image")]
  },
  twitter: {
    card: "summary_large_image",
    title: "SplitShorts Use Cases",
    description: "Find the best SplitShorts workflow for your tutorial niche.",
    images: [absoluteUrl("/twitter-image")]
  }
};

export default function UseCasesIndexPage() {
  return (
    <main className="space-y-6">
      <section className="card">
        <h1 className="text-3xl font-bold">SplitShorts Use Cases</h1>
        <p className="mt-2 text-muted">
          Choose your content workflow and get a tailored path for turning tutorials into short-form clips.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {landingPages.map((page) => (
          <article key={page.slug} className="card">
            <h2 className="text-xl font-semibold">{page.title}</h2>
            <p className="mt-2 text-sm text-muted">{page.description}</p>
            <Link href={`/use-cases/${page.slug}`} className="btn-secondary mt-3">
              Read use case
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
