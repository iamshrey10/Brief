import { COLOR as C, arrow, svg, text, tint, title, zone } from "./kit.mjs";

/** A row of small labelled chips that wraps inside a band. Returns the drawing and the height used. */
function chips(items, { x, y, w, color, size = 16.5 }) {
  let cx = x;
  let cy = y;
  const out = [];
  for (const label of items) {
    const cw = label.length * size * 0.52 + 24;
    if (cx + cw > x + w) { cx = x; cy += 40; }
    out.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="33" rx="16.5" fill="${tint(color)}" stroke="${color}" stroke-width="1.8"/>${text(cx + cw / 2, cy + 22.5, label, { size, anchor: "middle" })}`);
    cx += cw + 9;
  }
  return { svg: out.join(""), height: cy + 33 - y };
}

/** One layer: a dashed zone with its groups of chips. Returns the drawing and its height. */
function band({ label, color, groups }, x, y, w) {
  const inner = [];
  let cy = y + 34;
  for (const [name, items] of groups) {
    inner.push(text(x + 18, cy + 14, name, { size: 16.5, weight: "bold", fill: color }));
    const c = chips(items, { x: x + 18, y: cy + 24, w: w - 36, color });
    inner.push(c.svg);
    cy += 24 + c.height + 14;
  }
  const h = cy - y - 2;
  return { svg: zone({ x, y, w, h, label, color }) + inner.join(""), h };
}

/** The technology stack: what Brief is made of, in layers, from the browser down to the tools that build and ship it. */
export function stack() {
  const browser = band({ label: "In the browser", color: C.person, groups: [["Seen by the person", ["HTML, CSS, JavaScript", "React 19 (runs in the page)", "Google Analytics tag (first page, after a yes)"]]] }, 20, 130, 700);
  const web = band({ label: "The website: web/  (on Vercel)", color: C.web, groups: [
    ["Framework", ["Next.js 16.4.6", "React 19.2.8", "TypeScript 5", "App Router"]],
    ["Look and motion", ["Tailwind CSS 4", "tw-animate-css", "shadcn tokens", "class-variance-authority", "@base-ui/react (Button)", "next-themes", "lucide-react", "Geist, Fraunces fonts"]],
    ["Sign in, tokens, limits", ["Auth.js (next-auth 5 beta)", "jose (60 second tokens)", "ioredis (rate limit)", "qrcode (two-step setup)"]],
  ] }, 20, browser.h + 130 + 56, 700);
  const apiY = browser.h + 130 + 56;
  const api = band({ label: "The API: api/  (Docker, on Render)", color: C.api, groups: [
    ["Framework and data", ["Python 3.12", "FastAPI 0.143", "Uvicorn", "SQLAlchemy 2 (async)", "asyncpg", "Alembic", "pgvector", "pydantic-settings"]],
    ["Security and storage", ["PyJWT (HS256)", "cryptography (Fernet)", "boto3 (R2)"]],
    ["Reading documents", ["PyMuPDF", "Tesseract + pytesseract", "OpenCV (headless)", "pillow-heif", "FlashRank (off by default)"]],
    ["AI", ["google-genai (Gemini client)"]],
  ] }, 780, apiY, 700);
  const services = band({ label: "Services Brief talks to", color: C.data, groups: [["Data and AI", ["Neon: Postgres + pgvector", "Upstash: Redis", "Cloudflare R2: files", "Google Gemini API", "Google sign-in (OAuth)", "Google Analytics"]]] }, 780, apiY + api.h + 56, 700);
  const leftEnd = apiY + web.h;
  const rightEnd = apiY + api.h + 56 + services.h;
  const buildY = Math.max(leftEnd, rightEnd) + 50;
  const build = band({ label: "Building, testing and shipping", color: C.ci, groups: [
    ["Code and delivery", ["GitHub", "GitHub Actions", "Docker", "Vercel", "Render", "UptimeRobot"]],
    ["Tools", ["pnpm 12.4.2", "Node 22", "pip", "pre-commit hooks", "ESLint", "ruff"]],
    ["Tests and audits", ["Vitest", "Testing Library", "Playwright + axe", "pytest + coverage", "pnpm audit", "pip-audit"]],
  ] }, 20, buildY, 1460);
  const parts = [
    title("Brief: technology stack", "What each layer is made of. Every name here is used in the code, the build, or the live deployment."),
    browser.svg, web.svg, api.svg, services.svg, build.svg,
    arrow({ pts: [[600, 130 + browser.h], [600, apiY]], both: true, label: "https", at: [590, 130 + browser.h + 28], anchor: "end" }),
    arrow({ pts: [[720, apiY + 120], [780, apiY + 120]], color: C.web, both: true }),
    text(750, apiY + 100, "token", { size: 15, anchor: "middle", fill: "#2b2b31" }),
    arrow({ pts: [[1130, apiY + api.h], [1130, apiY + api.h + 56]], both: true, color: C.data, label: "SQL, files, model calls", at: [1120, apiY + api.h + 28], anchor: "end" }),
  ];
  return svg(parts.join(""), { height: buildY + build.h + 20 });
}
