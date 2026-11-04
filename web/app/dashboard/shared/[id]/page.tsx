import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { SharedDashboardView } from "@/components/shared-dashboard-view";
import { backendGet } from "@/lib/backend";
import { asSharedDashboard } from "@/lib/sharing";

export const metadata = { title: "Shared dashboard", robots: { index: false, follow: false } };

/** Someone else's dashboard that they approved this person to look at. Read only. A missing or removed share is simply not found. */
export default async function SharedDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");
  const { id } = await params;

  const shared = asSharedDashboard(await backendGet(email, `/shared/${encodeURIComponent(id)}/dashboard`));
  if (!shared) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="shared" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Shared dashboard</h1>
        <SharedDashboardView shared={shared} />
      </div>
    </div>
  );
}
