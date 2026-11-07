import { isInProgress, type DocumentSummary } from "@/lib/documents";

/** The steps a document goes through after it is added, in order. */
export const STEPS = ["Uploaded", "Reading the document", "Preparing the summary", "Ready"] as const;

export type TrackedDocument = {
  document: DocumentSummary;
  /** Whether its key terms and questions have been worked out, which is what makes it ready to open. */
  prepared: boolean;
};

/**
 * Which step a document is on, as an index into STEPS: 0 while it is still being sent, 1 while it is waiting to be read or being
 * read, 2 once it has been read and its summary is being prepared, 3 when it is ready to open. A step before the current one is done.
 */
export function stepOf({ document, prepared }: TrackedDocument): number {
  if (document.status === "pending") return 0;
  if (isInProgress(document.status)) return 1;
  return prepared ? 3 : 2;
}

/** A line saying what is happening now, in plain words, and how far along it is when that is known. */
export function stepText(tracked: TrackedDocument): string {
  const step = stepOf(tracked);
  const { document } = tracked;
  if (step === 0) return "Sending your file";
  if (step === 1) {
    const total = document.progress_total;
    if (document.status === "processing" && typeof total === "number" && total > 0) {
      const done = Math.min(Math.max(Math.floor(document.progress_done ?? 0), 0), total);
      return `Reading part ${done} of ${total}`;
    }
    return "Reading the document";
  }
  if (step === 2) return "Finding the key terms and the questions to ask";
  return "Ready to open";
}

/** How full the bar under the current step is, from 0 to 1, or null when it is not known and the bar just moves. */
export function stepProgress(tracked: TrackedDocument): number | null {
  const { document } = tracked;
  if (stepOf(tracked) !== 1) return null;
  const total = document.progress_total;
  if (document.status !== "processing" || typeof total !== "number" || total <= 0) return null;
  return Math.min(Math.max((document.progress_done ?? 0) / total, 0), 1);
}
