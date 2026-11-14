"use client";

import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Camera, CloudUpload, FileText, ImagePlus } from "lucide-react";
import { FOLDERS } from "@/lib/folders";
import { DocTypeIcon } from "@/components/doc-type-icon";
import { Button } from "@/components/ui/button";
import { useUploadNotifications } from "@/components/upload-notifications";
import {
  ACCEPTED_FILE_TYPES,
  contentTypeFor,
  DOC_TYPE_LABELS,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  type DocumentSummary,
} from "@/lib/documents";
import { cn } from "@/lib/utils";
import { startFailureMessage } from "@/lib/upload";
import { guessDocKind } from "@/lib/guess-kind";
import { buildPhotosPdf, combinedName, MAX_PHOTOS, photoToPage } from "@/lib/photos-pdf";

const DOC_TYPES = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));

type Status = "idle" | "uploading" | "error";

/** What an upload is doing right now, in words, so a slow moment does not look like a freeze. */
export type UploadStage = "sample" | "combining" | "preparing" | "sending" | "checking";
export const STAGE_TEXT: Record<UploadStage, string> = {
  sample: "Loading the sample lease...",
  combining: "Putting your photos together...",
  preparing: "Getting ready...",
  sending: "Sending your file...",
  checking: "Checking your file...",
};

/** A made up lease that ships with the site (web/samples), so Brief can be tried without a real contract. */
export const SAMPLE_LEASE_URL = "/samples/sample-lease.pdf";


/** Whether a file is a photo (JPG, PNG or HEIC) rather than a PDF. */
function isPhoto(file: File): boolean {
  return (contentTypeFor(file) ?? "").startsWith("image/");
}

/** The width and height of the small picture shown for a photo, in pixels. Twice the size it is shown at, so it stays sharp on a phone screen. */
const THUMB_SIZE = 96;

/**
 * A small picture of a photo, made by drawing it small, so five full size photos never sit in the page as pictures. The photo is opened the
 * right way up, and what it shows is cropped to a square. An icon stands in until it is ready, and for a PDF or a photo the browser cannot open
 * (a HEIC photo outside Safari).
 */
function Thumb({ file }: { file: File }) {
  const [picture, setPicture] = useState<{ file: File; src: string } | null>(null);
  useEffect(() => {
    if (!isPhoto(file)) return;
    let current = true;
    (async () => {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_SIZE;
        canvas.height = THUMB_SIZE;
        const side = Math.min(bitmap.width, bitmap.height);
        canvas.getContext("2d")?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
        bitmap.close();
        if (current) setPicture({ file, src: canvas.toDataURL("image/jpeg", 0.7) });
      } catch {
        // The icon stays.
      }
    })();
    return () => {
      current = false;
    };
  }, [file]);
  return picture?.file === file ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={picture.src} alt="" className="size-10 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
      <FileText className="size-4.5" />
    </span>
  );
}

/**
 * The upload form: choose or drop a file, say what kind it is, send it, or try the sample lease. Up to five photos can be added, one
 * after another with the camera or several at once from the gallery, and they are put together into one document with a page for each
 * photo. It is used on the
 * Documents page and on the Dashboard, and tells whoever shows it, through `onUploaded`, when a document has been
 * accepted, so each can do what it needs to (add it to its list, or refresh its numbers).
 */
export function UploadPanel({ onUploaded }: { onUploaded: (document: DocumentSummary) => void }) {
  const notifications = useUploadNotifications();
  const [files, setFiles] = useState<File[]>([]);
  // Nothing is chosen until the file name says what it is, or the person chooses. A wrong default would label a document wrongly.
  const [docType, setDocType] = useState("");
  // Whether the kind shown was guessed from the file name, so it can be said, and replaced by the next file's guess.
  const [guessed, setGuessed] = useState(false);
  // Empty means automatic: the folder for the kind.
  const [folder, setFolder] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState<UploadStage>("preparing");
  const [errorMessage, setErrorMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  // A line that is not an error, such as saying that a sixth photo was left out.
  const [notice, setNotice] = useState("");
  const photosOnly = files.length > 0 && files.every(isPhoto);

  // Checked as soon as files are chosen or dropped, so a wrong file is turned away on the spot rather than after a click on Upload.
  // The file picker's own filter does not apply to a drop. Photos are added to the ones already chosen, up to five, and anything
  // else replaces what was there, because a PDF is uploaded on its own.
  function chooseFiles(list: FileList | File[] | null | undefined) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setNotice("");

    for (const candidate of picked) {
      if (contentTypeFor(candidate) === null) {
        setStatus("error");
        setErrorMessage("That kind of file isn't supported. Use a PDF, JPG, PNG, or HEIC.");
        return;
      }
      if (candidate.size > MAX_FILE_SIZE_BYTES) {
        setStatus("error");
        setErrorMessage("That file is larger than the 50 MB limit.");
        return;
      }
    }
    if (picked.length > 1 && !picked.every(isPhoto)) {
      setStatus("error");
      setErrorMessage("Several files at once can only be photos. A PDF is uploaded on its own.");
      return;
    }

    let next = photosOnly && picked.every(isPhoto) ? [...files, ...picked] : picked;
    if (next.length > MAX_PHOTOS) {
      next = next.slice(0, MAX_PHOTOS);
      setNotice(`Up to ${MAX_PHOTOS} photos make one document, so the rest were left out.`);
    }
    if (next.reduce((total, f) => total + f.size, 0) > MAX_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMessage("Those photos together are larger than the 50 MB limit.");
      return;
    }

    setFiles(next);
    setStatus("idle");
    setErrorMessage("");
    // A kind the person chose themselves is kept. Otherwise the name of a single file decides, or nothing does.
    if (!docType || guessed) {
      const guess = next.length === 1 ? guessDocKind(next[0].name) : null;
      setDocType(guess ?? "");
      setGuessed(guess !== null);
    }
  }

  function chooseKind(kind: string) {
    setDocType(kind);
    setGuessed(false);
  }

  function removeFile(index: number) {
    const remaining = files.filter((_, i) => i !== index);
    setFiles(remaining);
    setNotice("");
    if (remaining.length === 0 && guessed) {
      setDocType("");
      setGuessed(false);
    }
  }

  function movePage(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= files.length) return;
    const reordered = [...files];
    [reordered[index], reordered[to]] = [reordered[to], reordered[index]];
    setFiles(reordered);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    chooseFiles(event.dataTransfer.files);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0 || !docType) return;
    if (files.length === 1) {
      await upload(files[0], docType);
      return;
    }
    // Several photos become one PDF with a page for each, in the order shown.
    setStatus("uploading");
    setStage("combining");
    setErrorMessage("");
    let combined: File;
    try {
      const pages = [];
      for (const photo of files) pages.push(await photoToPage(photo));
      combined = new File([buildPhotosPdf(pages) as BlobPart], combinedName(files.length), { type: "application/pdf" });
    } catch {
      setStatus("error");
      setErrorMessage("One of those photos could not be opened here. Take it again, or upload that photo on its own.");
      return;
    }
    if (combined.size > MAX_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMessage("Those photos together are larger than the 50 MB limit.");
      return;
    }
    await upload(combined, docType);
  }

  // Loads the made up lease that ships with the site and sends it through the very same upload as a chosen file.
  async function trySample() {
    if (status === "uploading") return;
    setStage("sample");
    setStatus("uploading");
    setErrorMessage("");
    try {
      const res = await fetch(SAMPLE_LEASE_URL);
      if (!res.ok) throw new Error("the sample lease could not be loaded");
      const blob = await res.blob();
      await upload(new File([blob], "sample-lease.pdf", { type: "application/pdf" }), "lease");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  async function upload(target: File, kind: string) {
    const contentType = contentTypeFor(target);
    if (!contentType) return;

    setStatus("uploading");
    setStage("preparing");
    setErrorMessage("");

    try {
      const createRes = await fetch("/api/backend/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: target.name,
          doc_type: kind,
          content_type: contentType,
          file_size_bytes: target.size,
          ...(folder ? { folder } : {}),
        }),
      });
      if (!createRes.ok) throw new Error(await startFailureMessage(createRes));
      const { document_id, upload_url } = await createRes.json();

      setStage("sending");
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: target,
      });
      if (!uploadRes.ok) throw new Error("the file upload failed");

      setStage("checking");
      const confirmRes = await fetch(`/api/backend/documents/${document_id}/confirm`, {
        method: "PATCH",
      });
      if (!confirmRes.ok) {
        throw new Error(await startFailureMessage(confirmRes, "could not confirm the upload"));
      }
      const confirmed: DocumentSummary = await confirmRes.json();

      setFiles([]);
      setNotice("");
      setDocType("");
      setGuessed(false);
      setStatus("idle");
      notifications.uploaded(confirmed);
      onUploaded(confirmed);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "something went wrong");
    }
  }

  const uploading = status === "uploading";

  return (
    <form
      onSubmit={handleSubmit}
      data-tour="upload"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
    >
      {files.length > 0 ? (
        <div className="flex flex-col gap-2">
          <ul aria-label={files.length > 1 ? `Pages, ${files.length} of ${MAX_PHOTOS}` : "Chosen file"} className="flex flex-col gap-2">
            {files.map((chosen, index) => (
              <li key={`${index}-${chosen.name}-${chosen.size}`} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                <Thumb file={chosen} />
                <span className="min-w-0 flex-1">
                  {files.length > 1 && <span className="block text-xs font-medium text-primary">Page {index + 1}</span>}
                  <span className="block truncate text-sm font-medium text-foreground">{chosen.name}</span>
                  <span className="block text-xs text-muted-foreground">{formatFileSize(chosen.size)}</span>
                </span>
                {files.length > 1 && (
                  <span className="flex shrink-0 items-center">
                    <Button type="button" variant="ghost" size="icon-sm" disabled={uploading || index === 0} aria-label={`Move page ${index + 1} earlier`} onClick={() => movePage(index, -1)}>
                      <ArrowUp aria-hidden className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" disabled={uploading || index === files.length - 1} aria-label={`Move page ${index + 1} later`} onClick={() => movePage(index, 1)}>
                      <ArrowDown aria-hidden className="size-4" />
                    </Button>
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  aria-label={files.length > 1 ? `Remove page ${index + 1}, ${chosen.name}` : `Remove ${chosen.name}`}
                  onClick={() => removeFile(index)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {photosOnly && files.length < MAX_PHOTOS && !uploading && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {/* A phone, or any touch screen: the camera again, for the next page. */}
              <label className="hidden h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent/50 focus-within:ring-3 focus-within:ring-ring/50 max-sm:flex pointer-coarse:flex">
                <Camera aria-hidden className="size-4" />
                Add another page
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Add another page with the camera"
                  onChange={(event) => {
                    chooseFiles(event.target.files);
                    event.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              <label className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent/50 focus-within:ring-3 focus-within:ring-ring/50">
                <ImagePlus aria-hidden className="size-4" />
                Add photos ({files.length} of {MAX_PHOTOS})
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif"
                  multiple
                  aria-label="Add more photos"
                  onChange={(event) => {
                    chooseFiles(event.target.files);
                    event.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>
            </div>
          )}
          {files.length > 1 && (
            <p className="text-xs text-muted-foreground">
              These {files.length} photos become one document, with a page for each, in this order.
            </p>
          )}
          {notice && (
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          )}
        </div>
      ) : (
        <label
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-5 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50",
            dragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
          )}
        >
          <CloudUpload aria-hidden className="size-8 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            <span className="hidden sm:inline">Drop a contract here, or </span>
            <span className="text-primary underline">
              <span className="sm:hidden">Choose a file</span>
              <span className="hidden sm:inline">choose a file</span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground">PDF, JPG, PNG, or HEIC, up to 50 MB. Up to {MAX_PHOTOS} photos make one document.</span>
          <input
            type="file"
            accept={ACCEPTED_FILE_TYPES.join(",")}
            multiple
            aria-label="Choose a file to upload"
            onChange={(event) => {
              chooseFiles(event.target.files);
              event.target.value = "";
            }}
            className="sr-only"
          />
        </label>
      )}
      {files.length === 0 && (
        // For a phone: opens the camera at once, so a paper contract can be photographed. Shown on a small screen and on any
        // touch screen, so a phone held sideways or a tablet has it too. A computer with a mouse has no use for it.
        <label className="hidden h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent/50 focus-within:ring-3 focus-within:ring-ring/50 max-sm:flex pointer-coarse:flex">
          <Camera aria-hidden className="size-4" />
          Take a photo of a paper contract
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Take a photo of a paper contract"
            onChange={(event) => {
              chooseFiles(event.target.files);
              event.target.value = "";
            }}
            className="sr-only"
          />
        </label>
      )}

      <fieldset disabled={uploading} className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          What kind of document is it?
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DOC_TYPES.map((type) => (
            <label key={type.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="doc-type"
                value={type.value}
                checked={docType === type.value}
                onChange={() => chooseKind(type.value)}
                className="peer sr-only"
              />
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm max-sm:min-h-11 text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-50 hover:bg-accent">
                <DocTypeIcon type={type.value} className="size-4 shrink-0" />
                {type.label}
              </span>
            </label>
          ))}
        </div>
        {files.length > 0 && !uploading && (guessed || !docType) && (
          <p id="doc-kind-hint" role="status" className="text-xs text-muted-foreground">
            {guessed ? "Guessed from the file name. Change it if it is wrong." : "Choose what kind of document it is, so Brief reads it the right way."}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="flex flex-col gap-1 md:flex-1">
        <label htmlFor="upload-folder" className="text-sm font-medium text-foreground">
          Folder
        </label>
        <select
          id="upload-folder"
          value={folder}
          disabled={uploading}
          onChange={(event) => setFolder(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none max-sm:min-h-11 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Automatic, by kind</option>
          {FOLDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {docType === "other" && !folder && (
          <p className="text-xs text-muted-foreground">Not sure where this belongs, so it goes in Other. Choose a folder to file it somewhere else.</p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={files.length === 0 || !docType || uploading} className="md:w-48">
        {uploading ? "Uploading..." : "Upload"}
      </Button>
      </div>

      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {uploading && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {STAGE_TEXT[stage]}
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        No contract handy?{" "}
        <button
          type="button"
          data-tour="sample"
          onClick={() => void trySample()}
          disabled={uploading}
          className="inline-flex font-medium text-primary underline-offset-4 outline-none max-sm:min-h-11 max-sm:items-center hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          Try a sample lease
        </button>
      </p>
    </form>
  );
}
