// Renders samples/sample-lease.html into public/samples/sample-lease.pdf, the made up lease behind
// "Try a sample lease". Run from web/ after changing the HTML:  node samples/make-sample-pdf.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const html = fileURLToPath(new URL("./sample-lease.html", import.meta.url));
const pdf = fileURLToPath(new URL("../public/samples/sample-lease.pdf", import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${html}`);
await page.pdf({ path: pdf, format: "Letter", margin: { top: "0.9in", bottom: "0.9in", left: "1in", right: "1in" } });
await browser.close();
console.log(`wrote ${pdf}`);
