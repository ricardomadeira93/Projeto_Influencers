import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b bg-background/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <div>
            <p className="text-sm font-semibold">SplitShorts Studio</p>
            <p className="text-xs text-muted-foreground">Create short-form clips from one tutorial recording</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild size="sm">
              <Link href="/">Marketing</Link>
            </Button>
            <ThemeToggle />
          </div>
        </Container>
      </header>
      <Container className="py-8">{children}</Container>
    </>
  );
}
