import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { SharedDashboardView } from "@/components/shared-dashboard-view";
import { backendGet } from "@/lib/backend";
import { personLabel } from "@/lib/profile";
import { asAccessRemoved, asSharedDashboard } from "@/lib/sharing";

export const metadata = { title: "Shared dashboard", robots: { index: false, follow: false } };

/** Someone else's dashboard that they approved this person to look at. Read only. A share that never existed is not found, and one the owner took away says so. */
export default async function SharedDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");
  const { id } = await params;

  const shared = asSharedDashboard(await backendGet(email, `/shared/${encodeURIComponent(id)}/dashboard`));
  if (!shared) {
    // The owner may have taken access away. That is said plainly, and the person stays signed in, instead of a missing page.
    const removed = asAccessRemoved(await backendGet(email, `/shared/${encodeURIComponent(id)}/removed`));
    if (!removed) notFound();
    const owner = personLabel(removed.ownerName, removed.ownerEmail);
    return (
      <div className="flex flex-1 flex-col">
        <AppHeader email={email} current="shared" />
        <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-1 flex-col gap-5 py-6">
          <section aria-labelledby="removed-heading" className="mx-auto mt-10 w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <h1 id="removed-heading" className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              Your access was removed
            </h1>
            <p className="mt-3 text-muted-foreground">
              <strong className="font-semibold text-foreground">{owner}</strong> has removed your access to their dashboard, so you can no longer see it. If you
              think this is a mistake, ask them to send you a new link.
            </p>
            <Link href="/dashboard/shared" className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">
              Back to Shared
            </Link>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="shared" />
      <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-1 flex-col gap-5 py-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Shared dashboard</h1>
          <p className="mt-1 text-muted-foreground">A shared view of documents, key dates, and pending questions.</p>
        </div>
        <SharedDashboardView shared={shared} />
      </div>
    </div>
  );
}
