// Draws every diagram to a PNG (3000 pixels wide) in the folder the documents expect.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "../../web/node_modules/@playwright/test/index.mjs";
import { architecture } from "./diagram-architecture.mjs";
import { stack } from "./diagram-stack.mjs";
import { designFlow } from "./diagram-flow.mjs";
import { dataFlow } from "./diagram-data.mjs";
import { cicd } from "./diagram-cicd.mjs";
import { aiWorkflow } from "./diagram-ai.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ALL = [
  { name: "architecture", folder: "06-System-Architecture", file: "Brief-Final-System-Architecture.png", make: architecture },
  { name: "stack", folder: "05-Technology-Stack", file: "Brief-Technology-Stack-Diagram.png", make: stack },
  { name: "flow", folder: "07-System-Design", file: "Brief-System-Design-Flow.png", make: designFlow },
  { name: "data", folder: "07-System-Design", file: "Brief-Data-Flow-Diagram.png", make: dataFlow },
  { name: "cicd", folder: "08-CI-CD", file: "Brief-CI-CD-Pipeline.png", make: cicd },
  { name: "ai", folder: "09-AI-and-LLM", file: "Brief-AI-Workflow-Diagram.png", make: aiWorkflow },
];
const wanted = process.argv.slice(2);
const browser = await chromium.launch();
for (const d of ALL.filter((x) => wanted.length === 0 || wanted.includes(x.name))) {
  const svg = d.make();
  const height = Number(/viewBox="0 0 \d+ (\d+)"/.exec(svg)[1]);
  const page = await browser.newPage({ viewport: { width: 1500, height }, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const out = path.join(ROOT, d.folder, d.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1500, height } });
  await page.close();
  console.log("drew", path.relative(ROOT, out));
}
await browser.close();
