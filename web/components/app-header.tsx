import { ChevronLeft, FileText, LayoutDashboard, UserRound, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { PendingBadge } from "@/components/pending-badge";
import { Button } from "@/components/ui/button";
import { signOutToHome } from "@/lib/auth-actions";
import { cn } from "@/lib/utils";

/** The sections of the signed in part of the site, in the order the bar shows them. */
export const APP_SECTIONS = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "documents", href: "/dashboard/documents", label: "Documents", icon: FileText },
  { id: "shared", href: "/dashboard/shared", label: "Shared", icon: Users },
  { id: "profile", href: "/dashboard/profile", label: "Profile", icon: UserRound },
] as const satisfies readonly { id: string; href: string; label: string; icon: LucideIcon }[];

export type AppSection = (typeof APP_SECTIONS)[number]["id"];

/**
 * The bar across the top of every signed in page: the name on the left, the sections beside it, who is signed in,
 * and Sign out on the right. The theme is chosen under Appearance on the Profile page, and the light and dark button lives only on the landing page. On a phone the sections move to a bar fixed at the bottom of the screen, where a thumb
 * reaches, and the bar across the top keeps only the name and Sign out. Pages leave room for it (see the dashboard layout).
 */
export function AppHeader({
  email,
  current,
  back,
  widthClass = "w-[min(100%-3rem,1400px)]",
}: {
  email: string;
  current: AppSection | null;
  /** Where the page one level down goes back to. Shown as a small Back to the left of the name, so the page needs no row of its own for it. */
  back?: { href: string; label: string };
  widthClass?: string;
}) {
  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur print:hidden">
      <div className={`mx-auto flex flex-wrap items-center justify-between gap-x-4 ${widthClass}`}>
        <div className="flex h-14 items-center gap-3 sm:gap-6">
          {back && (
            <Link
              href={back.href}
              aria-label={back.label}
              title={back.label}
              className="inline-flex items-center gap-0.5 rounded-md py-1.5 pr-2 pl-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:min-h-11 max-[380px]:min-w-11 max-[380px]:justify-center"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              {/* On the very narrowest phones only the arrow is drawn, so the bar still fits on one row. */}
              <span className="max-[380px]:sr-only">Back</span>
            </Link>
          )}
          <Link href="/dashboard" className="font-heading text-xl font-semibold tracking-tight text-foreground max-sm:inline-block max-sm:py-2">
            Brief<span className="text-primary">.</span>
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 sm:flex">
            <SectionLinks current={current} />
          </nav>
        </div>
        <div className="flex h-14 min-w-0 items-center gap-2 sm:gap-3">
          <p className="hidden max-w-[12rem] truncate text-xs text-muted-foreground md:block" title={email}>
            {email}
          </p>
          <form action={signOutToHome}>
            <Button type="submit" variant="outline" size="lg">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {APP_SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = section.id === current;
          return (
            <li key={section.id} className="flex-1">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "text-primary" : "text-muted-foreground active:text-foreground",
                )}
              >
                <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-2xl transition-colors", active && "bg-accent")}>
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                {section.label}
                {/* After the label, so a screen reader says "Shared, 1 person is waiting", the way the bar at the top does. */}
                {(section.id === "shared" || section.id === "profile") && (
                  <span className="absolute top-1.5 left-1/2 ml-2">
                    <PendingBadge />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
    </>
  );
}

function SectionLinks({ current }: { current: AppSection | null }) {
  return APP_SECTIONS.map((section) => (
    <Link
      key={section.id}
      href={section.href}
      aria-current={section.id === current ? "page" : undefined}
      className={cn(
        "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        section.id === current
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {section.label}
      {(section.id === "shared" || section.id === "profile") && <PendingBadge corner />}
    </Link>
  ));
}
