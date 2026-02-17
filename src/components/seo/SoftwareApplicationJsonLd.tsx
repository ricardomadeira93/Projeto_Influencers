import { JsonLd } from "@/components/seo/JsonLd";

type SoftwareApplicationJsonLdProps = {
  name: string;
  description: string;
  url: string;
  applicationCategory?: string;
  offers?: {
    price: string;
    priceCurrency: string;
  };
};

export function SoftwareApplicationJsonLd({
  name,
  description,
  url,
  applicationCategory = "VideoEditingApplication",
  offers
}: SoftwareApplicationJsonLdProps) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name,
        description,
        url,
        applicationCategory,
        operatingSystem: "Web",
        ...(offers
          ? {
              offers: {
                "@type": "Offer",
                price: offers.price,
                priceCurrency: offers.priceCurrency
              }
            }
          : {})
      }}
    />
  );
}
