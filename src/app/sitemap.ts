import type { MetadataRoute } from "next";
import { landingPages } from "@/lib/seo/landing-pages";
import { absoluteUrl } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: absoluteUrl("/use-cases"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8
    }
  ];

  const useCaseRoutes: MetadataRoute.Sitemap = landingPages.map((page) => ({
    url: absoluteUrl(`/use-cases/${page.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7
  }));

  return [...staticRoutes, ...useCaseRoutes];
}
