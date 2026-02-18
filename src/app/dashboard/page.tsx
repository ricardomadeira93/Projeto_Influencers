import { DashboardClient } from "@/components/dashboard-client";
import { TermsBanner } from "@/components/terms-banner";

export default function DashboardPage() {
  return (
    <main className="space-y-6">
      <TermsBanner />
      <DashboardClient />
    </main>
  );
}
