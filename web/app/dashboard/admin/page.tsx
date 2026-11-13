import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AppHeader } from "@/components/app-header";
import { asAdminStats } from "@/lib/admin";
import { backendGet } from "@/lib/backend";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

/**
 * How Brief is being used, for its owner only. The backend answers only for the addresses it was told, and anyone else gets
 * the same page as for an address that does not exist. The page holds counts and never a document, a question, a name or an address.
 */
export default async function AdminPage() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");
  const stats = asAdminStats(await backendGet(email, "/admin/stats"));
  if (!stats) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="profile" back={{ href: "/dashboard/profile", label: "Back to Profile" }} />
      <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-1 flex-col gap-5 py-4 sm:py-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">Admin</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            How Brief is being used. These are counts only: this page never shows a document, a question, an answer, or anyone&apos;s name or address.
          </p>
        </div>
        <AdminDashboard stats={stats} />
      </div>
    </div>
  );
}
