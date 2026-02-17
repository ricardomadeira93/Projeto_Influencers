import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { getServerLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/shared";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const locale = getServerLocale();
  return (
    <>
      <header className="border-b bg-background/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="text-base font-semibold tracking-tight">
            macet.ai
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/use-cases">{t(locale, "shell.useCases")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard">{t(locale, "shell.startFree")}</Link>
            </Button>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </Container>
      </header>
      <Container className="py-10 md:py-14">{children}</Container>
      <footer className="border-t py-8">
        <Container className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>macet.ai</p>
          <div className="flex items-center gap-4">
            <Link href="/">{t(locale, "shell.home")}</Link>
            <Link href="/use-cases">{t(locale, "shell.useCases")}</Link>
            <Link href="/dashboard">{t(locale, "shell.dashboard")}</Link>
          </div>
        </Container>
      </footer>
    </>
  );
}
