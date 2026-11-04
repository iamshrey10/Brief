import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import Link from "next/link";
import { BinList } from "@/components/bin-list";
import { SharingPanel } from "@/components/sharing-panel";
import { DeleteAccount } from "@/components/delete-account";
import { ThemeChoice } from "@/components/theme-choice";
import { UsageCard } from "@/components/usage-card";
import { backendGet } from "@/lib/backend";
import { initialOf } from "@/lib/profile";
import { asSharedWithMe, asShares } from "@/lib/sharing";
import { asTrash } from "@/lib/trash";
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
  const [usage, trashBody, sharesBody, sharedBody] = await Promise.all([
    fetchUsageToday(email),
    backendGet(email, "/trash"),
    backendGet(email, "/shares"),
    backendGet(email, "/shared"),
  ]);
  const trash = asTrash(trashBody);
  const shares = asShares(sharesBody);
  const sharedWithMe = asSharedWithMe(sharedBody);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="profile" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Profile</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">Your account, what you have used today, and the Bin.</p>
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

        <SharingPanel initial={shares} />

        {sharedWithMe.length > 0 && (
          <section id="shared" aria-labelledby="shared-heading" className="scroll-mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 id="shared-heading" className="text-lg font-semibold tracking-tight text-foreground">
              Shared with you
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Dashboards other people let you look at. Read only.</p>
            <ul className="flex flex-col gap-2">
              {sharedWithMe.map((shared) => (
                <li key={shared.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">{shared.owner_email}</span>
                  {shared.status === "active" ? (
                    <Link href={`/dashboard/shared/${shared.id}`} className="shrink-0 font-medium text-primary underline underline-offset-2">
                      View dashboard
                    </Link>
                  ) : (
                    <span className="shrink-0 text-muted-foreground">Waiting for their approval</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="bin" aria-labelledby="bin-heading" className="scroll-mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 id="bin-heading" className="text-lg font-semibold tracking-tight text-foreground">
            Bin
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Documents you delete stay here for 7 days. Restore one, or delete it for good.
          </p>
          <BinList initial={trash} />
        </section>

        <section aria-labelledby="appearance-heading" className="rounded-2xl border border-border bg-card p-6">
          <h2 id="appearance-heading" className="text-lg font-semibold tracking-tight text-foreground">
            Appearance
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">Choose how Brief looks on this device.</p>
          <ThemeChoice />
        </section>

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
