import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { DashboardStats } from "@/components/dashboard-stats";
import { DashboardUpload } from "@/components/dashboard-upload";
import { DocumentAnalysis } from "@/components/document-analysis";
import { LeaseCountdown } from "@/components/lease-countdown";
import { KindBreakdown } from "@/components/kind-breakdown";
import { OpenQuestions } from "@/components/open-questions";
import { RecentActivity } from "@/components/recent-activity";
import { buttonVariants } from "@/components/ui/button";
import { Rise } from "@/components/rise";
import { backendGet } from "@/lib/backend";
import { asKeyDates, nextLeaseEnd } from "@/lib/lease-end";
import { asDocuments, asInsights, documentStats, openQuestionGroups, recentActivity } from "@/lib/dashboard";

export const metadata = { title: "Dashboard", robots: { index: false, follow: false } };

/** The first thing a person sees after signing in: where their documents stand, and what needs doing. */
export default async function DashboardHome() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");

  const [documentsBody, insightsBody, datesBody] = await Promise.all([
    backendGet(email, "/documents"),
    backendGet(email, "/me/insights"),
    backendGet(email, "/me/key-dates"),
  ]);
  const documents = asDocuments(documentsBody);
  const insights = asInsights(insightsBody);
  const stats = documentStats(documents);
  const lease = nextLeaseEnd(asKeyDates(datesBody), documents);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="dashboard" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Dashboard</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">Where your documents stand, and what needs doing next.</p>
          </div>
          <Link href="/dashboard/profile#sharing" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Share dashboard
          </Link>
        </div>

        <Rise order={1}>
          <DashboardUpload />
        </Rise>

        <Rise order={2}>
          <DashboardStats stats={stats} />
        </Rise>

        {lease && (
          <Rise order={3}>
            <LeaseCountdown lease={lease} />
          </Rise>
        )}

        <Rise order={3}>
          <DocumentAnalysis insights={insights} documents={documents} />
        </Rise>

        <Rise order={4} className="grid gap-6 md:grid-cols-2">
          <RecentActivity items={recentActivity(documents)} />
          <KindBreakdown documents={documents} />
        </Rise>

        <Rise order={5}>
          <OpenQuestions groups={openQuestionGroups(insights, documents)} />
        </Rise>
      </div>
    </div>
  );
}
