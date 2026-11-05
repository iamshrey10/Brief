import { Play } from "lucide-react";
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

/** The Google "G", in Google's own four colors, on a white disc so it reads on the purple button. */
function GoogleG() {
  return (
    <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-white">
      <svg viewBox="0 0 48 48" className="size-5">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The first screen of the landing page: what Brief is, one way in, and the proof underneath. */
export function LandingHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto grid w-[min(100%-3rem,1400px)] items-center gap-10 py-10 md:py-14 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col items-start gap-6">
        <p className="rounded-full border border-border bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground">
          For loans, leases and job offers
        </p>
        <h1 className="text-6xl leading-[1.05] font-semibold tracking-tight text-foreground md:text-7xl">
          Every clause, explained.
        </h1>
        <p className="max-w-2xl text-xl text-muted-foreground md:text-2xl">
          An AI that reads your contract and shows you{" "}
          <span className="font-medium text-foreground">exactly where every answer comes from</span>, not a guess.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {signedIn ? (
            <Link href="/dashboard" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-lg" })}>
              Go to dashboard
            </Link>
          ) : (
            <form action={signInWithGoogle}>
              <Button type="submit" size="lg" className="h-12 gap-3 px-5 text-lg">
                <GoogleG />
                Sign in with Google
              </Button>
            </form>
          )}
          <a href="#how" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-6 text-lg" })}>
            <Play aria-hidden="true" className="size-4" />
            See how it works
          </a>
        </div>

        <ul className="mt-2 flex flex-col gap-3 text-base text-muted-foreground">
          {HERO_PROMISES.map((promise) => (
            <li key={promise} className="flex items-start gap-2.5">
              <Check />
              {promise}
            </li>
          ))}
        </ul>
      </div>
      <div className="relative flex justify-center">
        <span aria-hidden="true" className="absolute inset-x-4 inset-y-6 rounded-[45%_55%_50%_50%/55%_45%_55%_45%] bg-accent/70" />
        <DocumentPreview />
      </div>
    </section>
  );
}
