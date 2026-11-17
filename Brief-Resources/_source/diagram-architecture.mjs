import { COLOR as C, arrow, box, legend, stack, svg, text, title, zone } from "./kit.mjs";

/** The final system architecture: what runs where and how the parts talk. Everything drawn here is in the code or in the live deployment. */
export function architecture() {
  const web = stack({
    x: 280, y: 332, w: 390,
    items: [
      { title: "Pages and screens", lines: ["Next.js 16, React 19, Tailwind 4", "Landing, Dashboard, Documents,", "Shared, Profile, Admin"], color: C.web },
      { title: "Sign in and session", lines: ["Auth.js, Google only", "proxy.ts guards /dashboard and", "checks the two-step cookie"], color: C.web },
      { title: "Backend routes /api/backend/*", lines: ["The browser's only door to the API", "Checks the session and the rate limit", "(120 a minute per person), adds a request", "id, signs a token that lasts 60 seconds"], color: C.web },
      { title: "Website health", lines: ["/api/health answers 200 only if Redis does"], color: C.web },
    ],
  });
  const api = stack({
    x: 770, y: 332, w: 390,
    items: [
      { title: "Routes and token check", lines: ["FastAPI, Python 3.12, 47 documented routes", "Accepts only the 60 second token", "Every query is scoped to that person"], color: C.api },
      { title: "Reading a document", lines: ["A background task: PDF text, or OCR for", "scans and photos, split into clauses, then", "meaning vectors in batches. One document", "at a time for each person."], color: C.api, chip: "uses AI" },
      { title: "Answers and key terms", lines: ["Search by words and by meaning, then ask", "the model. Every quote is checked word for", "word before it is shown. Key terms and the", "questions to ask are read 3 times, kept by vote."], color: C.api, chip: "uses AI" },
      { title: "Rules and limits", lines: ["Daily limits, a site-wide daily cap,", "sharing, two-step sign in, admin counts,", "clean-up of old files and traces"], color: C.api },
    ],
  });
  const zoneBottom = Math.max(web.bottom, api.bottom) + 22;
  const tier = zoneBottom + 56;
  const zoneH = zoneBottom - 292;
  const [pages, signin, routes, health] = web.placed;
  const [aroutes, reading, answers] = api.placed;

  const keyTop = answers.y + answers.h + 60;
  const parts = [
    title("Brief: final system architecture", "What runs where, and how the parts talk. Every box exists in the code or in the live deployment."),
    box({ x: 30, y: 118, w: 170, h: 104, title: "A person", lines: ["Phone or laptop"], color: C.person }),
    box({ x: 260, y: 118, w: 330, h: 104, title: "Browser", lines: ["Runs the pages", "Sends a file straight to storage"], color: C.person }),
    box({ x: 625, y: 118, w: 275, h: 104, title: "Google sign-in", lines: ["accounts.google.com", "Tells Brief who signed in"], color: C.ext }),
    box({ x: 935, y: 118, w: 265, h: 104, title: "Google Analytics", lines: ["First page only,", "and only after a yes"], color: C.ext }),
    box({ x: 1240, y: 118, w: 230, h: 104, title: "UptimeRobot", lines: ["Checks the site and", "the API every 5 min"], color: C.mon }),
    zone({ x: 260, y: 292, w: 430, h: zoneH, label: "Vercel: the website", color: C.web }),
    web.svg,
    zone({ x: 750, y: 292, w: 430, h: zoneH, label: "Render: the API (Docker)", color: C.api }),
    api.svg,
    box({ x: 1240, y: 332, w: 230, h: answers.y + answers.h - 332, title: "Google Gemini API", lines: ["gemini-3.5-flash-lite:", "answers, key terms,", "questions, the judge", "", "gemini-embedding-001:", "768-number vectors for", "clauses and questions"], color: C.ai, titleSize: 19 }),
    box({ x: 30, y: 292, w: 200, h: 170, title: "Cloudflare R2", lines: ["Private bucket:", "the uploaded files.", "Browser PUT by a", "5 minute link."], color: C.data }),
    box({ x: 260, y: tier, w: 430, h: 100, title: "Upstash Redis", lines: ["Short counters, with the email,", "for the per-person rate limit"], color: C.data }),
    box({ x: 750, y: tier, w: 430, h: 100, title: "Neon Postgres + pgvector", lines: ["14 tables: people, documents, clauses, vectors,", "key terms, answer traces (ids only), counts"], color: C.data }),

    arrow({ pts: [[200, 170], [260, 170]], n: "1", nAt: [230, 148] }),
    arrow({ pts: [[540, 222], [540, 292]], n: "2", nAt: [540, 244] }),
    arrow({ pts: [[590, 170], [625, 170]], n: "3", nAt: [607, 148] }),
    arrow({ pts: [[660, 222], [660, 292]], color: C.ext, n: "4", nAt: [660, 244] }),
    arrow({ pts: [[300, 118], [300, 94], [1067, 94], [1067, 118]], color: C.ext, dashed: true, label: "visit counts, only after a yes", at: [690, 94], n: "5", nAt: [300, 104] }),
    arrow({ pts: [[300, 222], [300, 258], [130, 258], [130, 292]], color: C.data, dashed: true, n: "6", nAt: [300, 240] }),
    arrow({ pts: [[475, zoneBottom], [475, tier]], color: C.data, n: "7", nAt: [475, zoneBottom + 14] }),
    arrow({ pts: [[670, routes.cy], [770, routes.cy]], color: C.web, label: "signed token", at: [720, routes.cy + 40], n: "8", nAt: [720, routes.cy - 22] }),
    arrow({ pts: [[965, zoneBottom], [965, tier]], color: C.data, n: "9", nAt: [965, zoneBottom + 14] }),
    arrow({ pts: [[1160, reading.cy], [1240, reading.cy]], color: C.ai, n: "10", nAt: [1200, reading.cy - 22] }),
    arrow({ pts: [[1160, answers.cy], [1240, answers.cy]], color: C.ai }),
    arrow({ pts: [[880, zoneBottom], [880, zoneBottom + 28], [130, zoneBottom + 28], [130, 462]], color: C.data, dashed: true, label: "read, delete, make the upload link", at: [300, zoneBottom + 28], n: "11", nAt: [880, zoneBottom + 14] }),
    arrow({ pts: [[1355, 222], [1355, 256], [610, 256], [610, 292]], color: C.mon, dashed: true, n: "12", nAt: [1355, 238] }),
    arrow({ pts: [[1100, 256], [1100, 292]], color: C.mon, dashed: true }),

    legend(
      [
        { color: "#1b1b1f", line: true, label: "A request or a call" },
        { color: "#1b1b1f", line: true, dashed: true, label: "A file or a check" },
        { color: C.ai, label: "Google's AI model" },
        { color: C.data, label: "Where data is kept" },
      ],
      1240, keyTop,
    ),
    ...[
      "1 A person uses the browser",
      "2 Pages and calls over https",
      "3 Sign in with Google",
      "4 Google tells the site who it is",
      "5 Visit counts, after a yes",
      "6 The file goes straight to storage",
      "7 Per-person rate counter",
      "8 Signed token, 60 seconds",
      "9 Database queries",
      "10 Calls to the model",
      "11 The API reads and deletes files",
      "12 Uptime checks, every 5 minutes",
    ].map((l, i) => text(1240, keyTop + 140 + i * 22, l, { size: 15, fill: "#3a3a42" })),
  ];
  return svg(parts.join(""), { height: Math.max(tier + 130, keyTop + 140 + 12 * 22 + 20) });
}
