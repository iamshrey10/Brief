import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveShare,
  asAccessRemoved,
  asSharedDashboard,
  asSharedWithMe,
  asShares,
  changeShareAccess,
  createShare,
  joinLink,
  joinShare,
  lastViewedText,
  messageForApproveFailure,
  messageForExtendFailure,
  messageForJoinFailure,
  messageForShareFailure,
  removeShare,
  shareStatusText,
} from "./sharing";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

describe("reading what the backend sends", () => {
  it("keeps well-formed shares and drops the rest", () => {
    const good = { id: "a", label: "Mum", status: "active", viewer_email: "m@x.com", viewer_name: "Maya Rao", created_at: "2026-11-01", expires_at: null, last_viewed_at: null, access_hours: 168, access_until: null, access_ends_at: "2026-11-08T10:00:00Z" };
    expect(asShares([good, { id: "b", status: "weird", created_at: "x" }, null, { status: "active" }])).toEqual([good]);
    expect(asShares({ detail: "x" })).toEqual([]);
  });

  it("fills in what is missing with nothing", () => {
    expect(asShares([{ id: "a", status: "invited", created_at: "2026-11-01" }])[0]).toMatchObject({ label: null, viewer_email: null, viewer_name: null, expires_at: null, last_viewed_at: null, access_hours: null, access_until: null, access_ends_at: null });
  });

  it("keeps only dashboards that are waiting or active", () => {
    expect(
      asSharedWithMe([
        { id: "a", owner_email: "o@x.com", owner_name: "Olu Ade", status: "active", access_ends_at: "2026-11-08T10:00:00Z" },
        { id: "b", owner_email: "o@x.com", status: "revoked" },
        { id: "c", status: "active" },
      ]),
    ).toEqual([{ id: "a", owner_email: "o@x.com", owner_name: "Olu Ade", status: "active", access_ends_at: "2026-11-08T10:00:00Z" }]);
    expect(asSharedWithMe(null)).toEqual([]);
  });

  it("reads a shared dashboard, and gives nothing for an answer that is not one", () => {
    const shown = asSharedDashboard({
      owner_email: "o@x.com",
      owner_name: "Olu Ade",
      documents: [{ id: "d1", filename: "a.pdf", doc_type: "lease", status: "ready" }],
      insights: [{ document_id: "d1", terms_found: 4, terms_total: 6 }],
      key_dates: [{ document_id: "d1", field: "lease_end", label: "Lease ends", value: "March 9, 2027" }, { field: "x" }],
    });
    expect(shown?.owner_email).toBe("o@x.com");
    expect(shown?.owner_name).toBe("Olu Ade");
    expect(shown?.documents).toHaveLength(1);
    expect(shown?.insights[0].terms_found).toBe(4);
    expect(shown?.key_dates).toEqual([{ document_id: "d1", field: "lease_end", label: "Lease ends", value: "March 9, 2027" }]);
    expect(shown?.documents[0].key_terms).toEqual([]);
    expect(asSharedDashboard(null)).toBeNull();
    expect(asSharedDashboard({ documents: [] })).toBeNull();
    expect(asSharedDashboard({ owner_email: "o@x.com" })?.key_dates).toEqual([]);
  });
});

describe("key terms in a shared dashboard", () => {
  it("keeps each document's terms and drops any that are not a label with a value", () => {
    const shown = asSharedDashboard({
      owner_email: "o@x.com",
      documents: [
        { id: "d1", filename: "a.pdf", doc_type: "lease", status: "ready", key_terms: [{ label: "Monthly rent", value: "$1,800" }, { label: "x" }, null, { label: "", value: "y" }] },
        { id: "d2", filename: "b.pdf", doc_type: "loan", status: "ready", key_terms: "nope" },
      ],
    });

    expect(shown?.documents.map((d) => d.key_terms)).toEqual([[{ label: "Monthly rent", value: "$1,800" }], []]);
  });
});

describe("the words", () => {
  it("builds the link from the site address and the secret", () => {
    expect(joinLink("https://brief.example", "abc")).toBe("https://brief.example/shared/join/abc");
  });

  it.each([
    ["active", "Can view"],
    ["requested", "Waiting for your approval"],
    ["invited", "Invitation sent, not used yet"],
  ] as const)("%s reads %s", (status, text) => expect(shareStatusText(status)).toBe(text));

  it("says when someone last looked", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(lastViewedText(null, now)).toBe("Hasn't looked yet");
    expect(lastViewedText("2026-11-10T08:00:00Z", now)).toBe("Looked today");
    expect(lastViewedText("2026-11-09T08:00:00Z", now)).toBe("Looked yesterday");
    expect(lastViewedText("2026-11-05T11:00:00Z", now)).toBe("Looked 5 days ago");
  });

  it.each([
    [409, "up to 5 people"],
    [404, "no longer here"],
    [401, "session expired"],
    [429, "Too many requests"],
    [500, "Nothing was changed"],
  ])("a %i for sharing says %s", (status, text) => expect(messageForShareFailure(status)).toContain(text));

  it.each([
    [400, "isn't right"],
    [404, "isn't valid any more"],
    [409, "already have access"],
    [422, "six digits"],
    [401, "session expired"],
    [429, "Too many requests"],
    [500, "Try again in a moment"],
  ])("a %i for joining says %s", (status, text) => expect(messageForJoinFailure(status)).toContain(text));
});

describe("the calls", () => {
  it("creates an invitation, sending the name, and returns what came back", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: "i", token: "t", code: "123456", expires_at: "x" }));

    expect(await createShare("Mum", { kind: "hours", hours: 168 })).toEqual({ ok: true, result: { id: "i", token: "t", code: "123456", expires_at: "x" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/backend/shares", expect.objectContaining({ method: "POST", body: JSON.stringify({ label: "Mum", hours: 168 }) }));
  });

  it("explains a refusal, with the reference that finds it in the logs", async () => {
    fetchMock.mockResolvedValue(reply(409, { detail: "x" }, { "X-Request-ID": "abcdef12-3456" }));

    const outcome = await createShare("", { kind: "hours", hours: 24 });

    expect(outcome).toEqual({ ok: false, message: expect.stringContaining("up to 5 people") });
    expect(outcome.ok === false && outcome.message).toContain("Reference: abcdef12");
  });

  it("says it could not reach the server rather than throwing", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await approveShare("s1")).toEqual({ ok: false, message: messageForShareFailure(0) });
  });

  it("approves and removes by id, and counts a share that is already gone as removed", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { status: "active" }));
    expect((await approveShare("s 1")).ok).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/backend/shares/s%201/approve", { method: "POST" });

    fetchMock.mockResolvedValueOnce(reply(204));
    expect((await removeShare("s1")).ok).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/backend/shares/s1", { method: "DELETE" });

    fetchMock.mockResolvedValueOnce(reply(404, { detail: "x" }));
    expect((await removeShare("s1")).ok).toBe(true);

    fetchMock.mockResolvedValueOnce(reply(500, { detail: "x" }));
    expect((await removeShare("s1")).ok).toBe(false);
  });

  it("joins with the link's secret and the code", async () => {
    fetchMock.mockResolvedValue(reply(200, { owner_email: "o@x.com", status: "requested" }));

    expect(await joinShare("tok", "123456")).toEqual({ ok: true, result: { owner_email: "o@x.com", status: "requested" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/backend/shares/join", expect.objectContaining({ body: JSON.stringify({ token: "tok", code: "123456" }) }));
  });

  it("says a wrong code is wrong", async () => {
    fetchMock.mockResolvedValue(reply(400, { detail: "x" }));

    expect(await joinShare("tok", "000000")).toEqual({ ok: false, message: expect.stringContaining("isn't right") });
  });
});

describe("inviteTokenFrom", () => {
  const token = "Ab1-_".repeat(9);

  it("takes the secret from a whole link, with or without a query, a slash or spaces", async () => {
    const { inviteTokenFrom } = await import("./sharing");

    expect(inviteTokenFrom(`https://brief.example/shared/join/${token}`)).toBe(token);
    expect(inviteTokenFrom(`  https://brief.example/shared/join/${token}/?a=1#b `)).toBe(token);
    expect(inviteTokenFrom(token)).toBe(token);
  });

  it("is null for anything that is not a secret", async () => {
    const { inviteTokenFrom } = await import("./sharing");

    expect(inviteTokenFrom("")).toBeNull();
    expect(inviteTokenFrom("hello")).toBeNull();
    expect(inviteTokenFrom("https://brief.example/shared/join/short")).toBeNull();
  });
});

describe("asAccessRemoved", () => {
  it("reads whose dashboard it was, with or without a name", () => {
    expect(asAccessRemoved({ owner_email: "mum@example.com", owner_name: "Asha Rao" })).toEqual({ ownerEmail: "mum@example.com", ownerName: "Asha Rao", reason: "removed", endedAt: null });
    expect(asAccessRemoved({ owner_email: "mum@example.com", owner_name: null })).toEqual({ ownerEmail: "mum@example.com", ownerName: null, reason: "removed", endedAt: null });
  });

  it("tells an access that ran out from one that was taken away", () => {
    expect(asAccessRemoved({ owner_email: "mum@example.com", reason: "expired", ended_at: "2026-11-10T10:00:00Z" })).toMatchObject({ reason: "expired", endedAt: "2026-11-10T10:00:00Z" });
    expect(asAccessRemoved({ owner_email: "mum@example.com", reason: "something else" })).toMatchObject({ reason: "removed" });
  });

  it("is null for anything that is not that", () => {
    expect(asAccessRemoved(null)).toBeNull();
    expect(asAccessRemoved({ detail: "shared dashboard not found" })).toBeNull();
  });
});

describe("how long they may look", () => {
  it("sends a chosen end date instead of hours", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: "i", token: "t", code: "123456", expires_at: "x" }));

    await createShare("Mum", { kind: "until", until: "2026-11-30T23:59:59.000Z" });

    expect(fetchMock).toHaveBeenCalledWith("/api/backend/shares", expect.objectContaining({ body: JSON.stringify({ label: "Mum", until: "2026-11-30T23:59:59.000Z" }) }));
  });

  it("gives someone more time with a PATCH to their share", async () => {
    fetchMock.mockResolvedValue(reply(200, { status: "active" }));

    expect(await changeShareAccess("s 1", { kind: "hours", hours: 720 })).toEqual({ ok: true, result: null });
    expect(fetchMock).toHaveBeenCalledWith("/api/backend/shares/s%201", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ hours: 720 }) }));
  });

  it("says a share that has ended cannot be extended, and that only someone who can look can be given time", () => {
    expect(messageForExtendFailure(404)).toContain("ended");
    expect(messageForExtendFailure(409)).toContain("already see your dashboard");
    expect(messageForExtendFailure(422)).toContain("choices");
  });

  it("says an invitation whose end date passed before approval needs a new invitation", () => {
    expect(messageForApproveFailure(409)).toContain("make a new invitation");
    expect(messageForApproveFailure(404)).toBe(messageForShareFailure(404));
  });
});
