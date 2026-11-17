import { COLOR as C, arrow, box, legend, stack, svg, text, title, zone } from "./kit.mjs";

/** The data flow: what kind of data moves between the parts, and which store keeps it. */
export function dataFlow() {
  const api = stack({
    x: 780, y: 188, w: 370, gap: 14,
    items: [
      { title: "Read a document", lines: ["File bytes in, text out", "Clauses with page and place", "Meaning vectors from the model"], color: C.api, chip: "AI" },
      { title: "Answer a question", lines: ["Question in, top 8 clauses", "One answer with quotes out,", "each quote checked"], color: C.api, chip: "AI" },
      { title: "Key terms and questions", lines: ["All clauses in, terms with", "quotes out, kept by vote,", "a judge checks each answer"], color: C.api, chip: "AI" },
      { title: "Limits, sharing, counts", lines: ["Counts per day and kind", "Shares (link and code kept", "only as hashes)", "Visit counts, no content"], color: C.api },
    ],
  });
  const [read, answer, key] = api.placed;
  const zoneBottom = api.bottom + 24;
  const neonY = zoneBottom + 70;
  const geminiTop = 306;
  const parts = [
    title("Brief: data flow", "What travels between the parts, and where each kind of data is kept."),
    box({ x: 30, y: 330, w: 250, h: 150, title: "Browser", lines: ["Holds the pages, the session", "cookie, and the person's", "choices in this tab"], color: C.person }),
    zone({ x: 350, y: 292, w: 330, h: 290, label: "Website routes", color: C.web }),
    box({ x: 370, y: 332, w: 290, h: 220, title: "/api/backend/*", lines: ["1 Checks the session", "2 Counts the request", "3 Adds a request id", "4 Signs a 60 second token", "5 Forwards, and returns the", "answer with the same id"], color: C.web }),
    zone({ x: 760, y: 150, w: 410, h: zoneBottom - 150, label: "The API", color: C.api }),
    api.svg,
    box({ x: 1240, y: 150, w: 230, h: 126, title: "Cloudflare R2", lines: ["The uploaded files", "(private bucket)"], color: C.data }),
    box({ x: 1240, y: geminiTop, w: 230, h: key.y + key.h - geminiTop, title: "Google Gemini", lines: ["Receives clause text and", "the question, as text.", "Returns vectors and", "structured answers.", "Never receives the file."], color: C.ai }),
    box({ x: 780, y: neonY, w: 370, h: 130, title: "Neon Postgres + pgvector", lines: ["people, documents, clauses, vectors,", "key terms, saved answers, traces (ids", "only), shares, two-step, counts"], color: C.data }),
    box({ x: 350, y: 640, w: 330, h: 110, title: "Upstash Redis", lines: ["The email and a request", "count, for about a minute"], color: C.data }),
    box({ x: 30, y: 600, w: 250, h: 120, title: "Google sign-in", lines: ["Receives the sign-in", "Returns who the person is"], color: C.ext }),
    box({ x: 30, y: 760, w: 250, h: 100, title: "Google Analytics", lines: ["Page visits, first page", "only, after a yes"], color: C.ext }),
    arrow({ pts: [[280, 405], [350, 405]], n: "1", nAt: [315, 383] }),
    arrow({ pts: [[660, answer.cy], [760, answer.cy]], color: C.web, n: "2", nAt: [710, answer.cy - 22], label: "token", at: [710, answer.cy + 24] }),
    arrow({ pts: [[135, 330], [135, 100], [1355, 100], [1355, 150]], color: C.data, dashed: true, label: "the file itself, by a 5 minute link", at: [740, 100], n: "3", nAt: [135, 130] }),
    arrow({ pts: [[515, 552], [515, 640]], color: C.data, n: "4", nAt: [515, 596], label: "email, count", at: [600, 596] }),
    arrow({ pts: [[1150, 215], [1240, 215]], color: C.data, dashed: true, n: "5", nAt: [1195, 193] }),
    arrow({ pts: [[1150, geminiTop + 36], [1240, geminiTop + 36]], color: C.ai, n: "6", nAt: [1195, geminiTop + 14] }),
    arrow({ pts: [[1150, answer.cy], [1240, answer.cy]], color: C.ai }),
    arrow({ pts: [[1150, key.cy], [1240, key.cy]], color: C.ai }),
    arrow({ pts: [[965, zoneBottom], [965, neonY]], color: C.data, both: true, n: "7", nAt: [965, zoneBottom + 22], label: "clauses, vectors, key terms, answers, counts, shares", at: [985, zoneBottom + 36], anchor: "start", labelSize: 15 }),
    arrow({ pts: [[135, 600], [135, 480]], color: C.ext, both: true, n: "8", nAt: [135, 540] }),
    arrow({ pts: [[135, 760], [135, 720]], color: C.ext, dashed: true, n: "9", nAt: [190, 740] }),
    legend([
      { color: "#1b1b1f", line: true, label: "Data in motion" },
      { color: "#1b1b1f", line: true, dashed: true, label: "A file, or a side path" },
      { color: C.ai, label: "Sent to Google's model" },
      { color: C.data, label: "Where data is kept" },
    ], 380, 860),
    ...[
      "1 Requests, questions, choices, the cookie",
      "2 The request and a 60 second signed token",
      "3 The file, straight to storage",
      "4 The email and a counter, kept a minute",
      "5 The API reads and deletes the file",
      "6 Clause text and the question out, answers back",
      "7 Everything Brief keeps about a document",
      "8 Sign in, and who the person is",
      "9 Page visits, after a yes",
    ].map((l, i) => text(380, 1010 + i * 22, l, { size: 15, fill: "#3a3a42" })),
  ];
  return svg(parts.join(""), { height: Math.max(neonY + 170, 1230) });
}
