/** Saves text as a file on the person's computer. */
export function downloadTextFile(filename: string, text: string, type: string): void {
  downloadBytes(filename, new TextEncoder().encode(text), type);
}

/** Saves bytes, such as a PDF, as a file on the person's computer. */
export function downloadBytes(filename: string, bytes: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not at once: a phone browser starts the save a moment after the click, and a file that has already been withdrawn
  // is the reason a download can look like a button that does nothing.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

const REVOKE_AFTER_MS = 60_000;

export type SaveResult = "shared" | "downloaded" | "cancelled";

/**
 * Saves a file the way the device does it best. A phone is offered its own share sheet, which has Save to Files, Print, WhatsApp and the
 * rest, because many phone browsers, and the browsers inside WhatsApp or LinkedIn, ignore a plain download link. Everything else, and a
 * phone whose share sheet is not there or fails, gets the normal download. Someone closing the sheet is not an error.
 */
export async function saveFile(filename: string, bytes: Uint8Array, type: string): Promise<SaveResult> {
  const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    const file = new File([bytes as BlobPart], filename, { type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
        // Any other failure falls through to the plain download below.
      }
    }
  }
  downloadBytes(filename, bytes, type);
  return "downloaded";
}

/** A file name safe to save under: the document's name without its extension, without slashes or odd characters, plus a suffix. */
export function safeFileName(documentName: string, suffix: string, extension: string): string {
  const base = documentName.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-");
  return `${base || "brief"}-${suffix}.${extension}`;
}
