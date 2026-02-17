import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/seo/site";

export const alt = `${siteConfig.siteName} preview`;
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #fff4e8 0%, #fbfaf7 45%, #f8e7d6 100%)",
          color: "#101112",
          padding: "64px"
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>
          {siteConfig.siteName}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.04 }}>
            Clips de tutorial em minutos.
          </div>
          <div style={{ fontSize: 32, color: "#5d646d" }}>
            Envie uma vez. Exporte shorts verticais com legendas.
          </div>
        </div>
      </div>
    ),
    size
  );
}
