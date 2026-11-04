import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveShare,
  asSharedDashboard,
  asSharedWithMe,
  asShares,
  createShare,
  joinLink,
  joinShare,
  lastViewedText,
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
    const good = { id: "a", label: "Mum", status: "active", viewer_email: "m@x.com", created_at: "2026-11-01", expires_at: null, last_viewed_at: null };
    expect(asShares([good, { id: "b", status: "weird", created_at: "x" }, null, { status: "active" }])).toEqual([good]);
    expect(asShares({ detail: "x" })).toEqual([]);
  });

  it("fills in what is missing with nothing", () => {
    expect(asShares([{ id: "a", status: "invited", created_at: "2026-11-01" }])[0]).toMatchObject({ label: null, viewer_email: null, expires_at: null, last_viewed_at: null });
  });

  it("keeps only dashboards that are waiting or active", () => {
    expect(
      asSharedWithMe([
        { id: "a", owner_email: "o@x.com", status: "active" },
        { id: "b", owner_email: "o@x.com", status: "revoked" },
        { id: "c", status: "active" },
      ]),
    ).toEqual([{ id: "a", owner_email: "o@x.com", status: "active" }]);
    expect(asSharedWithMe(null)).toEqual([]);
  });

  it("reads a shared dashboard, and gives nothing for an answer that is not one", () => {
    const shown = asSharedDashboard({
      owner_email: "o@x.com",
      documents: [{ id: "d1", filename: "a.pdf", doc_type: "lease", status: "ready" }],
      insights: [{ document_id: "d1", terms_found: 4, terms_total: 6 }],
      key_dates: [{ document_id: "d1", field: "lease_end", label: "Lease ends", value: "March 9, 2027" }, { field: "x" }],
    });
    expect(shown?.owner_email).toBe("o@x.com");
    expect(shown?.documents).toHaveLength(1);
    expect(shown?.insights[0].terms_found).toBe(4);
    expect(shown?.key_dates).toEqual([{ document_id: "d1", field: "lease_end", label: "Lease ends", value: "March 9, 2027" }]);
    expect(asSharedDashboard(null)).toBeNull();
    expect(asSharedDashboard({ documents: [] })).toBeNull();
    expect(asSharedDashboard({ owner_email: "o@x.com" })?.key_dates).toEqual([]);
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

    expect(await createShare("Mum")).toEqual({ ok: true, result: { id: "i", token: "t", code: "123456", expires_at: "x" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/backend/shares", expect.objectContaining({ method: "POST", body: JSON.stringify({ label: "Mum" }) }));
  });

  it("explains a refusal, with the reference that finds it in the logs", async () => {
    fetchMock.mockResolvedValue(reply(409, { detail: "x" }, { "X-Request-ID": "abcdef12-3456" }));

    const outcome = await createShare("");

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
