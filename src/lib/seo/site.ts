export const siteConfig = {
  siteName: "SplitShorts",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000",
  defaultTitle: "SplitShorts | Turn Tutorial Videos Into Viral Split-Screen Shorts",
  titleTemplate: "%s | SplitShorts",
  defaultDescription:
    "Convert one tutorial recording into vertical split-screen shorts with captions, clip suggestions, and ready-to-post metadata.",
  defaultOgImage: "/opengraph-image",
  twitterHandle: process.env.NEXT_PUBLIC_TWITTER_HANDLE || ""
} as const;

export function absoluteUrl(pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalized, siteConfig.siteUrl).toString();
}
