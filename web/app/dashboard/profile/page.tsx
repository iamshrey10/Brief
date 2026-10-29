import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { DeleteAccount } from "@/components/delete-account";
import { UsageCard } from "@/components/usage-card";
import { initialOf } from "@/lib/profile";
import { mintServiceToken } from "@/lib/service-token";
import { parseUsage, type Usage } from "@/lib/usage";

export const metadata = { title: "Profile", robots: { index: false, follow: false } };

/** Today's usage for this person, or null when the API does not answer with the numbers expected. Looking uses nothing up. */
async function fetchUsageToday(email: string): Promise<Usage | null> {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}/me/usage`, {
      headers: { Authorization: `Bearer ${await mintServiceToken(email)}` },
      cache: "no-store",
    });
    return res.ok ? parseUsage(await res.json()) : null;
  } catch {
    return null;
  }
}

export default async function ProfilePage() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");
  const usage = await fetchUsageToday(email);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="profile" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Profile</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">Your account, and what you have used today.</p>
        </div>

        <section aria-labelledby="account-heading" className="rounded-2xl border border-border bg-card p-6">
          <h2 id="account-heading" className="text-lg font-semibold tracking-tight text-foreground">
            Account
          </h2>
          <div className="mt-4 flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent font-heading text-xl font-semibold text-accent-foreground"
            >
              {initialOf(email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{email}</p>
              <p className="text-sm text-muted-foreground">Signed in with Google</p>
            </div>
          </div>
        </section>

        <UsageCard usage={usage} />

        <section
          aria-labelledby="danger-heading"
          className="rounded-2xl border border-destructive/30 bg-card p-6"
        >
          <h2 id="danger-heading" className="text-lg font-semibold tracking-tight text-foreground">
            Danger zone
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Deleting your account removes your documents, the stored files and everything read from them. It cannot be undone.
          </p>
          <div className="mt-4">
            <DeleteAccount />
          </div>
        </section>
      </div>
    </div>
  );
}
