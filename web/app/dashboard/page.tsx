import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { ComingUp } from "@/components/coming-up";
import { DashboardStats } from "@/components/dashboard-stats";
import { KindBreakdown } from "@/components/kind-breakdown";
import { RecentActivity } from "@/components/recent-activity";
import { buttonVariants } from "@/components/ui/button";
import { backendGet } from "@/lib/backend";
import { asDocuments, documentStats, recentActivity } from "@/lib/dashboard";
import type { KeyDateFromApi } from "@/lib/key-dates";

export const metadata = { title: "Dashboard", robots: { index: false, follow: false } };

/** The dates from the backend's answer, leaving out anything not shaped like one. */
function asKeyDates(body: unknown): KeyDateFromApi[] {
  return Array.isArray(body)
    ? body.filter(
        (entry): entry is KeyDateFromApi =>
          typeof entry?.document_id === "string" && typeof entry?.field === "string" && typeof entry?.value === "string",
      )
    : [];
}

/** The first thing a person sees after signing in: where their documents stand, and what needs doing. */
export default async function DashboardHome() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");

  const [documentsBody, keyDatesBody] = await Promise.all([backendGet(email, "/documents"), backendGet(email, "/me/key-dates")]);
  const documents = asDocuments(documentsBody);
  const keyDates = asKeyDates(keyDatesBody);
  const stats = documentStats(documents);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="dashboard" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Dashboard</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">Where your documents stand, and what needs doing next.</p>
          </div>
          <Link href="/dashboard/documents" className={buttonVariants({ size: "lg" })}>
            {stats.total === 0 ? "Add your first document" : "Add or open documents"}
          </Link>
        </div>

        <DashboardStats stats={stats} />

        <ComingUp keyDates={keyDates} documents={documents} />

        <div className="grid gap-6 md:grid-cols-2">
          <RecentActivity items={recentActivity(documents)} />
          <KindBreakdown documents={documents} />
        </div>
      </div>
    </div>
  );
}
