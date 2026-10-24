import Link from "next/link";
import type { ReactNode } from "react";

/** The shared frame of the privacy and terms pages: a heading, a date, readable text and a way back. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12 text-sm leading-relaxed text-foreground">
      <Link href="/" className="text-primary underline-offset-4 hover:underline">
        ← Back to Brief
      </Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-muted-foreground">Last updated {updated}</p>
      </header>
      {children}
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
