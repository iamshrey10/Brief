/** The five folders a document's file is kept in, with the words a person sees. The values are what the API accepts. */
export const FOLDERS = [
  { value: "Lease", label: "Lease" },
  { value: "Education_Loan", label: "Education loan" },
  { value: "Job_Offers", label: "Job offers" },
  { value: "Personal_Documents", label: "Personal documents" },
  { value: "Other", label: "Other" },
] as const;

/** The folder a document of each kind goes in when none is chosen. The same rule as the API's. */
export const FOLDER_FOR_KIND: Record<string, string> = { lease: "Lease", loan: "Education_Loan", offer: "Job_Offers", other: "Other" };

/** The folder a document of this kind goes in by itself. */
export function defaultFolderFor(kind: string): string {
  return FOLDER_FOR_KIND[kind] ?? "Other";
}

/** "Education loan" for "Education_Loan"; a folder this site does not know is shown as it came. */
export function folderLabel(folder: string): string {
  return FOLDERS.find((candidate) => candidate.value === folder)?.label ?? folder;
}

/** The folder a document is in. An answer that names none is the folder for its kind. */
export function folderOf(document: { doc_type: string; folder?: string | null }): string {
  return document.folder || defaultFolderFor(document.doc_type);
}

/** Whether the document is somewhere other than the folder for its kind, which is the only time a row says so. */
export function isFiledElsewhere(document: { doc_type: string; folder?: string | null }): boolean {
  return folderOf(document) !== defaultFolderFor(document.doc_type);
}
