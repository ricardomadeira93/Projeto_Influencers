import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b bg-background/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="text-base font-semibold tracking-tight">
            SplitShorts
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/use-cases">Use Cases</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard">Start free</Link>
            </Button>
            <ThemeToggle />
          </div>
        </Container>
      </header>
      <Container className="py-10 md:py-14">{children}</Container>
      <footer className="border-t py-8">
        <Container className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>SplitShorts</p>
          <div className="flex items-center gap-4">
            <Link href="/">Home</Link>
            <Link href="/use-cases">Use cases</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
        </Container>
      </footer>
    </>
  );
}
