import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/use-cases/"],
        disallow: ["/api/", "/app/", "/dashboard/", "/jobs/"]
      }
    ],
    sitemap: absoluteUrl("/sitemap.xml")
  };
}
