import Link from "next/link";
import type { Metadata } from "next";
import { FaqPageJsonLd } from "@/components/seo/FaqPageJsonLd";
import { SoftwareApplicationJsonLd } from "@/components/seo/SoftwareApplicationJsonLd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";

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
    a: "Yes. Upload one source file and SplitShorts suggests multiple segments to export as vertical clips."
  },
  {
    q: "Do I need advanced editing skills?",
    a: "No. The workflow is built for creators who want fast output with minimal timeline work."
  },
  {
    q: "Does SplitShorts include captions and metadata?",
    a: "Yes. Exports include burned captions and a metadata pack with title, description, hook, and hashtags."
  }
];

export default function MarketingHomePage() {
  return (
    <main className="space-y-12">
      <SoftwareApplicationJsonLd
        name={siteConfig.siteName}
        description={siteConfig.defaultDescription}
        url={absoluteUrl("/")}
        offers={{ price: "0", priceCurrency: "USD" }}
      />
      <FaqPageJsonLd faqs={homeFaqs} />

      <section className="space-y-6">
        <Badge variant="secondary">AI video repurposing for tutorial creators</Badge>
        <h1>Create short-form clips from one tutorial recording.</h1>
        <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
          SplitShorts helps coding tutors, educators, and product teams convert long recordings into vertical split-screen clips with captions and publishing metadata.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">Start free</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/use-cases">See how it works</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["1. Upload", "Add one webcam + screen recording."],
          ["2. AI selects moments", "Find high-value tutorial segments."],
          ["3. Export", "Download clips and metadata pack."]
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
          <h2>Built for</h2>
          <p className="text-sm text-muted-foreground">Use-case pages for specific creator workflows.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {["Coding creators", "Dev tutors", "Course educators", "SaaS demo teams"].map((item) => (
            <Card key={item}>
              <CardContent className="flex items-center justify-between py-5">
                <p className="font-medium">{item}</p>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/use-cases">Open</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          ["Split-screen layout", "Show webcam context and screen detail in one 9:16 clip."],
          ["Auto captions", "Burned captions improve clarity and retention."],
          ["AI clip suggestions", "Find moments worth posting without manual scrubbing."],
          ["Publish pack", "Copy title, hooks, and hashtags for each platform."]
        ].map(([title, body]) => (
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
        <h2>Trusted by early creators</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            "Weekly output doubled with one recording workflow.",
            "Our tutorial team now ships clips the same day.",
            "Metadata pack removed posting bottlenecks."
          ].map((quote) => (
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
        <h2 className="mb-3">FAQ</h2>
        <Accordion type="single" collapsible className="rounded-lg border px-4">
          {homeFaqs.map((faq) => (
            <AccordionItem key={faq.q} value={faq.q}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              <AccordionContent>{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ready to ship your next tutorial clip batch?</CardTitle>
          <CardDescription>Start with one recording and export your first short in minutes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard">Start free</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
