import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { landingPages } from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/shared";

export const metadata: Metadata = {
  title: "Casos de uso",
  description: "Landing pages SEO para criadores de tutoriais usando macet.ai.",
  alternates: { canonical: absoluteUrl("/use-cases") },
  openGraph: {
    title: "Casos de uso macet.ai",
    description: "Encontre o melhor fluxo do macet.ai para o seu nicho de tutorial.",
    url: absoluteUrl("/use-cases"),
    images: [absoluteUrl("/opengraph-image")]
  },
  twitter: {
    card: "summary_large_image",
    title: "Casos de uso macet.ai",
    description: "Encontre o melhor fluxo do macet.ai para o seu nicho de tutorial.",
    images: [absoluteUrl("/twitter-image")]
  }
};

export default function UseCasesIndexPage() {
  const locale = getServerLocale();
  return (
    <main className="space-y-8">
      <section>
        <h1>{t(locale, "useCases.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t(locale, "useCases.body")}</p>
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
                <Link href={`/use-cases/${page.slug}`}>{t(locale, "useCases.readCase")}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
