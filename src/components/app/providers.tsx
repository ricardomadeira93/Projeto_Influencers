"use client";

import { ThemeProvider } from "@/components/ui/theme-provider";
import { AppToaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <AppToaster />
    </ThemeProvider>
  );
}
