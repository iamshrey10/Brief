import Link from "next/link";

import { ContactEmail } from "@/components/contact-email";

export const PORTFOLIO_URL = "https://shreyasrevankar.com";

/** The strip at the bottom of the landing page: the name, the legal pages, how to reach the person who made it, and the one thing a reader should not forget. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-[min(100%-3rem,1400px)] flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-sm flex-col gap-2">
          <p className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Brief<span className="text-primary">.</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Brief explains a document in plain English. It is explanation, not legal advice, and it never tells you
            whether to sign.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <nav aria-label="Legal" className="flex gap-5 text-sm text-muted-foreground">
            <Link href="/privacy" className="inline-flex max-sm:min-h-11 max-sm:items-center underline-offset-4 hover:text-foreground hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex max-sm:min-h-11 max-sm:items-center underline-offset-4 hover:text-foreground hover:underline">
              Terms
            </Link>
          </nav>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground md:items-end">
            <a
              href={PORTFOLIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex font-mono text-xs tracking-wide underline-offset-4 hover:text-foreground hover:underline max-sm:min-h-11 max-sm:items-center"
            >
              SHREYASREVANKAR.COM
            </a>
            <ContactEmail className="inline-flex underline-offset-4 hover:text-foreground hover:underline max-sm:min-h-11 max-sm:items-center" />
          </div>
        </div>
      </div>
    </footer>
  );
}
