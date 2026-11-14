// A stand-in for the Brief API, only for the browser tests. It answers with realistic data, refuses a
// call that carries no token, remembers deletes until it is reset, and records the request ids it was
// sent so a test can check the website forwarded them. Run: node e2e/support/fake-api.mjs
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { totpMatches } from "./totp.mjs";

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

// A document long enough that its clauses scroll for a long time, for the tests of what sticks while they do.
const LONG_CLAUSES = Array.from({ length: 40 }, (_, index) => ({
  id: `c-long-${index}`,
  clause_index: index,
  page_number: Math.floor(index / 4) + 1,
  text: `Clause ${index + 1} of the long test document sets out one more obligation, in a sentence of ordinary length.`,
}));

const fresh = () => ({
  admin: false,
  signals: 0,
  events: [],
  reports: [],
  trash: [],
  twoFactor: { enabled: false, pending: null, secret: null, recovery: [], devices: [], wrong: 0 },
  name: { first_name: "Test", last_name: "Reader" },
  shares: [],
  sharedWithMe: [],
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
    { name: "lease_end", label: "Lease end date", found: true, value: "December 31, 2099", clause_id: "c-late", page_number: 2, quote: CLAUSES[2].text, evidence: [{ clause_id: "c-late", page_number: 2, quote: CLAUSES[2].text }] },
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
const FOLDERS = new Set(["Lease", "Education_Loan", "Job_Offers", "Personal_Documents", "Other"]);
const FOLDER_FOR_KIND = { lease: "Lease", loan: "Education_Loan", offer: "Job_Offers", other: "Other" };

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
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
  // A reader who has two step verification on already, with this secret.
  if (path === "/__seed-two-factor" && method === "POST") {
    state.twoFactor = { enabled: true, pending: null, secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", recovery: ["RCODE0-ABCD0", "RCODE1-ABCD1"], devices: [], wrong: 0 };
    return send(response, 204);
  }
  // A reader who has not given their name yet, as on a first visit.
  if (path === "/__seed-no-name" && method === "POST") {
    state.name = { first_name: null, last_name: null };
    return send(response, 204);
  }
  // A dashboard someone else shared with the reader, ready to be looked at.
  if (path === "/__seed-shared" && method === "POST") {
    state.sharedWithMe.push(await readJson(request));
    return send(response, 204);
  }
  // What the short-lived link from storage would show: the original file.
  if (path.startsWith("/__original/")) return send(response, 200, { original: path.slice(12) });
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
  if (path === "/__signals") return send(response, 200, { count: state.signals });
  if (path === "/__seed-admin" && method === "POST") {
    state.admin = true;
    return send(response, 204);
  }

  if (path === "/__events") return send(response, 200, state.events);
  if (path === "/__reports") return send(response, 200, state.reports);
  // Something that happened for a visitor who is not signed in, counted with the website's own token for one.
  const counted = /^\/events\/([a-z_]+)$/.exec(path);
  if (counted && method === "POST") {
    const who = readerFrom(request.headers.authorization);
    if (who !== "site-visitor") return send(response, 401, { detail: "invalid token" });
    if (!["demo_opened", "demo_finished"].includes(counted[1])) return send(response, 404, { detail: "not found" });
    state.events.push(counted[1]);
    return send(response, 204);
  }

  // Like the real API, nothing else is answered without a signed token.
  const reader = readerFrom(request.headers.authorization);
  if (!reader) return send(response, 401, { detail: "not signed in" });
  // The "still here" signal is counted on its own, so the tests of what a page asks for are not disturbed by it.
  if (method === "POST" && path === "/me/activity") {
    state.signals += 1;
    return send(response, 204);
  }
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
    const { filename = "", doc_type: kind = "", content_type: contentType = "", file_size_bytes: size = 0, folder } = await readJson(request);
    if (folder !== undefined && !FOLDERS.has(folder)) return send(response, 400, { detail: "unknown folder" });
    if (!DOC_TYPES.has(kind) || !contentType || size <= 0) return send(response, 400, { detail: "unsupported file type" });
    if (/limit/i.test(filename)) return send(response, 409, { detail: "You can keep up to 25 documents. Delete one you no longer need to upload another." });
    if (/daily/i.test(filename)) return send(response, 429, { detail: "You have reached today's limit of 30 document reads. Try again tomorrow." });
    state.created += 1;
    const id = `doc-new-${state.created}`;
    state.documents.unshift({ id, filename, doc_type: kind, folder: folder ?? FOLDER_FOR_KIND[kind], status: "pending", ocr_confidence: null, created_at: new Date().toISOString(), status_changed_at: new Date().toISOString() });
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
  // What is already worked out about this reader's documents: terms found, questions answered, and what is left open.
  if (method === "GET" && path === "/me/insights") {
    return send(response, 200, [
      { document_id: "doc-lease", terms_found: 9, terms_total: 12, questions_answered: 7, open_count: 2, open_questions: ["Does this renew automatically, and by what date must I cancel?", "Can the rent go up during the lease, and by how much?"] },
      { document_id: "doc-loan", terms_found: 10, terms_total: 13, questions_answered: 6, open_count: 0, open_questions: [] },
    ]);
  }
  // The dates already saved in this reader's documents. One is clear, and one is a loose phrase the website must leave out.
  if (method === "GET" && path === "/me/key-dates") {
    return send(response, 200, [
      { document_id: "doc-lease", field: "lease_end", label: "Lease ends", value: "December 31, 2099" },
      { document_id: "doc-loan", field: "repayment_start", label: "Repayments start", value: "six months after graduation" },
    ]);
  }
  if (method === "GET" && path === "/admin/stats") {
    if (!state.admin) return send(response, 404, { detail: "not found" });
    const days = Number(url.searchParams.get("days") ?? "30");
    if (![7, 30, 90].includes(days)) return send(response, 400, { detail: "days must be 7, 30 or 90" });
    state.requests.push({ method, path: `${path}?days=${days}`, requestId: request.headers["x-request-id"] ?? null });
    const byDay = Array.from({ length: days }, (_, index) => {
      const day = new Date(Date.UTC(2026, 10, 12 - (days - 1 - index)));
      return {
        day: day.toISOString().slice(0, 10),
        signed_up: index % 7 === 0 ? 2 : 0,
        people: (index * 3) % 9,
        visits: (index * 5) % 11,
        minutes: (index * 7) % 40,
        documents: (index * 2) % 6,
        questions: (index * 4) % 13,
        reads: (index * 2) % 5,
        overviews: index % 4,
        demo_opened: (index * 3) % 8,
        demo_finished: (index * 3) % 8 > 3 ? 2 : 0,
      };
    });
    const sum = (field) => byDay.reduce((total, row) => total + row[field], 0);
    const totals = (scale) => ({
      signed_up: Math.round(sum("signed_up") * scale), people: Math.round(7 * scale), visits: Math.round(sum("visits") * scale), minutes: Math.round(sum("minutes") * scale * 10) / 10,
      documents: Math.round(sum("documents") * scale), questions: Math.round(sum("questions") * scale), reads: Math.round(sum("reads") * scale), overviews: Math.round(sum("overviews") * scale),
      demo_opened: Math.round(sum("demo_opened") * scale), demo_finished: Math.round(sum("demo_finished") * scale), average_minutes_per_visit: 3.2,
    });
    return send(response, 200, {
      generated_at: new Date().toISOString(),
      range_days: days,
      people: { total: 12, new_7_days: 5, new_30_days: 11, active_today: 3, active_7_days: 7, active_30_days: 10 },
      time_in_brief: { average_minutes_per_person_per_day_7_days: 6.5, average_minutes_per_visit_7_days: 3.2, visits_7_days: 40 },
      documents: { stored: 30, uploaded_7_days: 9, uploaded_30_days: 28, by_kind: { lease: 20, loan: 10 }, by_status: { ready: 28, failed: 2 }, photos: 4, pdfs_and_other: 26 },
      questions: { asked_total: 210, asked_today: 14, asked_7_days: 96 },
      reads: { total: 40, today: 3 },
      overviews: { total: 31, today: 2 },
      reasons: { lease: 6, loan: 3, not_said: 3 },
      sharing: { waiting_or_active: 3, active: 1 },
      site: { model_calls_today: 120, daily_limit: 3000 },
      funnel: { signed_up: 12, uploaded_a_document: 9, asked_a_question: 7, came_back_another_day: 4, shared_their_dashboard: 2 },
      demo: { opened_total: 48, finished_total: 19, opened_7_days: 12, finished_7_days: 5, opened_30_days: 40, finished_30_days: 16 },
      period: { current: totals(1), previous: totals(0.8) },
      by_day: byDay,
    });
  }
  if (method === "GET" && path === "/admin/report") {
    if (!state.admin) return send(response, 404, { detail: "not found" });
    const period = url.searchParams.get("period") ?? "day";
    const date = url.searchParams.get("date") ?? "2026-11-12";
    state.reports.push({ period, date });
    const month = period === "month";
    const from = month ? `${date.slice(0, 7)}-01` : date;
    const to = month ? `${date.slice(0, 7)}-03` : date;
    const rows = month ? ["01", "02", "03"] : [date.slice(8, 10)];
    return send(response, 200, {
      period, label: month ? date.slice(0, 7) : date, from, to, generated_at: new Date().toISOString(),
      totals: { signed_up: 3, people: 5, visits: 9, minutes: 41.5, documents: 6, questions: 22, reads: 4, overviews: 3, demo_opened: 11, demo_finished: 4, average_minutes_per_visit: 4.6 },
      reasons_of_new_people: { lease: 2, loan: 1 },
      by_day: rows.map((d, i) => ({ day: `${from.slice(0, 7)}-${d}`, signed_up: 1, people: 2 + i, visits: 3, minutes: 13.8, documents: 2, questions: 7, reads: 1, overviews: 1, demo_opened: 4, demo_finished: 1 })),
    });
  }
  if (method === "GET" && path === "/me") return send(response, 200, { id: "e2e-reader", email: "e2e-reader@example.invalid", is_admin: state.admin, ...state.name });
  if (method === "PATCH" && path === "/me") {
    const { first_name: first, last_name: last } = await readJson(request);
    if (!/^[\p{L} '.-]{1,50}$/u.test(first ?? "") || !/^[\p{L} '.-]{1,50}$/u.test(last ?? "")) return send(response, 422, { detail: "a name has letters only" });
    state.name = { first_name: first, last_name: last };
    return send(response, 200, { id: "e2e-reader", email: "e2e-reader@example.invalid", ...state.name });
  }
  if (method === "DELETE" && path === "/me") {
    state.accountDeleted = true;
    return send(response, 204);
  }

  // Two step verification, with the real time based codes, so the browser tests give real ones.
  const two = state.twoFactor;
  if (path === "/me/2fa" && method === "GET") return send(response, 200, { enabled: two.enabled, recovery_codes_left: two.recovery.length });
  if (path === "/me/2fa/setup" && method === "POST") {
    if (two.enabled) return send(response, 409, { detail: "two step verification is already on" });
    two.pending = Array.from(randomBytes(20), (byte) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[byte % 32]).join("");
    return send(response, 200, { secret: two.pending, otpauth_uri: `otpauth://totp/Brief%3Afake?secret=${two.pending}&issuer=Brief&algorithm=SHA1&digits=6&period=30` });
  }
  if (path === "/me/2fa/enable" && method === "POST") {
    const { code } = await readJson(request);
    if (!two.pending || two.enabled) return send(response, 409, { detail: "there is no setup waiting" });
    if (two.wrong >= 5) return send(response, 429, { detail: "too many wrong codes, try again in 15 minutes" });
    if (!totpMatches(two.pending, code)) {
      two.wrong += 1;
      return send(response, 400, { detail: "that code is not right" });
    }
    two.enabled = true;
    two.secret = two.pending;
    two.recovery = Array.from({ length: 10 }, (_, i) => `RCODE${i}-ABCD${i}`);
    return send(response, 200, { recovery_codes: [...two.recovery] });
  }
  if (path === "/me/2fa/verify" && method === "POST") {
    const { code, remember } = await readJson(request);
    if (!two.enabled) return send(response, 409, { detail: "two step verification is not on" });
    if (two.wrong >= 5) return send(response, 429, { detail: "too many wrong codes, try again in 15 minutes" }, { "Retry-After": "900" });
    const recovery = two.recovery.indexOf(String(code).toUpperCase().replace(/\s/g, "-"));
    if (!totpMatches(two.secret, String(code)) && recovery === -1) {
      two.wrong += 1;
      return send(response, 400, { detail: "that code is not right" });
    }
    if (recovery !== -1) two.recovery.splice(recovery, 1);
    two.wrong = 0;
    const device = remember ? `device-${two.devices.length + 1}-${"d".repeat(40)}` : null;
    if (device) two.devices.push(device);
    return send(response, 200, { device_token: device, used_recovery_code: recovery !== -1 });
  }
  if (path === "/me/2fa/check" && method === "POST") {
    const { device_token: device } = await readJson(request);
    return send(response, 200, { required: two.enabled, trusted: two.enabled && Boolean(device) && two.devices.includes(device) });
  }
  if (path === "/me/2fa/recovery-codes" && method === "POST") {
    const { code } = await readJson(request);
    if (!two.enabled) return send(response, 409, { detail: "two step verification is not on" });
    if (!totpMatches(two.secret, String(code)) && !two.recovery.includes(String(code))) {
      two.wrong += 1;
      return send(response, 400, { detail: "that code is not right" });
    }
    two.recovery = Array.from({ length: 10 }, (_, i) => `NEWCD${i}-WXYZ${i}`);
    return send(response, 200, { recovery_codes: [...two.recovery] });
  }
  if (path === "/me/2fa/disable" && method === "POST") {
    const { code } = await readJson(request);
    if (!two.enabled) return send(response, 409, { detail: "two step verification is not on" });
    if (!totpMatches(two.secret, String(code)) && !two.recovery.includes(String(code))) {
      two.wrong += 1;
      return send(response, 400, { detail: "that code is not right" });
    }
    state.twoFactor = { enabled: false, pending: null, secret: null, recovery: [], devices: [], wrong: 0 };
    return send(response, 200, { enabled: false, recovery_codes_left: 0 });
  }

  // Sharing. The fake has one reader, so it lets that reader use their own invitation to show the viewer's side.
  const MAX_SHARES = 5;
  const ACCESS_HOURS = [1, 6, 24, 168, 360, 720, 2160];
  if (path === "/shares" && method === "GET") return send(response, 200, state.shares.map((share) => ({ id: share.id, label: share.label, status: share.status, viewer_email: share.viewer_email, viewer_name: share.viewer_name ?? null, created_at: share.created_at, expires_at: share.expires_at, last_viewed_at: share.last_viewed_at, access_hours: share.access_hours ?? null, access_until: share.access_until ?? null, access_ends_at: share.access_ends_at ?? null })));
  if (path === "/shares" && method === "POST") {
    const { label, hours = null, until = null } = await readJson(request);
    if (hours !== null && until !== null) return send(response, 422, { detail: "choose a length of time or an end date, not both" });
    if (hours !== null && !ACCESS_HOURS.includes(hours)) return send(response, 422, { detail: "that length of time is not one of the choices" });
    if (until !== null && new Date(until).getTime() <= Date.now()) return send(response, 422, { detail: "that end date has already passed" });
    if (state.shares.length >= MAX_SHARES) return send(response, 409, { detail: "You can share your dashboard with up to 5 people. Remove someone to invite another." });
    const id = `share-${state.shares.length + 1}-${Date.now()}`;
    const made = { id, label: label || null, status: "invited", viewer_email: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), last_viewed_at: null, token: `E2E${"x".repeat(40)}`, code: "482913", access_hours: until === null ? (hours ?? 168) : null, access_until: until, access_ends_at: null };
    state.shares.push(made);
    return send(response, 201, { id, token: made.token, code: made.code, expires_at: made.expires_at, access_hours: made.access_hours, access_until: made.access_until });
  }
  if (path === "/shares/join" && method === "POST") {
    const { token, code } = await readJson(request);
    const share = state.shares.find((candidate) => candidate.token === token && candidate.status === "invited");
    if (!share) return send(response, 404, { detail: "that invitation is not valid any more" });
    if (share.code !== code) return send(response, 400, { detail: "that code is not right" });
    share.status = "requested";
    share.viewer_email = "friend@example.com";
    return send(response, 200, { owner_email: "e2e-reader@example.invalid", status: "requested" });
  }
  const shareAction = /^\/shares\/([^/]+)(?:\/(approve))?$/.exec(path);
  if (shareAction) {
    const [, id, action] = shareAction;
    const share = state.shares.find((candidate) => candidate.id === id);
    if (!share) return send(response, 404, { detail: "share not found" });
    if (action === "approve" && method === "POST") {
      if (share.status !== "requested") return send(response, 409, { detail: "there is no request waiting to approve" });
      share.status = "active";
      share.expires_at = null;
      share.access_ends_at = share.access_until ?? new Date(Date.now() + (share.access_hours ?? 720) * 3_600_000).toISOString();
      return send(response, 200, { status: "active" });
    }
    if (!action && method === "PATCH") {
      const { hours = null, until = null } = await readJson(request);
      if ((hours === null) === (until === null)) return send(response, 422, { detail: "choose a length of time or an end date" });
      if (hours !== null && !ACCESS_HOURS.includes(hours)) return send(response, 422, { detail: "that length of time is not one of the choices" });
      if (share.status !== "active") return send(response, 409, { detail: "only someone who can view your dashboard can be given more time" });
      share.access_ends_at = until ?? new Date(Date.now() + hours * 3_600_000).toISOString();
      return send(response, 200, { status: "active" });
    }
    if (!action && method === "DELETE") {
      state.shares = state.shares.filter((candidate) => candidate.id !== id);
      return send(response, 204);
    }
  }
  if (path === "/shared" && method === "GET") return send(response, 200, state.sharedWithMe.filter((entry) => entry.status !== "removed").map(({ id, owner_email, owner_name = null, status, access_ends_at = null }) => ({ id, owner_email, owner_name, status, access_ends_at })));
  const removedShare = /^\/shared\/([^/]+)\/removed$/.exec(path);
  if (removedShare && method === "GET") {
    const gone = state.sharedWithMe.find((candidate) => candidate.id === removedShare[1] && candidate.status === "removed");
    return gone ? send(response, 200, { owner_email: gone.owner_email, owner_name: gone.owner_name ?? null, reason: gone.reason ?? "removed", ended_at: gone.ended_at ?? null }) : send(response, 404, { detail: "shared dashboard not found" });
  }
  const shared = /^\/shared\/([^/]+)\/dashboard$/.exec(path);
  if (shared && method === "GET") {
    const found = state.sharedWithMe.find((candidate) => candidate.id === shared[1] && candidate.status === "active");
    return found ? send(response, 200, { access_ends_at: found.access_ends_at ?? null, ...found.dashboard }) : send(response, 404, { detail: "shared dashboard not found" });
  }

  // The bin: deleted documents wait here for 7 days. Restoring puts one back; deleting for good removes it.
  if (method === "GET" && path === "/trash") {
    return send(response, 200, state.trash.map(({ id, filename, doc_type }) => ({ id, filename, doc_type, deleted_at: new Date().toISOString(), days_left: 7 })));
  }
  const binned = /^\/documents\/([^/]+)\/(restore|permanent)$/.exec(path);
  if (binned) {
    const [, id, action] = binned;
    const found = state.trash.find((candidate) => candidate.id === id);
    if (!found) return send(response, action === "permanent" && method === "DELETE" ? 204 : 404, action === "permanent" ? undefined : { detail: "document not found" });
    if (action === "restore" && method === "POST") {
      state.trash = state.trash.filter((candidate) => candidate.id !== id);
      state.documents.unshift(found);
      return send(response, 200, visible(found));
    }
    if (action === "permanent" && method === "DELETE") {
      state.trash = state.trash.filter((candidate) => candidate.id !== id);
      return send(response, 204);
    }
  }

  const match = /^\/documents\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
  if (match) {
    const [, id, part] = match;
    const document = state.documents.find((candidate) => candidate.id === id);
    if (!document) return send(response, method === "DELETE" ? 204 : 404, method === "DELETE" ? undefined : { detail: "document not found" });
    if (method === "GET" && part === "file") {
      return send(response, 200, { url: `http://localhost:${response.req.socket.localPort}/__original/${document.id}`, content_type: "application/pdf" });
    }
    if (method === "GET" && !part) {
      if (document.id === "doc-down") return send(response, 500, { detail: "the database is unavailable" });
      return send(response, 200, visible(document));
    }
    if (method === "GET" && part === "clauses") return send(response, 200, document.id === "doc-empty" ? [] : document.id === "doc-long" ? LONG_CLAUSES : CLAUSES);
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
      state.trash.unshift(document);
      return send(response, 204);
    }
    if (method === "POST" && part === "move") {
      const { folder } = await readJson(request);
      if (!FOLDERS.has(folder)) return send(response, 400, { detail: "unknown folder" });
      if (/nomove/i.test(document.filename)) return send(response, 502, { detail: "could not move the file, it is still where it was" });
      document.folder = folder;
      return send(response, 200, visible(document));
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
