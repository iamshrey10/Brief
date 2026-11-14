/** How many photos can be put together into one document. */
export const MAX_PHOTOS = 5;

/** The longest side a photo is shrunk to before it goes into the PDF. A phone photo is far more than the reading needs, and five of them would be heavy to send. */
export const MAX_PHOTO_SIDE = 2600;

/** One photo, ready to be a page: its pixels as JPEG bytes, and its size in pixels. */
export type PhotoPage = { jpeg: Uint8Array; width: number; height: number };

/** The size a page is drawn at, in PDF points: the photo's own shape, with its longer side 842 points (the long side of an A4 sheet). */
export function pageSize(width: number, height: number): { width: number; height: number } {
  const scale = 842 / Math.max(width, height);
  return { width: Math.round(width * scale * 100) / 100, height: Math.round(height * scale * 100) / 100 };
}

const encoder = new TextEncoder();

/**
 * A PDF with one page per photo, each page the shape of its photo with the photo filling it. The photos are stored as they are, as
 * JPEG, so nothing is re-compressed here. The PDF has no text of its own, so the server reads it page by page the way it reads a
 * scanned document. Built by hand, in the plain layout PDF readers all accept: a catalog, the list of pages, then for each page its
 * drawing, its image and its entry, and at the end the table of where everything is.
 */
export function buildPhotosPdf(pages: PhotoPage[]): Uint8Array {
  if (pages.length === 0) throw new Error("a PDF needs at least one photo");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("endobj\n");
  };

  push("%PDF-1.4\n%âãÏÓ\n");
  // Object numbers: 1 catalog, 2 page list, then three for each page (the page, its drawing, its image).
  const pageId = (n: number) => 3 + n * 3;
  const drawingId = (n: number) => 4 + n * 3;
  const imageId = (n: number) => 5 + n * 3;

  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>\n"));
  object(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, n) => `${pageId(n)} 0 R`).join(" ")}] >>\n`));
  pages.forEach((page, n) => {
    const size = pageSize(page.width, page.height);
    object(pageId(n), () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /XObject << /Im0 ${imageId(n)} 0 R >> >> /Contents ${drawingId(n)} 0 R >>\n`,
      ),
    );
    const draw = `q ${size.width} 0 0 ${size.height} 0 0 cm /Im0 Do Q\n`;
    object(drawingId(n), () => push(`<< /Length ${draw.length} >>\nstream\n${draw}endstream\n`));
    object(imageId(n), () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      );
      push(page.jpeg);
      push("\nendstream\n");
    });
  });

  const total = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Turns a photo from the camera or the gallery into a page: opened the right way up (the phone's own sideways note is honoured),
 * shrunk so its longer side is at most MAX_PHOTO_SIDE, and saved as a JPEG. Throws when the browser cannot open the photo, which is
 * what happens to a HEIC photo outside Safari, and the caller says so in words.
 */
export async function photoToPage(file: File, maxSide: number = MAX_PHOTO_SIDE): Promise<PhotoPage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    // A transparent PNG would turn black as a JPEG, so paper white goes underneath.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("could not save the photo");
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bitmap.close();
  }
}

/** The name given to the PDF made from several photos. */
export function combinedName(count: number, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `contract-photos-${day}-${count}-pages.pdf`;
}
