// Builds the Brief documents: Markdown in docs/ becomes a PDF with a cover, contents, numbered sections, a header and page numbers.
// Run from this folder: node build.mjs [name ...]   (no name builds everything). Needs the web app's installed Playwright and the API's Python for PyMuPDF.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../web/node_modules/@playwright/test/index.mjs";
import { render } from "./md.mjs";
import { DOCUMENTS } from "./documents.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../Brief-Resources");
const PYTHON = path.resolve(HERE, "../api/.venv/bin/python");
const css = fs.readFileSync(path.join(HERE, "style.css"), "utf8");
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: HERE, encoding: "utf8" }).trim();
const today = "November 17, 2026";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function figureFinder(folder) {
  let count = 0;
  return (file, caption) => {
    const candidates = [path.join(ROOT, folder, file), ...fs.readdirSync(ROOT).filter((d) => /^\d\d-/.test(d)).map((d) => path.join(ROOT, d, file))];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) throw new Error(`figure not found: ${file}`);
    count++;
    const wide = /^wide:\s*/.test(caption);
    caption = caption.replace(/^wide:\s*/, "");
    const small = path.join(HERE, `.small-${path.basename(found)}`);
    execFileSync(PYTHON, [path.join(HERE, "shrink_png.py"), found, small]);
    const data = fs.readFileSync(small).toString("base64");
    fs.rmSync(small);
    return `<figure${wide ? ' class="wide"' : ""}><img src="data:image/png;base64,${data}" alt="${esc(caption)}"><figcaption>Figure ${count}. ${esc(caption)}</figcaption></figure>`;
  };
}

function page(spec, body, toc, pages) {
  const rows = toc
    .filter((h) => h.level <= (spec.tocDepth ?? 3))
    .map((h) => `<div class="row l${h.level}"><span class="n">${h.number}</span><span class="t">${esc(h.title)}</span><span class="dots"></span><span class="p">${pages?.[h.id] ?? ""}</span></div>`)
    .join("");
  return `<!doctype html><html lang="en" style='--running:"${spec.running.replace(/"/g, "")}"'><head><meta charset="utf-8"><title>${esc(spec.title)}</title><style>${css}</style></head><body>
<section class="cover"><div class="band"></div><div class="mark">Brief<span>.</span></div><div class="kind">${esc(spec.kind)}</div><h1>${esc(spec.title)}</h1>
<div class="subtitle">${esc(spec.subtitle)}</div>
<div class="facts"><strong>Product:</strong> Brief, every clause explained &nbsp;|&nbsp; <strong>Live at:</strong> briefcontracts.com<br><strong>Project by:</strong> Shreyas Revankar<br><strong>Written:</strong> ${today}, from the code at commit <strong>${commit}</strong> of the main branch<br><strong>Source:</strong> github.com/iamshrey10/Brief</div></section>
<section class="toc page-body"><h1>Contents</h1>${rows}</section>
<main class="page-body${spec.keepTables ? " keep" : ""}">${body}</main></body></html>`;
}

async function pdfOf(browser, html, out) {
  const p = await browser.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.emulateMedia({ media: "print" });
  await p.pdf({ path: out, format: "Letter", printBackground: true, preferCSSPageSize: true });
  await p.close();
}

const wanted = process.argv.slice(2);
const browser = await chromium.launch();
for (const spec of DOCUMENTS.filter((d) => wanted.length === 0 || wanted.includes(d.name))) {
  const source = fs.readFileSync(path.join(HERE, "docs", `${spec.name}.md`), "utf8");
  const { html, toc } = render(source, { figure: figureFinder(spec.folder) });
  const out = path.join(spec.outRoot ?? ROOT, spec.folder, `${spec.file}.pdf`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const temp = path.join(HERE, `.pass1-${spec.name}.pdf`);
  await pdfOf(browser, page(spec, html, toc, null), temp);
  const listFile = path.join(HERE, `.toc-${spec.name}.json`);
  fs.writeFileSync(listFile, JSON.stringify(toc));
  const pages = JSON.parse(execFileSync(PYTHON, [path.join(HERE, "find_pages.py"), temp, listFile], { encoding: "utf8" }));
  fs.rmSync(temp); fs.rmSync(listFile);
  const missing = toc.filter((h) => !pages[h.id]);
  if (missing.length) console.warn(`  ${spec.name}: no page found for ${missing.map((h) => h.number).join(", ")}`);
  await pdfOf(browser, page(spec, html, toc, pages), out);
  execFileSync(PYTHON, [path.join(HERE, "compact_pdf.py"), out], { stdio: "ignore" });
  console.log(`built ${path.relative(ROOT, out)}`);
}
await browser.close();
