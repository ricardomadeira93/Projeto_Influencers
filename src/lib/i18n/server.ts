import { cookies, headers } from "next/headers";
import { AppLocale, LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/shared";

export function getServerLocale(): AppLocale {
  const cookieLocale = cookies().get(LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale) return normalizeLocale(cookieLocale);

  const acceptLanguage = headers().get("accept-language");
  return normalizeLocale(acceptLanguage);
}
