import { COLOR as C, svg, text, title } from "./kit.mjs";

/** The system design flow: from the person's first action to the result, with what the website, the API and the data do at each step. */
export function designFlow() {
  const steps = [
    { head: "1  Sign in", color: C.web,
      person: ["Presses Sign in", "with Google"],
      site: ["Auth.js sends them to", "Google, then sets a", "session cookie"],
      api: ["On the first call it", "makes the person's", "row (their email)"],
      data: ["users"], ai: ["No"] },
    { head: "2  Add a document", color: C.web,
      person: ["Picks a PDF, or up to", "5 photos, and says", "what kind it is"],
      site: ["Checks the type and", "size, asks the API for", "an upload link"],
      api: ["Checks the limits, saves", "a pending row, makes a", "5 minute link, then checks", "the real size and type"],
      data: ["documents", "R2: the file"], ai: ["No", "rules only"] },
    { head: "3  Brief reads it", color: C.api,
      person: ["Watches the progress", "line"],
      site: ["Asks for the list every", "5 seconds"],
      api: ["Background task: text or", "OCR, numbered clauses,", "meaning vectors in", "batches, one at a time"],
      data: ["clauses", "embeddings"], ai: ["Yes", "embedding model"] },
    { head: "4  The overview", color: C.api,
      person: ["Opens the document"],
      site: ["Loads the key terms", "and the questions to", "ask before signing"],
      api: ["Reads 3 times, checks", "every quote and number,", "keeps by vote, then a", "judge call. Saved after."],
      data: ["extractions", "checklist_answers", "usage"], ai: ["Yes", "answer model and", "judge, read 3 times"] },
    { head: "5  Ask a question", color: C.api,
      person: ["Types a question"],
      site: ["Sends it through the", "proxy route"],
      api: ["Searches by words and", "meaning, asks the model,", "checks each quote, or", "says it is not covered"],
      data: ["clauses, embeddings", "answer_traces", "(ids only), usage"], ai: ["Yes", "embedding and", "answer model"] },
    { head: "6  Take it away", color: C.data,
      person: ["Copies or downloads", "the summary, adds dates", "to a calendar, shares"],
      site: ["Builds the PDF and the", "calendar file in the", "browser"],
      api: ["Sharing: a link and a", "code, approval, a time", "limit. Delete goes to a", "7 day Bin."],
      data: ["dashboard_shares", "documents"], ai: ["No"] },
  ];
  const x0 = 190;
  const cw = 215;
  const lanes = [
    { key: "person", label: "The person", h: 108 },
    { key: "site", label: "The website", h: 108 },
    { key: "api", label: "The API", h: 138 },
    { key: "data", label: "Data touched", h: 100 },
    { key: "ai", label: "Is AI used?", h: 100 },
  ];
  const parts = [title("Brief: system design flow", "From a person's first action to the result. Purple marks where Google's AI model is called.")];
  // step heads as arrows
  steps.forEach((s, i) => {
    const x = x0 + i * cw;
    parts.push(`<path d="M${x} 112 h${cw - 22} l22 28 l-22 28 h-${cw - 22} l22 -28 z" fill="${s.color}"/>${text(x + 32, 148, s.head, { size: 19, weight: "bold", fill: "#fff" })}`);
  });
  let y = 196;
  lanes.forEach((lane, li) => {
    parts.push(`<rect x="20" y="${y}" width="160" height="${lane.h}" rx="8" fill="#25252b"/>${text(100, y + lane.h / 2 + 6, lane.label, { size: 18, weight: "bold", fill: "#fff", anchor: "middle" })}`);
    steps.forEach((s, i) => {
      const x = x0 + i * cw;
      const lines = s[lane.key];
      const isAi = lane.key === "ai";
      const yes = isAi && lines[0] === "Yes";
      const fill = isAi ? (yes ? "#f5eafd" : "#f4f4f5") : li % 2 ? "#f7f6f2" : "#fbfaf8";
      const stroke = isAi ? (yes ? C.ai : "#cfcfd4") : "#d9d6cf";
      parts.push(`<rect x="${x + 2}" y="${y}" width="${cw - 8}" height="${lane.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${yes ? 2.2 : 1.4}"/>`);
      lines.forEach((l, k) => parts.push(text(x + 14, y + 28 + k * 22, l, { size: 16.5, weight: isAi && k === 0 ? "bold" : "normal", fill: yes && k === 0 ? C.ai : "#1b1b1f" })));
    });
    y += lane.h + 8;
  });
  parts.push(text(20, y + 26, "A failed step shows a plain message and a short reference code. An answer or a key term is shown only when a quote from the document backs it.", { size: 17, fill: "#3a3a42", italic: true }));
  return svg(parts.join(""), { height: y + 50 });
}
