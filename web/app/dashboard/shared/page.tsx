import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { SharedWithYou } from "@/components/shared-with-you";
import { backendGet } from "@/lib/backend";
import { asSharedWithMe } from "@/lib/sharing";

export const metadata = { title: "Shared with you", robots: { index: false, follow: false } };

/** Every dashboard someone has shared with this person, and the place to enter a link and code that were sent to them. */
export default async function SharedPage() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");
  const items = asSharedWithMe(await backendGet(email, "/shared"));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="shared" />
      <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-1 flex-col gap-5 py-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Shared</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">Dashboards other people let you look at, read only.</p>
        </div>
        <SharedWithYou items={items} headingLevel={2} />
      </div>
    </div>
  );
}
