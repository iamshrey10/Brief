import { COLOR as C, arrow, box, legend, svg, text, title } from "./kit.mjs";

/** The AI workflow: three paths where a model is used, with the model calls marked apart from ordinary code. */
export function aiWorkflow() {
  const ai = C.ai;
  const rule = C.api;
  const local = C.data;
  const data = C.person;
  const W = 222;
  const STEP = 246;
  const lane = (y, label) => text(30, y, label, { size: 24, weight: "bold", family: '"Times New Roman", serif', fill: "#25252b" });
  const row = (y, items, h) => items.map((it, i) => box({ x: 30 + i * STEP, y, w: W, h, size: 16, titleSize: 19, ...it }));
  const links = (y, n, h) => Array.from({ length: n - 1 }, (_, i) => arrow({ pts: [[30 + i * STEP + W, y + h / 2], [30 + (i + 1) * STEP, y + h / 2]], color: "#1b1b1f" })).join("");
  const parts = [
    title("Brief: AI workflow", "The three places a model is used, and the ordinary code around each one."),
    lane(126, "1  Reading a document"),
    ...row(142, [
      { title: "The file", lines: ["A PDF, a scan, or", "up to 5 photos"], color: data },
      { title: "Get the text", lines: ["PDF text: PyMuPDF.", "Scans and photos:", "Tesseract OCR."], color: local },
      { title: "Split into clauses", lines: ["Rule-based: numbered", "paragraphs (1., (a),", "Section 2). Else chunks."], color: rule, titleSize: 18 },
      { title: "Embed the clauses", lines: ["gemini-embedding-001,", "768 numbers each,", "sent in batches"], color: ai, titleSize: 18 },
      { title: "Save", lines: ["Clauses and vectors in", "Postgres (pgvector),", "with a full-text index"], color: data },
    ], 126),
    links(142, 5, 126),
    lane(352, "2  Asking a question"),
    ...row(368, [
      { title: "The question", lines: ["Up to 1,000", "characters"], color: data },
      { title: "Embed it", lines: ["The same embedding", "model, so meanings", "can be compared"], color: ai },
      { title: "Search two ways", lines: ["Words: Postgres", "full-text. Meaning:", "pgvector. Merged by", "rank. Top 8 clauses."], color: rule },
      { title: "Ask the model", lines: ["gemini-3.5-flash-lite,", "temperature 0. Returns", "an answer and quotes."], color: ai },
      { title: "Check every quote", lines: ["Rule-based: each quote", "must be in its clause,", "word for word, or it", "is dropped."], color: rule },
      { title: "Show", lines: ["The answer with its", "source, or: the", "document does not", "seem to cover it."], color: data },
    ], 152),
    links(368, 6, 152),
    lane(580, "3  Key terms, and the questions to ask before signing"),
    ...row(596, [
      { title: "All the clauses", lines: ["The clauses of the", "document, up to the", "prompt limit"], color: data },
      { title: "Read 3 times", lines: ["Same model, temperature", "0, seeds 1, 2 and 3.", "A fixed list of fields", "or questions."], color: ai },
      { title: "Check each read", lines: ["Rule-based: quotes in", "the clause, and every", "number in the quotes.", "Else: not mentioned."], color: rule },
      { title: "Keep by vote", lines: ["Rule-based: a term", "stays only if more than", "half of the reads", "found it."], color: rule },
      { title: "A judge looks", lines: ["Questions only. A", "separate call sees each", "answer alone: two looks,", "a third if they differ."], color: ai },
      { title: "Save and show", lines: ["Saved once, so opening", "it again is free and", "gives the same answers."], color: data, titleSize: 18 },
    ], 152),
    links(596, 6, 152),
    text(30, 800, "Around all three: every model call goes through one gate that limits how many run at once, retries a refusal within a time limit,", { size: 17, fill: "#3a3a42" }),
    text(30, 824, "and counts toward a daily cap for the whole site.", { size: 17, fill: "#3a3a42" }),
    text(30, 860, "Not in Brief: tool calling, an agent loop, fine-tuning, or a model that is allowed to act. The reranker (FlashRank) exists but is off by default.", { size: 17, fill: "#3a3a42", weight: "bold" }),
    legend([
      { color: ai, label: "A call to Google's Gemini model" },
      { color: rule, label: "Rule-based code, no model" },
      { color: local, label: "Local software that is not a language model (OCR)" },
      { color: data, label: "Data in or out" },
    ], 30, 920),
  ];
  return svg(parts.join(""), { height: 1060 });
}
