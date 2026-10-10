import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/service-token", () => ({ mintServiceToken: vi.fn() }));

import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { mintServiceToken } from "@/lib/service-token";
import { requireSession } from "./require-session";

const authMock = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;
const limitMock = vi.mocked(checkRateLimit);
const mintMock = vi.mocked(mintServiceToken);

beforeEach(() => {
  authMock.mockReset();
  limitMock.mockReset();
  mintMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "reader@example.com" } });
  limitMock.mockResolvedValue(true);
  mintMock.mockResolvedValue("signed-token");
});

async function errorOf(result: Awaited<ReturnType<typeof requireSession>>) {
  if (!("error" in result)) throw new Error("expected an error result");
  return { status: result.error.status, body: await result.error.json() };
}

describe("requireSession", () => {
  it("gives a token for a signed in person who is within their limit", async () => {
    expect(await requireSession()).toEqual({ token: "signed-token" });
  });

  it("mints the token for the same person it checked, and checks their limit once", async () => {
    await requireSession();

    expect(limitMock).toHaveBeenCalledExactlyOnceWith("reader@example.com");
    expect(mintMock).toHaveBeenCalledExactlyOnceWith("reader@example.com");
  });

  it.each([
    ["no session at all", null],
    ["a session without a user", {}],
    ["a user without an email", { user: {} }],
    ["an empty email", { user: { email: "" } }],
    ["a missing email", { user: { email: undefined } }],
  ])("refuses %s with 401 and does nothing else", async (_name, session) => {
    authMock.mockResolvedValue(session);

    const refused = await errorOf(await requireSession());

    expect(refused).toEqual({ status: 401, body: { error: "not signed in" } });
    expect(limitMock).not.toHaveBeenCalled();
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("refuses someone over their limit with 429 and gives them no token", async () => {
    limitMock.mockResolvedValue(false);

    const refused = await errorOf(await requireSession());

    expect(refused).toEqual({ status: 429, body: { error: "too many requests" } });
    expect(mintMock).not.toHaveBeenCalled();
  });

  it("counts a request against the limit only after the person is known", async () => {
    authMock.mockResolvedValue(null);

    await requireSession();

    expect(limitMock).not.toHaveBeenCalled();
  });

  it("does not hand over a token when the limit check itself fails", async () => {
    limitMock.mockRejectedValue(new Error("redis is down"));

    await expect(requireSession()).rejects.toThrow("redis is down");
    expect(mintMock).not.toHaveBeenCalled();
  });
});
