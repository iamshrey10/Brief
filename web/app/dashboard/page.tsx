import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { countByKind, summaryLine } from "@/lib/document-summary";
import type { KeyDateFromApi } from "@/lib/key-dates";
import { mintServiceToken } from "@/lib/service-token";
import { ComingUp } from "@/components/coming-up";
import { DocumentUpload } from "@/components/document-upload";

export const metadata = { title: "Your contracts", robots: { index: false, follow: false } };

async function fetchInitialDocuments(email: string) {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const token = await mintServiceToken(email);

  try {
    const res = await fetch(`${backendUrl}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** The dates already saved in this person's documents. Nothing else is read, so this never costs a model call, and any failure just means no countdown. */
async function fetchKeyDates(email: string): Promise<KeyDateFromApi[]> {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${backendUrl}/me/key-dates`, {
      headers: { Authorization: `Bearer ${await mintServiceToken(email)}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    return Array.isArray(body)
      ? body.filter(
          (entry): entry is KeyDateFromApi =>
            typeof entry?.document_id === "string" && typeof entry?.field === "string" && typeof entry?.value === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export default async function Dashboard() {
  const session = await auth();
  const email = session?.user?.email;
  // The proxy already turns visitors away, and this makes the page safe on its own too: nobody who
  // is not signed in is ever shown the dashboard or has anything fetched for it.
  if (!email) redirect("/");
  const [initialDocuments, keyDates] = await Promise.all([fetchInitialDocuments(email), fetchKeyDates(email)]);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="documents" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Your contracts
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Upload a loan, lease, or job offer. Brief explains it clause by clause and shows you the
            exact words behind every answer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Your documents at a glance" role="group">
          <p className="text-sm font-medium text-foreground">{summaryLine(initialDocuments)}</p>
          {countByKind(initialDocuments).map(({ kind, label, count }) => (
            <span
              key={kind}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {label} <span className="font-medium text-foreground">{count}</span>
            </span>
          ))}
        </div>

        <ComingUp keyDates={keyDates} documents={initialDocuments} />

        <DocumentUpload initialDocuments={initialDocuments} />

        <footer className="flex flex-col items-start gap-3 border-t border-border/70 pt-6">
          <p className="text-xs text-muted-foreground">
            Brief explains what a document says. It isn&apos;t legal advice.
          </p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/privacy" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Terms
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
