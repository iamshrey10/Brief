import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { signOutToHome } from "@/lib/auth-actions";
import { cn } from "@/lib/utils";

/** The sections of the signed in part of the site, in the order the bar shows them. */
export const APP_SECTIONS = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard" },
  { id: "documents", href: "/dashboard/documents", label: "Documents" },
  { id: "profile", href: "/dashboard/profile", label: "Profile" },
] as const;

export type AppSection = (typeof APP_SECTIONS)[number]["id"];

/**
 * The bar across the top of every signed in page: the name on the left, the sections beside it, who is signed in,
 * the theme and Sign out on the right. On a phone the sections move to a row of their own under the name.
 */
export function AppHeader({
  email,
  current,
  widthClass = "max-w-4xl",
}: {
  email: string;
  current: AppSection;
  widthClass?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur print:hidden">
      <div className={`mx-auto flex w-full flex-wrap items-center justify-between gap-x-4 px-6 ${widthClass}`}>
        <div className="flex h-14 items-center gap-8">
          <Link href="/dashboard" className="font-heading text-xl font-semibold tracking-tight text-foreground">
            Brief<span className="text-primary">.</span>
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 sm:flex">
            <SectionLinks current={current} />
          </nav>
        </div>
        <div className="flex h-14 min-w-0 items-center gap-3">
          <p className="hidden max-w-[14rem] truncate text-xs text-muted-foreground md:block" title={email}>
            {email}
          </p>
          <ThemeToggle />
          <form action={signOutToHome}>
            <Button type="submit" variant="outline" size="lg">
              Sign out
            </Button>
          </form>
        </div>
        <nav aria-label="Sections" className="-mx-2 flex w-full items-center gap-1 pb-2 sm:hidden">
          <SectionLinks current={current} />
        </nav>
      </div>
    </header>
  );
}

function SectionLinks({ current }: { current: AppSection }) {
  return APP_SECTIONS.map((section) => (
    <Link
      key={section.id}
      href={section.href}
      aria-current={section.id === current ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        section.id === current
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {section.label}
    </Link>
  ));
}
