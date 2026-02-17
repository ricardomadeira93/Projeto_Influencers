"use client";

import { useLanguage } from "@/components/app/language-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LanguageSwitcher() {
  const { locale, setLocale, tr } = useLanguage();

  return (
    <div className="min-w-[132px]">
      <Select value={locale} onValueChange={(value) => setLocale(value === "en" ? "en" : "pt")}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder={tr("locale.label")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pt">{tr("locale.pt")}</SelectItem>
          <SelectItem value="en">{tr("locale.en")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
