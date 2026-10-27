import Link from "next/link";

import { DocumentPreview } from "@/components/document-preview";
import { Button, buttonVariants } from "@/components/ui/button";
import { signInWithGoogle } from "@/lib/auth-actions";

/** Each of these is something the code does today, not something it hopes to do. */
export const HERO_PROMISES = [
  "Every answer quotes the exact words it rests on",
  "When the document does not say, Brief says so",
  "Delete your account and your files go with it",
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The first screen of the landing page: what Brief is, one way in, and the proof underneath. */
export function LandingHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-16 md:px-8 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col items-start gap-6">
        <p className="rounded-full border border-border bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          For loans, leases and job offers
        </p>
        <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-foreground md:text-6xl">
          Every clause, explained.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground md:text-xl">
          An AI that reads your contract and shows you{" "}
          <span className="font-medium text-foreground">exactly where every answer comes from</span>, not a guess.
        </p>

        {signedIn ? (
          <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "h-11 px-5 text-base" })}>
            Go to dashboard
          </Link>
        ) : (
          <form action={signInWithGoogle}>
            <Button type="submit" size="lg" className="h-11 px-5 text-base">
              Sign in with Google
            </Button>
          </form>
        )}

        <ul className="mt-2 flex flex-col gap-2.5 text-sm text-muted-foreground">
          {HERO_PROMISES.map((promise) => (
            <li key={promise} className="flex items-start gap-2.5">
              <Check />
              {promise}
            </li>
          ))}
        </ul>
      </div>
      <DocumentPreview />
    </section>
  );
}
