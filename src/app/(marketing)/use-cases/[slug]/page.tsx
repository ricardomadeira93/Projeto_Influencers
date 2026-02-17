import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FaqPageJsonLd } from "@/components/seo/FaqPageJsonLd";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLandingPageBySlug, landingPages } from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/shared";

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
    return { title: "Use Case Not Found", robots: { index: false, follow: false } };
  }

  const url = absoluteUrl(`/use-cases/${page.slug}`);

  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: url },
    openGraph: { title: page.title, description: page.description, url, images: [absoluteUrl("/opengraph-image")] },
    twitter: { card: "summary_large_image", title: page.title, description: page.description, images: [absoluteUrl("/twitter-image")] }
  };
}

export default function UseCasePage({ params }: PageProps) {
  const page = getLandingPageBySlug(params.slug);
  const locale = getServerLocale();
  if (!page) notFound();

  return (
    <main className="space-y-8">
      <FaqPageJsonLd faqs={page.faqs} />

      <section className="space-y-4">
        <Badge variant="secondary">{t(locale, "useCase.badge")}</Badge>
        <h1>{page.h1}</h1>
        <p className="max-w-3xl text-muted-foreground">{page.intro}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard">{t(locale, "useCase.try")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/use-cases">{t(locale, "useCase.back")}</Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "useCase.whyWorks")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {page.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "useCase.faqTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            {page.faqs.map((faq, idx) => (
              <AccordionItem key={faq.q} value={`faq-${idx}`}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </main>
  );
}
