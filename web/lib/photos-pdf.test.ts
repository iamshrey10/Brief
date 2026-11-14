import { describe, expect, it } from "vitest";

import { buildPhotosPdf, combinedName, MAX_PHOTOS, pageSize, type PhotoPage } from "./photos-pdf";

/** The first bytes of a real JPEG, then filler: the builder stores a photo as it is and never looks inside. */
function jpeg(length: number): Uint8Array {
  const bytes = new Uint8Array(length).fill(9);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  bytes.set([0xff, 0xd9], length - 2);
  return bytes;
}
const page = (width = 3000, height = 4000, length = 600): PhotoPage => ({ jpeg: jpeg(length), width, height });
const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("pageSize", () => {
  it("keeps the photo's shape with the longer side at 842 points", () => {
    expect(pageSize(3000, 4000)).toEqual({ width: 631.5, height: 842 });
    expect(pageSize(4000, 3000)).toEqual({ width: 842, height: 631.5 });
  });
});

describe("buildPhotosPdf", () => {
  it("allows five photos", () => {
    expect(MAX_PHOTOS).toBe(5);
  });

  it("refuses to build nothing", () => {
    expect(() => buildPhotosPdf([])).toThrow();
  });

  it("makes a PDF with one page per photo, in the order given", () => {
    const pdf = text(buildPhotosPdf([page(3000, 4000), page(4000, 3000), page(1000, 1000)]));

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("/Count 3");
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(pdf.match(/\/Subtype \/Image/g)).toHaveLength(3);
    expect(pdf.indexOf("/Width 3000 /Height 4000")).toBeLessThan(pdf.indexOf("/Width 4000 /Height 3000"));
    expect(pdf.indexOf("/Width 4000 /Height 3000")).toBeLessThan(pdf.indexOf("/Width 1000 /Height 1000"));
  });

  it("stores each photo untouched as a JPEG stream of the right length", () => {
    const photo = page(3000, 4000, 777);
    const bytes = buildPhotosPdf([photo]);
    const pdf = text(bytes);

    expect(pdf).toContain("/Filter /DCTDecode /Length 777");
    const start = pdf.indexOf("stream\n", pdf.indexOf("/DCTDecode")) + "stream\n".length;
    expect(Array.from(bytes.slice(start, start + 777))).toEqual(Array.from(photo.jpeg));
  });

  it("draws each photo filling its page, shaped like the photo", () => {
    const pdf = text(buildPhotosPdf([page(4000, 3000)]));

    expect(pdf).toContain("/MediaBox [0 0 842 631.5]");
    expect(pdf).toContain("q 842 0 0 631.5 0 0 cm /Im0 Do Q");
  });

  it("writes a table of where every object is, and each entry points at its object", () => {
    const bytes = buildPhotosPdf([page(), page(), page()]);
    const pdf = text(bytes);
    const table = pdf.slice(pdf.lastIndexOf("\nxref\n") + 1);
    const entries = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));

    expect(entries).toHaveLength(2 + 3 * 3);
    entries.forEach((offset, index) => {
      expect(pdf.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
    const start = Number(/startxref\n(\d+)\n/.exec(pdf)![1]);
    expect(pdf.slice(start).startsWith("xref")).toBe(true);
    expect(pdf).toContain(`/Size ${2 + 1 + 3 * 3}`);
  });
});

describe("combinedName", () => {
  it("says how many pages and when, and is a PDF", () => {
    expect(combinedName(3, new Date("2026-11-14T10:00:00Z"))).toBe("contract-photos-2026-11-14-3-pages.pdf");
  });
});
