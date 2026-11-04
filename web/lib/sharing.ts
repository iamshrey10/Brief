import { referenceFrom, withReference } from "@/lib/reference";
import type { ActionOutcome } from "@/lib/document-actions";
import type { DocumentSummary } from "@/lib/documents";
import { asDocuments, asInsights, type InsightFromApi } from "@/lib/dashboard";

/** How many people can look at a dashboard at once, the same number the backend enforces. */
export const MAX_SHARES = 5;

export type Share = {
  id: string;
  label: string | null;
  status: "invited" | "requested" | "active";
  viewer_email: string | null;
  viewer_name: string | null;
  created_at: string;
  expires_at: string | null;
  last_viewed_at: string | null;
};

export type Invitation = { id: string; token: string; code: string; expires_at: string };
export type SharedWithMe = { id: string; owner_email: string; owner_name: string | null; status: "requested" | "active" };
export type SharedTerm = { label: string; value: string };
export type SharedDocument = DocumentSummary & { key_terms: SharedTerm[] };
export type SharedDashboard = {
  owner_email: string;
  owner_name: string | null;
  documents: SharedDocument[];
  insights: InsightFromApi[];
  key_dates: { document_id: string; field: string; label: string; value: string }[];
};

const STATES = ["invited", "requested", "active"];
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** The shares the backend sent, each checked, and anything not shaped like one left out. */
export function asShares(body: unknown): Share[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((entry) =>
    isText(entry?.id) && STATES.includes(entry?.status) && isText(entry?.created_at)
      ? [
          {
            id: entry.id,
            label: textOrNull(entry.label),
            status: entry.status,
            viewer_email: textOrNull(entry.viewer_email),
            viewer_name: textOrNull(entry.viewer_name),
            created_at: entry.created_at,
            expires_at: textOrNull(entry.expires_at),
            last_viewed_at: textOrNull(entry.last_viewed_at),
          },
        ]
      : [],
  );
}

/** The dashboards shared with this person, each checked. */
export function asSharedWithMe(body: unknown): SharedWithMe[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap((entry) =>
    isText(entry?.id) && isText(entry?.owner_email) && (entry?.status === "requested" || entry?.status === "active")
      ? [{ id: entry.id, owner_email: entry.owner_email, owner_name: textOrNull(entry.owner_name), status: entry.status }]
      : [],
  );
}

/** A shared dashboard, or null when the backend's answer is not one. */
export function asSharedDashboard(body: unknown): SharedDashboard | null {
  const shared = body as { owner_email?: unknown; owner_name?: unknown; documents?: unknown; insights?: unknown; key_dates?: unknown } | null;
  if (!shared || !isText(shared.owner_email)) return null;
  const dates = Array.isArray(shared.key_dates) ? shared.key_dates : [];
  const termsById = new Map<string, SharedTerm[]>();
  if (Array.isArray(shared.documents)) {
    for (const entry of shared.documents) {
      if (isText(entry?.id)) {
        const terms: unknown[] = Array.isArray(entry.key_terms) ? entry.key_terms : [];
        termsById.set(
          entry.id,
          terms.flatMap((term) => {
            const t = term as { label?: unknown; value?: unknown };
            return isText(t?.label) && isText(t?.value) ? [{ label: t.label, value: t.value }] : [];
          }),
        );
      }
    }
  }
  return {
    owner_email: shared.owner_email,
    owner_name: textOrNull(shared.owner_name),
    documents: asDocuments(shared.documents).map((document) => ({ ...document, key_terms: termsById.get(document.id) ?? [] })),
    insights: asInsights(shared.insights),
    key_dates: dates.flatMap((entry) =>
      isText(entry?.document_id) && isText(entry?.field) && isText(entry?.label) && isText(entry?.value)
        ? [{ document_id: entry.document_id, field: entry.field, label: entry.label, value: entry.value }]
        : [],
    ),
  };
}

/** The secret part of a share link, from the whole link or from the secret on its own. Null when it is neither. */
export function inviteTokenFrom(text: string): string | null {
  const last = text.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() ?? "";
  return /^[A-Za-z0-9_-]{16,200}$/.test(last) ? last : null;
}

/** The link to send: it opens the page that asks for the code. */
export function joinLink(origin: string, token: string): string {
  return `${origin}/shared/join/${token}`;
}

/** What a share's state means to the person who made it. */
export function shareStatusText(status: Share["status"]): string {
  if (status === "active") return "Can view";
  if (status === "requested") return "Waiting for your approval";
  return "Invitation sent, not used yet";
}

/** "Never", "Today", "Yesterday" or "3 days ago": when someone last looked. */
export function lastViewedText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Hasn't looked yet";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Looked today";
  if (days === 1) return "Looked yesterday";
  return `Looked ${days} days ago`;
}

type Messages = Record<number, string>;
const pick = (messages: Messages, status: number, fallback: string) => messages[status] ?? fallback;

export const messageForShareFailure = (status: number) =>
  pick(
    {
      401: "Your session expired. Sign in again.",
      404: "That one is no longer here.",
      409: `You can share your dashboard with up to ${MAX_SHARES} people. Remove someone to invite another.`,
      429: "Too many requests at once. Wait a few seconds and try again.",
    },
    status,
    "Couldn't do that just now. Nothing was changed, so try again in a moment.",
  );

export const messageForJoinFailure = (status: number) =>
  pick(
    {
      400: "That code isn't right. Check it with the person who sent it. Five wrong tries end the invitation.",
      401: "Your session expired. Sign in again.",
      404: "That invitation isn't valid any more. Ask for a new one.",
      409: "You already have access to that dashboard.",
      422: "The code is six digits.",
      429: "Too many requests at once. Wait a few seconds and try again.",
    },
    status,
    "Couldn't check that just now. Try again in a moment.",
  );

async function call<T>(
  path: string,
  init: RequestInit,
  messages: (status: number) => string,
  read: (res: Response) => Promise<T>,
  okStatuses: number[] = [],
): Promise<ActionOutcome<T>> {
  try {
    const res = await fetch(path, init);
    if (res.ok || okStatuses.includes(res.status)) return { ok: true, result: await read(res) };
    return { ok: false, message: withReference(messages(res.status), referenceFrom(res)) };
  } catch {
    return { ok: false, message: messages(0) };
  }
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Makes an invitation. The link's secret and the code come back this once and are never stored in readable form. */
export const createShare = (label: string) =>
  call<Invitation>("/api/backend/shares", json({ label }), messageForShareFailure, (res) => res.json());

/** Lets the person who asked view the dashboard. */
export const approveShare = (id: string) =>
  call<null>(`/api/backend/shares/${encodeURIComponent(id)}/approve`, { method: "POST" }, messageForShareFailure, async () => null);

/** Ends a share, declines a request or removes someone's access. Already gone counts as done. */
export const removeShare = (id: string) =>
  call<null>(`/api/backend/shares/${encodeURIComponent(id)}`, { method: "DELETE" }, messageForShareFailure, async () => null, [404]);

/** Enters the code from an invitation link. */
export const joinShare = (token: string, code: string) =>
  call<{ owner_email: string; owner_name?: string | null; status: string }>("/api/backend/shares/join", json({ token, code }), messageForJoinFailure, (res) => res.json());
