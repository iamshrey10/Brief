import Link from "next/link";

export const REPOSITORY_URL = "https://github.com/iamshrey10/Brief";

/** The strip at the bottom of the landing page: the name, the legal pages, the source, and the one thing a reader should not forget. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-start md:justify-between md:px-8">
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
            <Link href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
              Terms
            </Link>
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Source on GitHub
            </a>
          </nav>
          <p className="font-mono text-xs tracking-wide text-muted-foreground">SHREYASREVANKAR.COM</p>
        </div>
      </div>
    </footer>
  );
}
