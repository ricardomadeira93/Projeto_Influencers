import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/shared";

export function AppShell({ children }: { children: React.ReactNode }) {
  const locale = getServerLocale();
  return (
    <>
      <header className="border-b bg-background/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{t(locale, "shell.studioTitle")}</p>
            <p className="text-xs text-muted-foreground">{t(locale, "shell.studioSubtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild size="sm">
              <Link href="/">{t(locale, "shell.marketing")}</Link>
            </Button>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </Container>
      </header>
      <Container className="py-8">{children}</Container>
    </>
  );
}
