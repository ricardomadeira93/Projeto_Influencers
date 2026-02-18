import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, BrainCircuit, Captions, Clapperboard, Rocket, Sparkles } from "lucide-react";
import { FaqPageJsonLd } from "@/components/seo/FaqPageJsonLd";
import { SoftwareApplicationJsonLd } from "@/components/seo/SoftwareApplicationJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/shared";
import { HeroMedia } from "@/components/marketing/hero-media";
import { WatchDemoDialog } from "@/components/marketing/watch-demo-dialog";
import { Reveal } from "@/components/motion/reveal";

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

const trustLabels = ["Creator Labs", "EduMotion", "SaaS School", "CourseForge", "DevShorts"];

export default function MarketingHomePage() {
  const locale = getServerLocale();
  const builtForItems = [1, 2, 3, 4].map((n) => t(locale, `marketing.builtFor${n}`));
  const features = [1, 2, 3, 4].map((n) => [t(locale, `marketing.feature${n}Title`), t(locale, `marketing.feature${n}Body`)] as const);
  const quotes = [1, 2, 3].map((n) => t(locale, `marketing.quote${n}`));
  const homeFaqsLocalized =
    locale === "pt"
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
    <main className="space-y-16 pb-8 md:space-y-24">
      <SoftwareApplicationJsonLd
        name={siteConfig.siteName}
        description={siteConfig.defaultDescription}
        url={absoluteUrl("/")}
        offers={{ price: "0", priceCurrency: "USD" }}
      />
      <FaqPageJsonLd faqs={homeFaqsLocalized} />

      <section className="relative -mx-4 overflow-hidden rounded-[28px] border border-border/60 bg-black md:-mx-6">
        <HeroMedia />
        <div className="hero-gradient absolute inset-0 bg-gradient-to-br from-black/75 via-black/55 to-primary/30" />
        <div className="relative z-10 px-6 py-14 md:px-12 md:py-24">
          <Reveal className="space-y-6">
            <Badge variant="secondary" className="border border-white/20 bg-white/10 text-white">
              {t(locale, "marketing.badge")}
            </Badge>
            <div className="max-w-3xl space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
                {t(locale, "marketing.heroTitle")}
              </h1>
              <p className="text-base text-white/80 md:text-lg">{t(locale, "marketing.heroBody")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_14px_32px_hsl(var(--primary)/0.45)]">
                <Link href="/dashboard">{locale === "pt" ? "Criar clipes" : "Create clips"}</Link>
              </Button>
              <WatchDemoDialog />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <Badge variant="outline" className="border-white/30 bg-white/5 text-white">
                {locale === "pt" ? "Longo para Shorts" : "Long to Shorts"}
              </Badge>
              <Badge variant="outline" className="border-white/30 bg-white/5 text-white">
                {locale === "pt" ? "Legendas IA" : "AI Captions"}
              </Badge>
              <Badge variant="outline" className="border-white/30 bg-white/5 text-white">
                {locale === "pt" ? "Reframe automático" : "Auto Reframe"}
              </Badge>
              <Badge variant="outline" className="border-white/30 bg-white/5 text-white">
                {locale === "pt" ? "Pontuação de clipes" : "Clip Scoring"}
              </Badge>
            </div>
          </Reveal>
          <Reveal className="mt-10">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {trustLabels.map((label) => (
                <div key={label} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-xs font-medium text-white/90">
                  {label}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <Reveal>
        <section className="space-y-5">
          <div>
            <h2>{locale === "pt" ? "Como funciona" : "How it works"}</h2>
            <p className="text-sm text-muted-foreground">
              {locale === "pt"
                ? "De um upload para clipes prontos para redes sociais em três passos."
                : "From one upload to social-ready clips in three clear steps."}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [t(locale, "marketing.step1Title"), t(locale, "marketing.step1Body")],
              [t(locale, "marketing.step2Title"), t(locale, "marketing.step2Body")],
              [t(locale, "marketing.step3Title"), t(locale, "marketing.step3Body")]
            ].map(([title, body], index) => (
              <Card key={title} className="hover-lift">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-5">
          <div>
            <h2>{locale === "pt" ? "Stack de recursos" : "Feature stack"}</h2>
            <p className="text-sm text-muted-foreground">
              {locale === "pt"
                ? "Feito para alta velocidade com controle editorial claro."
                : "Built for fast throughput with clear editorial control."}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: features[0][0], body: features[0][1], icon: <Clapperboard className="h-5 w-5 text-primary" /> },
              { title: features[1][0], body: features[1][1], icon: <Captions className="h-5 w-5 text-primary" /> },
              { title: features[2][0], body: features[2][1], icon: <BrainCircuit className="h-5 w-5 text-primary" /> },
              { title: features[3][0], body: features[3][1], icon: <Sparkles className="h-5 w-5 text-primary" /> },
              {
                title: locale === "pt" ? "Painel de projetos" : "Project dashboard",
                body: locale === "pt" ? "Acompanhe jobs, status e clipes em um só lugar." : "Track every job, status, and clip from one place.",
                icon: <BadgeCheck className="h-5 w-5 text-primary" />
              },
              {
                title: locale === "pt" ? "Stack local de baixo custo" : "Low-cost local stack",
                body: locale === "pt" ? "Otimizado para fluxo local com Ollama e uso enxuto de tokens." : "Optimized for local Ollama workflows and lean token usage.",
                icon: <Rocket className="h-5 w-5 text-primary" />
              }
            ].map((feature) => (
              <Card key={feature.title} className="hover-lift">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {feature.icon}
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.body}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-5">
          <div>
            <h2>{locale === "pt" ? "Casos de uso" : "Use cases"}</h2>
            <p className="text-sm text-muted-foreground">
              {locale === "pt"
                ? "Navegue por perfis de criadores e veja posicionamento por contexto."
                : "Switch between creator profiles and see tailored positioning."}
            </p>
          </div>
          <Tabs defaultValue="creators" className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="creators">{locale === "pt" ? "Criadores" : "Creators"}</TabsTrigger>
              <TabsTrigger value="education">{locale === "pt" ? "Educação" : "Education"}</TabsTrigger>
              <TabsTrigger value="teams">{locale === "pt" ? "Times" : "Teams"}</TabsTrigger>
            </TabsList>
            <TabsContent value="creators" className="mt-4 grid gap-3 md:grid-cols-2">
              {builtForItems.slice(0, 2).map((item) => (
                <Card key={item} className="hover-lift">
                  <CardContent className="flex items-center justify-between py-5">
                    <p className="font-medium">{item}</p>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/use-cases">{t(locale, "marketing.open")}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            <TabsContent value="education" className="mt-4 grid gap-3 md:grid-cols-2">
              {builtForItems.slice(2, 4).map((item) => (
                <Card key={item} className="hover-lift">
                  <CardContent className="flex items-center justify-between py-5">
                    <p className="font-medium">{item}</p>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/use-cases">{t(locale, "marketing.open")}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            <TabsContent value="teams" className="mt-4">
              <Card className="hover-lift">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {locale === "pt" ? "Times de produto e growth" : "Product and growth teams"}
                  </CardTitle>
                  <CardDescription>
                    {locale === "pt"
                      ? "Reaproveite webinars, demos e tutoriais em volume para redes sociais."
                      : "Repurpose webinars, demos and tutorials into high-volume social assets."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="secondary">
                    <Link href="/use-cases">{locale === "pt" ? "Explorar casos de uso" : "Explore use cases"}</Link>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-4">
          <h2>{t(locale, "marketing.trustedTitle")}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {quotes.map((quote) => (
              <Card key={quote} className="hover-lift">
                <CardContent className="space-y-2 py-5">
                  <p className="text-sm">★★★★★</p>
                  <p className="text-sm text-muted-foreground">{quote}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-4">
          <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-background to-secondary/10">
            <CardHeader>
              <CardTitle>{locale === "pt" ? "Preço simples para começar" : "Simple pricing to start"}</CardTitle>
              <CardDescription>
                {locale === "pt" ? "Comece grátis e escale quando seu volume de clipes crescer." : "Start free, scale when your clip output grows."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <Link href="/dashboard">{t(locale, "marketing.ctaPrimary")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/use-cases">{locale === "pt" ? "Ver planos" : "View plans"}</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </Reveal>

      <Reveal>
        <section>
          <h2 className="mb-3">{t(locale, "marketing.faqTitle")}</h2>
          <Accordion type="single" collapsible className="rounded-xl border px-4">
            {homeFaqsLocalized.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </Reveal>
    </main>
  );
}
