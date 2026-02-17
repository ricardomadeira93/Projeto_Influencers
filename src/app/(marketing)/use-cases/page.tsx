import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { landingPages } from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Use Cases",
  description: "SEO landing pages for tutorial creators using SplitShorts.",
  alternates: { canonical: absoluteUrl("/use-cases") },
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
    <main className="space-y-8">
      <section>
        <h1>Use Cases</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose a workflow based on your content type and publishing channel.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {landingPages.map((page) => (
          <Card key={page.slug}>
            <CardHeader>
              <CardTitle className="text-lg">{page.title}</CardTitle>
              <CardDescription>{page.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary">
                <Link href={`/use-cases/${page.slug}`}>Read use case</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
