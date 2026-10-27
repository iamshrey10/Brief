import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { signOutToHome } from "@/lib/auth-actions";

/** The bar across the top of every signed in page: the name on the left, who is signed in, the theme and Sign out on the right. */
export function AppHeader({ email, widthClass = "max-w-4xl" }: { email: string; widthClass?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className={`mx-auto flex h-14 w-full items-center justify-between gap-4 px-6 ${widthClass}`}>
        <Link href="/dashboard" className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Brief<span className="text-primary">.</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <p className="hidden max-w-[14rem] truncate text-xs text-muted-foreground sm:block" title={email}>
            {email}
          </p>
          <ThemeToggle />
          <form action={signOutToHome}>
            <Button type="submit" variant="outline" size="lg">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
