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
  URL.revokeObjectURL(url);
}

/** A file name safe to save under: the document's name without its extension, without slashes or odd characters, plus a suffix. */
export function safeFileName(documentName: string, suffix: string, extension: string): string {
  const base = documentName.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-");
  return `${base || "brief"}-${suffix}.${extension}`;
}
