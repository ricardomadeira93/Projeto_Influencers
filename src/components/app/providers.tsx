"use client";

import { ThemeProvider } from "@/components/ui/theme-provider";
import { AppToaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/components/app/language-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        {children}
        <AppToaster />
      </LanguageProvider>
    </ThemeProvider>
  );
}
