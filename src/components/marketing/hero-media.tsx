"use client";

import { useEffect, useMemo, useState } from "react";

export function HeroMedia() {
  const [canAutoplay, setCanAutoplay] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const saveData = Boolean(nav.connection?.saveData);
    setCanAutoplay(!reduced && !saveData);
  }, []);

  const poster = "/hero/hero.jpg";

  const fallback = useMemo(
    () => (
      <img
        src={poster}
        alt="Prévia de geração de clipes no macet.ai"
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
      />
    ),
    []
  );

  if (!canAutoplay) return fallback;

  return (
    <video
      className="absolute inset-0 h-full w-full object-cover"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      aria-hidden="true"
    >
      <source src="/hero/hero.webm" type="video/webm" />
      <source src="/hero/hero.mp4" type="video/mp4" />
    </video>
  );
}
