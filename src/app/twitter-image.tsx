import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/seo/site";

export const alt = `${siteConfig.siteName} social preview`;
export const size = {
  width: 1200,
  height: 600
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #101112 0%, #1e2429 100%)",
          color: "#fbfaf7",
          padding: "56px"
        }}
      >
        <div style={{ fontSize: 24, textTransform: "uppercase", letterSpacing: 2, opacity: 0.8 }}>
          {siteConfig.siteName}
        </div>
        <div style={{ marginTop: 18, fontSize: 58, fontWeight: 800, lineHeight: 1.05 }}>
          Tutorial videos to short-form clips.
        </div>
        <div style={{ marginTop: 16, fontSize: 30, opacity: 0.9 }}>
          Split-screen layout + captions + publish pack
        </div>
      </div>
    ),
    size
  );
}
