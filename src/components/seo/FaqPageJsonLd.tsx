import { JsonLd } from "@/components/seo/JsonLd";

type FaqItem = {
  q: string;
  a: string;
};

type FaqPageJsonLdProps = {
  faqs: FaqItem[];
};

export function FaqPageJsonLd({ faqs }: FaqPageJsonLdProps) {
  if (!faqs.length) return null;

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a
          }
        }))
      }}
    />
  );
}
