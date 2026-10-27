import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { signInWithGoogle, signOutToHome } from "@/lib/auth-actions";

/** The sections the bar's links jump to. Each id is on a section of the landing page. */
export const SECTION_LINKS = [
  { href: "#features", label: "What you get" },
  { href: "#how", label: "How it works" },
];

/** The bar across the top of the landing page: the name on the left, the sections in the middle, the theme and the account on the right. */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6 md:px-8">
        <Link href="/" className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Brief<span className="text-primary">.</span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {SECTION_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <>
              <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Dashboard
              </Link>
              <form action={signOutToHome}>
                <Button type="submit" variant="ghost" size="lg">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <form action={signInWithGoogle}>
              <Button type="submit" size="lg">
                Sign in
              </Button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
