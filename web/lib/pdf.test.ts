import { describe, expect, it } from "vitest";

import { buildPdf, HELVETICA_WIDTHS, textWidth, toWinAnsi, wrapCodes } from "./pdf";
import type { SummaryBlock } from "./summary-text";

const BLOCKS: SummaryBlock[] = [
  { kind: "title", text: "Summary of my lease, from Brief" },
  { kind: "heading", text: "Key terms" },
  { kind: "bullet", text: "Monthly rent: $1,650.00 (page 2)" },
  { kind: "heading", text: "Questions to ask before signing" },
  { kind: "numbered", number: 1, text: "Does this renew automatically?" },
  { kind: "paragraph", text: "Explained by Brief. Not legal advice." },
];

const decode = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
/** The text drawn on the pages, as the codes written in the file, read back as characters in the order they are drawn. */
const drawn = (pdf: string) => [...pdf.matchAll(/<([0-9A-F]+)> Tj/g)].map((m) => String.fromCharCode(...(m[1].match(/../g) ?? []).map((h) => parseInt(h, 16))));

describe("buildPdf structure", () => {
  const pdf = decode(buildPdf(BLOCKS, "Summary of my lease, from Brief"));

  it("is a PDF from the first byte to the last", () => {
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
  });

  it("has a cross reference table whose every offset lands on the start of its object, which is what makes a file readable", () => {
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    const [, count] = /^xref\n0 (\d+)\n/.exec(pdf.slice(start))!;
    const entries = [...pdf.slice(start).matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
    expect(entries).toHaveLength(Number(count));
    entries.slice(1).forEach((entry, index) => {
      const at = Number(entry[1]);
      expect(pdf.slice(at, at + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
    expect(/\/Size (\d+)/.exec(pdf)![1]).toBe(count);
  });

  it("declares each stream's length truthfully", () => {
    for (const match of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      expect(match[2].length).toBe(Number(match[1]));
    }
  });

  it("has one page here, on US Letter, with the two standard fonts and the title in its information", () => {
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(1);
    expect(pdf).toContain("/MediaBox [0 0 612 792]");
    expect(pdf).toContain("/BaseFont /Helvetica ");
    expect(pdf).toContain("/BaseFont /Helvetica-Bold ");
    expect(pdf).toContain("/Title <FEFF");
  });

  it("draws the text of the blocks, in order, and a page number", () => {
    const text = drawn(pdf);

    expect(text[0]).toBe("Summary of my lease, from Brief");
    expect(text).toContain("Monthly rent: $1,650.00 (page 2)");
    expect(text).toContain("Does this renew automatically?");
    expect(text.at(-1)).toBe("Page 1 of 1");
  });
});

describe("buildPdf over many pages", () => {
  const many: SummaryBlock[] = [
    { kind: "title", text: "Title" },
    ...Array.from({ length: 80 }, (_, i): SummaryBlock => ({ kind: "bullet", text: `Line ${i + 1} of the summary, long enough to be a real sentence.` })),
  ];
  const pdf = decode(buildPdf(many, "Title"));

  it("starts new pages as the text runs out of room, and says so in the page numbers", () => {
    const pages = pdf.match(/\/Type \/Page /g)!.length;

    expect(pages).toBeGreaterThan(1);
    expect(pdf).toContain(`/Count ${pages}`);
    expect(drawn(pdf)).toContain(`Page ${pages} of ${pages}`);
  });

  it("keeps every line inside the page, above the foot", () => {
    const positions = [...pdf.matchAll(/BT \/F\d [\d.]+ Tf ([\d.]+) ([\d.]+) Td/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (const [x, y] of positions) {
      expect(x).toBeGreaterThanOrEqual(64);
      expect(y).toBeGreaterThanOrEqual(30);
      expect(y).toBeLessThanOrEqual(792 - 64);
    }
  });

  it("never leaves a heading alone at the foot of a page", () => {
    const withHeadings: SummaryBlock[] = Array.from({ length: 30 }, (_, i): SummaryBlock[] => [
      { kind: "heading", text: `Section ${i}` },
      { kind: "bullet", text: `First line under section ${i}` },
    ]).flat();
    const doc = decode(buildPdf(withHeadings, "T"));
    const pages = doc.split("/Type /Page /").slice(1);

    expect(pages.length).toBeGreaterThan(1);
    const streams = [...doc.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => drawn(m[1]).filter((line) => !line.startsWith("Page ")));
    for (const lines of streams) expect(lines.at(-1)?.startsWith("Section ")).toBe(false);
  });
});

describe("text encoding", () => {
  const text = (codes: number[]) => String.fromCharCode(...codes);

  it("writes plain text as itself", () => {
    expect(text(toWinAnsi("Rent: $1,650.00 (a)"))).toBe("Rent: $1,650.00 (a)");
  });

  it("writes curly quotes, dashes, bullets and ellipses with their own codes", () => {
    expect(toWinAnsi("‘’“”–—•…€")).toEqual([0x91, 0x92, 0x93, 0x94, 0x96, 0x97, 0x95, 0x85, 0x80]);
  });

  it("keeps accented letters and turns what the font has no code for into a question mark, never a wrong letter", () => {
    expect(toWinAnsi("Zoë")).toEqual([90, 111, 0xeb]);
    expect(toWinAnsi("日本")).toEqual([63, 63]);
    expect(toWinAnsi("a b")).toEqual([97, 32, 98]);
  });

  it("is safe to write inside a PDF whatever the text holds, since text goes in as hex", () => {
    const pdf = decode(buildPdf([{ kind: "paragraph", text: "close ) paren ( and \\ slash %%EOF <> [] {}" }], "T"));

    expect(drawn(pdf)[0]).toBe("close ) paren ( and \\ slash %%EOF <> [] {}");
    expect(pdf.match(/%%EOF/g)).toHaveLength(1);
  });
});

describe("measuring and wrapping", () => {
  it("carries a width for every character from space to tilde", () => {
    expect(HELVETICA_WIDTHS).toHaveLength(95);
    expect(HELVETICA_WIDTHS[0]).toBe(278); // space
    expect(HELVETICA_WIDTHS["W".charCodeAt(0) - 32]).toBe(944);
    expect(HELVETICA_WIDTHS["i".charCodeAt(0) - 32]).toBe(222);
  });

  it("measures wider text as wider, and bold as a little wider than regular", () => {
    const codes = toWinAnsi("Monthly rent");

    expect(textWidth(codes, 20, false)).toBeGreaterThan(textWidth(codes, 10, false));
    expect(textWidth(codes, 10, true)).toBeGreaterThan(textWidth(codes, 10, false));
    expect(textWidth([], 10, false)).toBe(0);
  });

  it("breaks between words, and no line is wider than the space", () => {
    const lines = wrapCodes("The deposit is refundable within thirty days after move out, less any lawful deductions.", 11, false, 200);

    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(textWidth(line, 11, false)).toBeLessThanOrEqual(200);
    expect(lines.map((line) => String.fromCharCode(...line)).join(" ")).toBe("The deposit is refundable within thirty days after move out, less any lawful deductions.");
  });

  it("splits a single word that is wider than the space, instead of running off the page", () => {
    const lines = wrapCodes("A".repeat(80), 11, false, 150);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, 11, false)).toBeLessThanOrEqual(150);
    expect(lines.flat()).toHaveLength(80);
  });

  it("returns one empty line for no text", () => {
    expect(wrapCodes("", 11, false, 100)).toEqual([[]]);
    expect(wrapCodes("   ", 11, false, 100)).toEqual([[]]);
  });
});
