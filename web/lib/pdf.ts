import type { SummaryBlock } from "@/lib/summary-text";

const PAGE_WIDTH = 612; // US Letter in points
const PAGE_HEIGHT = 792;
const MARGIN = 64;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Widths of the standard Helvetica font for the characters from space (32) to tilde (126), in thousandths of the font size. */
export const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584,
  584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500,
  722, 500, 500, 500, 334, 260, 334, 584,
];

/** Characters outside plain letters that the PDF's text encoding (Windows ANSI) writes with their own code. */
const SPECIAL: Record<string, number> = {
  "€": 0x80, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
};

/** The codes the PDF's font uses for a text. A character the font has no code for becomes a question mark rather than a wrong letter. */
export function toWinAnsi(text: string): number[] {
  const codes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (SPECIAL[char] !== undefined) codes.push(SPECIAL[char]);
    else if (code === 0xa0) codes.push(32);
    else if (code >= 32 && code <= 126) codes.push(code);
    else if (code >= 0xa1 && code <= 0xff) codes.push(code);
    else codes.push(63);
  }
  return codes;
}

export function textWidth(codes: number[], size: number, bold: boolean): number {
  const sum = codes.reduce((total, code) => total + (code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556), 0);
  // The bold face is a little wider than the regular one, and its exact widths are not carried here, so allow for it.
  return (sum * size * (bold ? 1.08 : 1)) / 1000;
}

/** Breaks a text into lines no wider than the space, between words, and inside a word only when the word alone is too wide. */
export function wrapCodes(text: string, size: number, bold: boolean, maxWidth: number): number[][] {
  const lines: number[][] = [];
  let line: number[] = [];
  const fits = (codes: number[]) => textWidth(codes, size, bold) <= maxWidth;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let codes = toWinAnsi(word);
    const joined = line.length > 0 ? [...line, 32, ...codes] : codes;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line.length > 0) lines.push(line);
    line = [];
    while (!fits(codes)) {
      let cut = codes.length - 1;
      while (cut > 1 && !fits(codes.slice(0, cut))) cut -= 1;
      lines.push(codes.slice(0, cut));
      codes = codes.slice(cut);
    }
    line = codes;
  }
  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [[]];
}

type Style = { size: number; bold: boolean; indent: number; before: number; after: number; color: string };
const INK = "0.10 0.10 0.12";
const STYLES: Record<SummaryBlock["kind"], Style> = {
  title: { size: 20, bold: true, indent: 0, before: 0, after: 12, color: INK },
  heading: { size: 13, bold: true, indent: 0, before: 16, after: 4, color: "0.31 0.27 0.90" },
  bullet: { size: 11, bold: false, indent: 14, before: 0, after: 3, color: INK },
  numbered: { size: 11, bold: false, indent: 20, before: 0, after: 4, color: INK },
  paragraph: { size: 10, bold: false, indent: 0, before: 14, after: 0, color: "0.35 0.35 0.40" },
  note: { size: 10, bold: false, indent: 0, before: 10, after: 0, color: "0.35 0.35 0.40" },
};

type Op = { bold: boolean; size: number; x: number; y: number; codes: number[]; color: string };

const hex = (codes: number[]) => codes.map((code) => code.toString(16).padStart(2, "0")).join("").toUpperCase();

/** Lays the blocks out on as many Letter pages as they need. */
function layout(blocks: SummaryBlock[]): Op[][] {
  const pages: Op[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;
  const lowest = MARGIN + 14; // room for the page number

  for (const block of blocks) {
    const style = STYLES[block.kind];
    const lead = style.size * 1.4;
    const lines = wrapCodes(block.text, style.size, style.bold, TEXT_WIDTH - style.indent);
    // A heading is kept with the line after it, so it is never left alone at the foot of a page.
    const needed = style.before + lead * (block.kind === "heading" ? lines.length + 1 : Math.min(lines.length, 2));
    if (y - needed < lowest && pages[pages.length - 1].length > 0) {
      pages.push([]);
      y = PAGE_HEIGHT - MARGIN;
    } else if (pages[pages.length - 1].length > 0) {
      y -= style.before;
    }
    const marker = block.kind === "bullet" ? [0x95] : block.kind === "numbered" ? toWinAnsi(`${block.number}.`) : null;
    lines.forEach((codes, index) => {
      if (y - lead < lowest) {
        pages.push([]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= lead;
      const page = pages[pages.length - 1];
      if (index === 0 && marker) page.push({ bold: false, size: style.size, x: MARGIN, y, codes: marker, color: style.color });
      page.push({ bold: style.bold, size: style.size, x: MARGIN + style.indent, y, codes, color: style.color });
    });
    y -= style.after;
  }
  return pages;
}

/** A PDF of the summary: US Letter, the standard Helvetica fonts, no outside library, built in the browser from what is on screen. */
export function buildPdf(blocks: SummaryBlock[], title: string): Uint8Array {
  const pages = layout(blocks);
  const contents = pages.map((ops, pageIndex) => {
    const parts = ops.map(
      (op) => `${op.color} rg BT /${op.bold ? "F2" : "F1"} ${op.size} Tf ${op.x.toFixed(2)} ${op.y.toFixed(2)} Td <${hex(op.codes)}> Tj ET`,
    );
    const label = toWinAnsi(`Page ${pageIndex + 1} of ${pages.length}`);
    const x = (PAGE_WIDTH - textWidth(label, 9, false)) / 2;
    parts.push(`0.45 0.45 0.50 rg BT /F1 9 Tf ${x.toFixed(2)} ${(MARGIN / 2).toFixed(2)} Td <${hex(label)}> Tj ET`);
    return parts.join("\n");
  });

  const objects: string[] = [];
  const firstPage = 6;
  const kids = pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ");
  const titleHex = "FEFF" + Array.from(title, (char) => (char.codePointAt(0) ?? 63).toString(16).padStart(4, "0")).join("").toUpperCase();
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push(`<< /Title <${titleHex}> /Producer (Brief) >>`);
  pages.forEach((_, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${firstPage + i * 2 + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${contents[i].length} >>\nstream\n${contents[i]}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
