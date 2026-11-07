import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { DashboardStats } from "@/components/dashboard-stats";
import { DashboardUpload } from "@/components/dashboard-upload";
import { NowReading } from "@/components/now-reading";
import { DocumentAnalysis } from "@/components/document-analysis";
import { LeaseCountdown } from "@/components/lease-countdown";
import { KindBreakdown } from "@/components/kind-breakdown";
import { OpenQuestions } from "@/components/open-questions";
import { SharedWithYou } from "@/components/shared-with-you";
import { RecentActivity } from "@/components/recent-activity";
import { buttonVariants } from "@/components/ui/button";
import { Rise } from "@/components/rise";
import { backendGet } from "@/lib/backend";
import { asKeyDates, nextLeaseEnd } from "@/lib/lease-end";
import { needsName } from "@/lib/profile";
import { asSharedWithMe } from "@/lib/sharing";
import { asDocuments, asInsights, documentStats, openQuestionGroups, recentActivity } from "@/lib/dashboard";

export const metadata = { title: "Dashboard", robots: { index: false, follow: false } };

/** The first thing a person sees after signing in: where their documents stand, and what needs doing. */
export default async function DashboardHome() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");

  const [documentsBody, insightsBody, datesBody, meBody, sharedBody] = await Promise.all([
    backendGet(email, "/documents"),
    backendGet(email, "/me/insights"),
    backendGet(email, "/me/key-dates"),
    backendGet(email, "/me"),
    backendGet(email, "/shared"),
  ]);
  // Someone's first visit: ask for their name before showing anything else.
  if (needsName(meBody)) redirect("/dashboard/welcome");
  const documents = asDocuments(documentsBody);
  const insights = asInsights(insightsBody);
  const stats = documentStats(documents);
  const sharedWithMe = asSharedWithMe(sharedBody);
  const lease = nextLeaseEnd(asKeyDates(datesBody), documents);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="dashboard" />
      <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-1 flex-col gap-5 py-5">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 px-7 py-5 text-primary-foreground shadow-lg shadow-primary/20 md:px-8 md:py-6">
          <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-24 size-44 rounded-full bg-white/5" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Dashboard</h1>
              <p className="mt-1.5 max-w-xl text-sm text-primary-foreground md:text-base">Where your documents stand, and what needs doing next.</p>
            </div>
            <Link href="/dashboard/shared#sharing" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Share dashboard
            </Link>
          </div>
        </div>

        {sharedWithMe.length > 0 && (
          <Rise order={1}>
            <SharedWithYou items={sharedWithMe} />
          </Rise>
        )}

        <Rise order={2}>
          <DashboardStats stats={stats} />
        </Rise>

        <NowReading />

        <Rise order={3} className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
          <div className={lease ? "lg:col-span-2" : "lg:col-span-3"}>
            <DashboardUpload />
          </div>
          {lease && <LeaseCountdown lease={lease} />}
        </Rise>

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
