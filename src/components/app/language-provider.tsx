"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppLocale, DEFAULT_LOCALE, LOCALE_COOKIE_NAME, normalizeLocale, t } from "@/lib/i18n/shared";

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  tr: (key: string, fallback?: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

function getLocaleFromCookie() {
  const pair = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_NAME}=`));
  if (!pair) return null;
  const value = pair.split("=")[1];
  return normalizeLocale(value);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    const fromCookie = getLocaleFromCookie();
    const resolved = fromCookie || DEFAULT_LOCALE;
    setLocaleState(resolved);
    document.documentElement.lang = resolved === "pt" ? "pt-BR" : "en";
    setLocaleCookie(resolved);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        setLocaleState(nextLocale);
        document.documentElement.lang = nextLocale === "pt" ? "pt-BR" : "en";
        setLocaleCookie(nextLocale);
      },
      tr: (key, fallback) => t(locale, key, fallback)
    }),
    [locale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return ctx;
}
