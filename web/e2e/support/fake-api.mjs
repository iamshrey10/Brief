// A stand-in for the Brief API, only for the browser tests. It answers with realistic data, refuses a
// call that carries no token, remembers deletes until it is reset, and records the request ids it was
// sent so a test can check the website forwarded them. Run: node e2e/support/fake-api.mjs
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_API_PORT ?? 3101);
// The secret the website signs its tokens with, shared with it the way the real API shares one.
const SECRET = process.env.FAKE_API_SECRET ?? "e2e-only-service-secret-0123456789abcdef";

/**
 * Who a token says is asking, or null when it should be refused: not three parts, not HS256, not signed with the
 * shared secret, or expired. The same checks the real API makes, so a test of the website also proves the website
 * sends a valid token.
 */
function readerFrom(header) {
  const bearer = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(header ?? "");
  if (!bearer) return null;
  const [, head, body, signature] = bearer;
  try {
    if (JSON.parse(Buffer.from(head, "base64url").toString()).alg !== "HS256") return null;
    const expected = createHmac("sha256", SECRET).update(`${head}.${body}`).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

const CLAUSES = [
  { id: "c-deposit", clause_index: 0, page_number: 1, text: "Tenant shall pay a security deposit of $1,450.00 at signing." },
  { id: "c-refund", clause_index: 1, page_number: 2, text: "The deposit is refundable within 30 days after move-out, less any lawful deductions." },
  { id: "c-late", clause_index: 2, page_number: 2, text: "Rent is due on the first of the month. A late fee of $50 applies after the fifth day." },
];

const fresh = () => ({
  documents: [
    { id: "doc-lease", filename: "sample-lease.pdf", doc_type: "lease", status: "ready", ocr_confidence: null, created_at: "2026-10-01T12:00:00Z", status_changed_at: "2026-10-01T12:01:00Z" },
    { id: "doc-loan", filename: "sample-loan.pdf", doc_type: "loan", status: "ready", ocr_confidence: null, created_at: "2026-10-02T12:00:00Z", status_changed_at: "2026-10-02T12:01:00Z" },
  ],
  requests: [],
  uploads: [],
  flakyServed: [],
  accountDeleted: false,
  created: 0,
});
let state = fresh();

const KEY_TERMS = {
  terms: [
    {
      name: "security_deposit",
      label: "Security deposit",
      found: true,
      value: "$1,450.00, refundable within 30 days after move-out",
      clause_id: "c-refund",
      page_number: 2,
      quote: CLAUSES[1].text,
      evidence: [
        { clause_id: "c-refund", page_number: 2, quote: CLAUSES[1].text },
        { clause_id: "c-deposit", page_number: 1, quote: CLAUSES[0].text },
      ],
    },
    { name: "late_fee", label: "Late fee", found: true, value: "$50 after the fifth day", clause_id: "c-late", page_number: 2, quote: CLAUSES[2].text, evidence: [{ clause_id: "c-late", page_number: 2, quote: CLAUSES[2].text }] },
    { name: "pet_policy", label: "Pet policy", found: false, value: null, clause_id: null, page_number: null, quote: null, evidence: [] },
  ],
  truncated: false,
};

const CHECKLIST = {
  answers: [
    {
      id: "deposit", question: "How much is the deposit and when do I get it back?", why_it_matters: "Deposits are the most common thing people lose money on.",
      importance: "high", status: "answered", answer: "$1,450.00, refundable within 30 days after move-out.",
      evidence: [{ clause_id: "c-deposit", page_number: 1, quote: "security deposit of $1,450.00" }], gap: false, ask_them: null,
    },
    {
      id: "renewal", question: "Does it renew by itself, and how much notice is needed to stop it?", why_it_matters: "An automatic renewal can run for another full term if you miss the window.",
      importance: "high", status: "not_mentioned", answer: null, evidence: [], gap: true, ask_them: "Does this renew automatically, and by what date must I cancel?",
    },
  ],
  truncated: false,
};

const USAGE = { ask: { used: 3, limit: 100, left: 97 }, read: { used: 1, limit: 30, left: 29 }, analyze: { used: 2, limit: 60, left: 58 } };

// A reader whose address starts with one of these has used up all or most of today's questions, so a test
// can see the note and the refusal without asking a hundred questions.
function usageFor(reader) {
  if (reader.startsWith("low-quota-")) return { ...USAGE, ask: { used: 98, limit: 100, left: 2 } };
  if (reader.startsWith("no-quota-")) return { ...USAGE, ask: { used: 100, limit: 100, left: 0 } };
  return USAGE;
}

// The same rule the real bucket gets from scripts/set_bucket_cors.py: only the website's own address may PUT a file
// with a Content-Type. Anything else is not given permission, so the browser refuses to send the file.
const WEBSITE = process.env.FAKE_API_WEBSITE ?? "http://localhost:3100";

function allowWebsite(request, response) {
  if (request.headers.origin !== WEBSITE) return false;
  response.setHeader("Access-Control-Allow-Origin", WEBSITE);
  response.setHeader("Vary", "Origin");
  return true;
}

// What the API shows of a document: everything except the fake's own bookkeeping.
function visible(document) {
  const shown = { ...document };
  delete shown.looksLeft;
  return shown;
}

const DOC_TYPES = new Set(["loan", "lease", "offer", "other"]);

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    return {};
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = request.method ?? "GET";

  if (path === "/health") return send(response, 200, { status: "ok" });
  if (path === "/__reset" && method === "POST") {
    state = fresh();
    return send(response, 204);
  }
  if (path === "/__requests") return send(response, 200, state.requests);
  if (path === "/__seed-failed" && method === "POST") {
    state.documents.push({ id: "doc-broken", filename: "broken-scan.pdf", doc_type: "other", status: "failed", failure_reason: "no_text", ocr_confidence: null, created_at: "2026-10-03T12:00:00Z", status_changed_at: "2026-10-03T12:01:00Z" });
    return send(response, 204);
  }
  if (path === "/__seed-document" && method === "POST") {
    const seeded = await readJson(request);
    state.documents.push({ ocr_confidence: null, created_at: "2026-10-04T12:00:00Z", status_changed_at: "2026-10-04T12:01:00Z", ...seeded });
    return send(response, 204);
  }
  if (path === "/__account-deleted") return send(response, 200, { deleted: state.accountDeleted });

  // Where a browser sends the file itself: storage, not the API, so it needs no token but does need permission.
  const upload = /^\/__upload\/([^/]+)$/.exec(path);
  if (upload) {
    if (method === "OPTIONS") {
      const wanted = String(request.headers["access-control-request-headers"] ?? "").toLowerCase();
      if (!allowWebsite(request, response) || request.headers["access-control-request-method"] !== "PUT" || !wanted.includes("content-type")) {
        response.writeHead(403);
        return response.end();
      }
      response.setHeader("Access-Control-Allow-Methods", "PUT");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Max-Age", "3600");
      response.writeHead(204);
      return response.end();
    }
    if (method === "PUT") {
      allowWebsite(request, response);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      if (upload[1] === "broken") return send(response, 500, { detail: "storage is unavailable" });
      state.uploads.push({ id: upload[1], contentType: request.headers["content-type"] ?? null, bytes: Buffer.concat(chunks).length });
      return send(response, 200);
    }
  }
  if (path === "/__uploads") return send(response, 200, state.uploads);

  // Like the real API, nothing else is answered without a signed token.
  const reader = readerFrom(request.headers.authorization);
  if (!reader) return send(response, 401, { detail: "not signed in" });
  state.requests.push({ method, path, requestId: request.headers["x-request-id"] ?? null });

  if (method === "GET" && path === "/documents") {
    // A document being read finishes after one more look, as a real one does while the page polls.
    for (const document of state.documents) {
      if (document.status === "processing" && document.looksLeft-- <= 0) {
        document.status = "ready";
        document.progress_done = document.progress_total = null;
      }
    }
    return send(response, 200, state.documents.map(visible));
  }
  if (method === "POST" && path === "/documents") {
    const { filename = "", doc_type: kind = "", content_type: contentType = "", file_size_bytes: size = 0 } = await readJson(request);
    if (!DOC_TYPES.has(kind) || !contentType || size <= 0) return send(response, 400, { detail: "unsupported file type" });
    if (/limit/i.test(filename)) return send(response, 409, { detail: "You can keep up to 25 documents. Delete one you no longer need to upload another." });
    if (/daily/i.test(filename)) return send(response, 429, { detail: "You have reached today's limit of 30 document reads. Try again tomorrow." });
    state.created += 1;
    const id = `doc-new-${state.created}`;
    state.documents.unshift({ id, filename, doc_type: kind, status: "pending", ocr_confidence: null, created_at: new Date().toISOString(), status_changed_at: new Date().toISOString() });
    const target = /storagefail/i.test(filename) ? "broken" : id;
    return send(response, 200, { document_id: id, upload_url: `http://localhost:${PORT}/__upload/${target}` });
  }
  const confirm = /^\/documents\/([^/]+)\/confirm$/.exec(path);
  if (method === "PATCH" && confirm) {
    const document = state.documents.find((candidate) => candidate.id === confirm[1]);
    if (!document) return send(response, 404, { detail: "document not found" });
    Object.assign(document, { status: "processing", progress_done: 3, progress_total: 10, looksLeft: 1 });
    return send(response, 200, visible(document));
  }
  if (method === "GET" && path === "/me/usage") return send(response, 200, usageFor(reader));
  if (method === "GET" && path === "/me") return send(response, 200, { id: "e2e-reader", email: "e2e-reader@example.invalid" });
  if (method === "DELETE" && path === "/me") {
    state.accountDeleted = true;
    return send(response, 204);
  }

  const match = /^\/documents\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
  if (match) {
    const [, id, part] = match;
    const document = state.documents.find((candidate) => candidate.id === id);
    if (!document) return send(response, method === "DELETE" ? 204 : 404, method === "DELETE" ? undefined : { detail: "document not found" });
    if (method === "GET" && !part) {
      if (document.id === "doc-down") return send(response, 500, { detail: "the database is unavailable" });
      return send(response, 200, visible(document));
    }
    if (method === "GET" && part === "clauses") return send(response, 200, document.id === "doc-empty" ? [] : CLAUSES);
    if (method === "GET" && part === "key-terms") {
      // A "flaky" reader's first key terms read fails and the next one works, so a test can Try again.
      if (reader.startsWith("flaky-") && !state.flakyServed.includes(reader)) {
        state.flakyServed.push(reader);
        return send(response, 502, { detail: "the reading service is unavailable, try again" });
      }
      return send(response, 200, KEY_TERMS);
    }
    if (method === "GET" && part === "checklist") return send(response, 200, CHECKLIST);
    if (method === "POST" && (part === "reread" || part === "retry")) {
      // One document always hits the daily limit, so a test can see the refusal.
      if (document.id === "doc-loan") return send(response, 429, { detail: "You have reached today's limit of 30 document reads. Try again tomorrow." });
      Object.assign(document, { status: "processing", progress_done: 2, progress_total: 8, looksLeft: 1, failure_reason: null });
      return send(response, 200, visible(document));
    }
    if (method === "PATCH" && !part) {
      const { filename, doc_type: kind } = await readJson(request);
      if (typeof filename === "string" && /boom/i.test(filename)) return send(response, 502, { detail: "could not save the change" });
      if (typeof filename === "string") document.filename = filename;
      if (typeof kind === "string" && DOC_TYPES.has(kind)) document.doc_type = kind;
      return send(response, 200, visible(document));
    }
    if (method === "DELETE" && !part) {
      state.documents = state.documents.filter((candidate) => candidate.id !== id);
      return send(response, 204);
    }
    if (method === "POST" && part === "ask") {
      if (usageFor(reader).ask.left === 0) return send(response, 429, { detail: "You have reached today's limit of 100 questions. Try again tomorrow." });
      const { question = "" } = await readJson(request);
      if (/\bfail\b/i.test(question)) return send(response, 502, { detail: "the answering service is unavailable, try again" });
      return send(response, 200, {
        found: true,
        answer: "The deposit is $1,450.00 and is refundable within 30 days after move-out.",
        citations: [{ clause_id: "c-deposit", page_number: 1, clause_text: CLAUSES[0].text, quote: "security deposit of $1,450.00" }],
      });
    }
  }
  return send(response, 404, { detail: "not found" });
});

server.listen(PORT, () => console.log(`fake API on ${PORT}`));
