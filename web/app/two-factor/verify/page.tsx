import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { VerifyForm } from "@/components/verify-form";
import { safeNext } from "@/lib/two-factor-cookie";

export const metadata = { title: "Verify it is you", robots: { index: false, follow: false } };

/** Where someone who turned on two step verification gives a code after signing in, on a browser that is not remembered. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string; problem?: string }> }) {
  const email = (await auth())?.user?.email;
  if (!email) redirect("/");
  const { next, problem } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Verify it is you</h1>
        <p className="mt-2 text-muted-foreground">
          You turned on two step verification, so enter the code your authenticator app shows for Brief. Signed in as {email}.
        </p>
      </div>
      <VerifyForm next={safeNext(next)} problem={problem === "1"} />
    </div>
  );
}
