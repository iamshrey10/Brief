import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { BinList } from "@/components/bin-list";
import { backendGet } from "@/lib/backend";
import { asTrash } from "@/lib/trash";

export const metadata = { title: "Bin", robots: { index: false, follow: false } };

/** The documents the person deleted, which stay here for seven days and can be restored, or removed for good. */
export default async function BinPage() {
  const email = (await auth())?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too.
  if (!email) redirect("/");

  const items = asTrash(await backendGet(email, "/trash"));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="bin" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Bin</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Documents you delete stay here for 7 days. Restore one, or delete it for good.
          </p>
        </div>
        <BinList initial={items} />
      </div>
    </div>
  );
}
