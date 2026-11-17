import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * Shown for any address that does not exist, in Brief's own look, with a way back. Without this, Next shows a bare white
 * page with "404" and nothing to press. It links to the dashboard too, which sends a signed out visitor to the first page.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b border-border/70">
        <div className="mx-auto flex h-16 w-[min(100%-3rem,1400px)] items-center">
          <Link href="/" className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Brief<span className="text-primary">.</span>
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-[min(100%-3rem,40rem)] flex-1 flex-col justify-center gap-4 py-16">
        <p className="font-mono text-xs tracking-wide text-muted-foreground">404</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">That page isn&apos;t here.</h1>
        <p className="text-muted-foreground">
          The address may be mistyped, or the page may have moved. Nothing of yours is affected.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Go to your dashboard
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Back to the first page
          </Link>
        </div>
      </div>
    </div>
  );
}
