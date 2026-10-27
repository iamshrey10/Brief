import Link from "next/link";

import { auth } from "@/auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DocumentPreview } from "@/components/document-preview";
import { signInWithGoogle } from "@/lib/auth-actions";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col bg-background">
      <SiteHeader signedIn={Boolean(session?.user)} />
      <section className="flex flex-1 items-center px-6 py-16 md:px-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-md flex-col gap-4 text-center md:text-left">
            <div>
              <h1 className="text-6xl font-semibold tracking-tight text-foreground">
                Brief<span className="text-primary">.</span>
              </h1>
              <p className="font-heading text-2xl text-primary">Every clause, explained.</p>
            </div>
            <p className="text-lg text-muted-foreground">
              An AI that reads your contract and shows you{" "}
              <span className="font-medium text-foreground">
                exactly where every answer comes from
              </span>
              , not a guess.
            </p>

            {session?.user ? (
              <div className="flex items-center justify-center gap-3 md:justify-start">
                <Link href="/dashboard" className="text-sm font-medium text-primary underline">
                  Go to dashboard
                </Link>
              </div>
            ) : (
              <form action={signInWithGoogle}>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Sign in with Google
                </button>
              </form>
            )}
          </div>
          <DocumentPreview />
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
