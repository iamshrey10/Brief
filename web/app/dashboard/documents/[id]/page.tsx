import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { DocumentWorkspace } from "@/components/document-workspace";
import {
  DOC_TYPE_LABELS,
  isReadable,
  type ClauseData,
  type DocumentSummary,
} from "@/lib/documents";
import { mintServiceToken } from "@/lib/service-token";

export const metadata = { title: "Document", robots: { index: false, follow: false } };

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}

function StatusNotice({ document }: { document: DocumentSummary }) {
  if (document.status === "failed") {
    return (
      <Notice title="We couldn't read this document">
        Something went wrong while processing it. Try uploading it again, and if it keeps
        happening, a clearer scan or the original PDF usually helps.
      </Notice>
    );
  }
  if (document.status === "needs_retake") {
    const confidence =
      document.ocr_confidence === null ? "" : ` (reading confidence ${Math.round(document.ocr_confidence)}%)`;
    return (
      <Notice title="This looks like a hard-to-read scan">
        The text below{confidence} may contain mistakes. Check anything important against
        the original, or retake the photo in better light and upload it again.
      </Notice>
    );
  }
  if (!isReadable(document.status)) {
    return (
      <Notice title="Still processing">
        This document is being read now. Refresh in a moment, longer files take a little
        while.
      </Notice>
    );
  }
  return null;
}

/** The signed in top bar, then the page's own content at the same width. */
function PageShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={email} current="documents" widthClass="max-w-6xl" />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">{children}</div>
    </div>
  );
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const email = (await auth())?.user?.email;
  if (!email) redirect("/");
  const headers = { Authorization: `Bearer ${await mintServiceToken(email)}` };

  let document: DocumentSummary;
  let clauses: ClauseData[] = [];
  try {
    const documentRes = await fetch(`${backendUrl}/documents/${id}`, { headers, cache: "no-store" });
    if (documentRes.status === 404) notFound();
    if (!documentRes.ok) throw new Error("document request failed");
    document = await documentRes.json();

    if (isReadable(document.status)) {
      const clausesRes = await fetch(`${backendUrl}/documents/${id}/clauses`, {
        headers,
        cache: "no-store",
      });
      if (!clausesRes.ok) throw new Error("clauses request failed");
      clauses = await clausesRes.json();
    }
  } catch (error) {
    // notFound() works by throwing, let Next handle that one instead of swallowing it.
    if (error instanceof Error && "digest" in error) throw error;
    return (
      <PageShell email={email}>
        <Notice title="We couldn't load this document">
          The server did not respond. Try again in a moment.
        </Notice>
      </PageShell>
    );
  }

  return (
    <PageShell email={email}>
      <div className="flex flex-col gap-3">
        <Link href="/dashboard" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          ← Back to your documents
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight break-all text-foreground md:text-3xl">
            {document.filename}
          </h1>
          <span className="rounded-full border border-border bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {DOC_TYPE_LABELS[document.doc_type] ?? document.doc_type}
          </span>
        </div>
      </div>

      <StatusNotice document={document} />

      {isReadable(document.status) &&
        (clauses.length > 0 ? (
          <DocumentWorkspace documentId={document.id} docType={document.doc_type} clauses={clauses} />
        ) : (
          <Notice title="No readable text found">
            This document finished processing but no text could be extracted from it.
          </Notice>
        ))}
    </PageShell>
  );
}
