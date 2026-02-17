import Link from "next/link";
import type { Metadata } from "next";
import { FaqPageJsonLd } from "@/components/seo/FaqPageJsonLd";
import { SoftwareApplicationJsonLd } from "@/components/seo/SoftwareApplicationJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/shared";

export const metadata: Metadata = {
  title: siteConfig.defaultTitle,
  description: siteConfig.defaultDescription,
  alternates: { canonical: absoluteUrl("/") },
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

const homeFaqs = [
  {
    q: "Can I generate clips from one long tutorial video?",
    a: "Yes. Upload one source file and macet.ai suggests multiple segments to export as vertical clips."
  },
  {
    q: "Do I need advanced editing skills?",
    a: "No. The workflow is built for creators who want fast output with minimal timeline work."
  },
  {
    q: "Does macet.ai include captions and metadata?",
    a: "Yes. Exports include burned captions and a metadata pack with title, description, hook, and hashtags."
  }
];

export default function MarketingHomePage() {
  const locale = getServerLocale();
  const builtForItems = [1, 2, 3, 4].map((n) => t(locale, `marketing.builtFor${n}`));
  const features = [1, 2, 3, 4].map((n) => [t(locale, `marketing.feature${n}Title`), t(locale, `marketing.feature${n}Body`)] as const);
  const quotes = [1, 2, 3].map((n) => t(locale, `marketing.quote${n}`));
  const homeFaqsLocalized = locale === "pt"
    ? [
        {
          q: "Posso gerar clipes a partir de um vídeo longo de tutorial?",
          a: "Sim. Envie um arquivo de origem e o macet.ai sugere vários segmentos para exportar como clipes verticais."
        },
        {
          q: "Preciso ter edição avançada?",
          a: "Não. O fluxo foi feito para criadores que querem saída rápida com pouco trabalho de timeline."
        },
        {
          q: "O macet.ai inclui legendas e metadados?",
          a: "Sim. Os exports incluem legendas e um pacote com título, descrição, gancho e hashtags."
        }
      ]
    : homeFaqs;

  return (
    <main className="space-y-12">
      <SoftwareApplicationJsonLd
        name={siteConfig.siteName}
        description={siteConfig.defaultDescription}
        url={absoluteUrl("/")}
        offers={{ price: "0", priceCurrency: "USD" }}
      />
      <FaqPageJsonLd faqs={homeFaqsLocalized} />

      <section className="space-y-6">
        <Badge variant="secondary">{t(locale, "marketing.badge")}</Badge>
        <h1>{t(locale, "marketing.heroTitle")}</h1>
        <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
          {t(locale, "marketing.heroBody")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">{t(locale, "marketing.ctaPrimary")}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/use-cases">{t(locale, "marketing.ctaSecondary")}</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          [t(locale, "marketing.step1Title"), t(locale, "marketing.step1Body")],
          [t(locale, "marketing.step2Title"), t(locale, "marketing.step2Body")],
          [t(locale, "marketing.step3Title"), t(locale, "marketing.step3Body")]
        ].map(([title, body]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <h2>{t(locale, "marketing.builtForTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t(locale, "marketing.builtForBody")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {builtForItems.map((item) => (
            <Card key={item}>
              <CardContent className="flex items-center justify-between py-5">
                <p className="font-medium">{item}</p>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/use-cases">{t(locale, "marketing.open")}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {features.map(([title, body]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{body}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        <h2>{t(locale, "marketing.trustedTitle")}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {quotes.map((quote) => (
            <Card key={quote}>
              <CardContent className="space-y-2 py-5">
                <p className="text-sm">★★★★★</p>
                <p className="text-sm text-muted-foreground">{quote}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3">{t(locale, "marketing.faqTitle")}</h2>
        <Accordion type="single" collapsible className="rounded-lg border px-4">
          {homeFaqsLocalized.map((faq) => (
            <AccordionItem key={faq.q} value={faq.q}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              <AccordionContent>{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t(locale, "marketing.readyTitle")}</CardTitle>
          <CardDescription>{t(locale, "marketing.readyBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard">{t(locale, "marketing.ctaPrimary")}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
