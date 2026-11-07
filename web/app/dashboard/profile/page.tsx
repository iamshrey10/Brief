import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { Lock, Palette, Trash2, Users } from "lucide-react";
import { PendingBadge } from "@/components/pending-badge";
import { ProfileRow } from "@/components/profile-row";
import { BinList } from "@/components/bin-list";
import { TwoFactorPanel } from "@/components/two-factor-panel";
import { ProfileAccount } from "@/components/profile-account";
import { DeleteAccount } from "@/components/delete-account";
import { ThemeChoice } from "@/components/theme-choice";
import { UsageCard } from "@/components/usage-card";
import { backendGet } from "@/lib/backend";
import { asTrash } from "@/lib/trash";
import { asTwoFactorStatus } from "@/lib/two-factor";
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
  const [usage, meBody, trashBody, twoFactorBody] = await Promise.all([
    fetchUsageToday(email),
    backendGet(email, "/me"),
    backendGet(email, "/trash"),
    backendGet(email, "/me/2fa"),
  ]);
  const twoFactor = asTwoFactorStatus(twoFactorBody);
  const me = (meBody && typeof meBody === "object" ? meBody : null) as { first_name?: string | null; last_name?: string | null } | null;
  const trash = asTrash(trashBody);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="profile" />
      <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-1 flex-col gap-5 py-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Profile</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">Your account, what you have used today, and the Bin.</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-5">
            <ProfileAccount email={email} firstName={me?.first_name ?? null} lastName={me?.last_name ?? null} />
            <UsageCard usage={usage} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">Account &amp; preferences</h2>
            {twoFactor && (
              <ProfileRow anchor="two-step" icon={<Lock className="size-5" />} title="Two-step verification" description="Add a second lock to your account.">
                <TwoFactorPanel initialEnabled={twoFactor.enabled} initialCodesLeft={twoFactor.recovery_codes_left} />
              </ProfileRow>
            )}
            <ProfileRow anchor="sharing" href="/dashboard/shared#sharing" badge={<PendingBadge />} icon={<Users className="size-5" />} title="Share your dashboard" description="Let family or friends view your documents." />
            <ProfileRow anchor="bin" icon={<Trash2 className="size-5" />} title="Bin" description="Deleted documents stay for 7 days.">
              <section id="bin" aria-labelledby="bin-heading">
                <h2 id="bin-heading" className="text-lg font-semibold tracking-tight text-foreground">
                  Bin
                </h2>
                <p className="mt-1 mb-4 text-sm text-muted-foreground">
                  Documents you delete stay here for 7 days. Restore one, or delete it for good.
                </p>
                <BinList initial={trash} />
              </section>
            </ProfileRow>
            <ProfileRow anchor="appearance" icon={<Palette className="size-5" />} title="Appearance" description="Choose how Brief looks on this device.">
              <section id="appearance" aria-labelledby="appearance-heading">
                <h2 id="appearance-heading" className="text-lg font-semibold tracking-tight text-foreground">
                  Appearance
                </h2>
                <p className="mt-1 mb-4 text-sm text-muted-foreground">Choose how Brief looks on this device.</p>
                <ThemeChoice />
              </section>
            </ProfileRow>
          </div>
        </div>

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
