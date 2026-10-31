import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { DashboardStats } from "@/components/dashboard-stats";
import { buttonVariants } from "@/components/ui/button";
import { backendGet } from "@/lib/backend";
import { asDocuments, documentStats } from "@/lib/dashboard";

export const metadata = { title: "Dashboard", robots: { index: false, follow: false } };

/** The first thing a person sees after signing in: where their documents stand, and what needs doing. */
export default async function DashboardHome() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");

  const documents = asDocuments(await backendGet(email, "/documents"));
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
      </div>
    </div>
  );
}
