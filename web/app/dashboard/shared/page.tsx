import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { SharedWithYou } from "@/components/shared-with-you";
import { SharingPanel } from "@/components/sharing-panel";
import { backendGet } from "@/lib/backend";
import { asShares, asSharedWithMe } from "@/lib/sharing";

export const metadata = { title: "Shared with you", robots: { index: false, follow: false } };

/** Every dashboard someone has shared with this person, and the place to enter a link and code that were sent to them. */
export default async function SharedPage() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");
  const [sharedBody, sharesBody, meBody] = await Promise.all([backendGet(email, "/shared"), backendGet(email, "/shares"), backendGet(email, "/me")]);
  const me = (meBody && typeof meBody === "object" ? meBody : null) as { first_name?: string | null; last_name?: string | null } | null;
  const ownerName = [me?.first_name, me?.last_name].filter(Boolean).join(" ");
  const items = asSharedWithMe(sharedBody);
  const shares = asShares(sharesBody);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="shared" />
      <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-1 flex-col gap-5 py-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Shared</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">What other people shared with you, and who can see your dashboard.</p>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          <SharedWithYou items={items} headingLevel={2} />
          <SharingPanel initial={shares} ownerName={ownerName} />
        </div>
      </div>
    </div>
  );
}
