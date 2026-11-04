import { afterEach, describe, expect, it, vi } from "vitest";

import { asTwoFactorStatus, disableTwoFactor, enableTwoFactor, groupSecret, messageForCodeFailure, startSetup, verifyCode } from "./two-factor";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const reply = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("reading the status", () => {
  it("reads whether it is on and how many codes are left", () => {
    expect(asTwoFactorStatus({ enabled: true, recovery_codes_left: 7 })).toEqual({ enabled: true, recovery_codes_left: 7 });
    expect(asTwoFactorStatus({ enabled: false })).toEqual({ enabled: false, recovery_codes_left: 0 });
  });

  it.each([null, [], { detail: "x" }, { enabled: "yes" }])("gives nothing for %j", (body) => expect(asTwoFactorStatus(body)).toBeNull());
});

describe("the words", () => {
  it.each([
    ["wrong", 400, "isn't right"],
    ["locked", 429, "Wait 15 minutes"],
    [undefined, 429, "Wait 15 minutes"],
    ["no setup", 409, "Start again"],
    ["not on", 409, "not on"],
    [undefined, 401, "session expired"],
    [undefined, 502, "Try again in a moment"],
  ])("%s with a %i says %s", (error, status, text) => expect(messageForCodeFailure(error, status)).toContain(text));

  it("groups a secret in fours", () => {
    expect(groupSecret("ABCDEFGHIJKLMNOP")).toBe("ABCD EFGH IJKL MNOP");
    expect(groupSecret("ABCDEF")).toBe("ABCD EF");
  });
});

describe("the calls", () => {
  it("gives the code at sign in, with the choice to remember", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, usedRecoveryCode: true }));

    expect(await verifyCode("123456", true)).toEqual({ ok: true, result: { usedRecoveryCode: true } });
    expect(fetchMock).toHaveBeenCalledWith("/api/two-factor/verify", expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "123456", remember: true }) }));
  });

  it("says a wrong code is wrong, with the reference", async () => {
    fetchMock.mockResolvedValue(reply(400, { error: "wrong" }, { "X-Request-ID": "abcdef12-3456" }));

    const outcome = await verifyCode("000000", false);

    expect(!outcome.ok && outcome.message).toContain("isn't right");
    expect(!outcome.ok && outcome.message).toContain("Reference: abcdef12");
  });

  it("says locked when the account is locked", async () => {
    fetchMock.mockResolvedValue(reply(429, { error: "locked" }));

    expect(await verifyCode("000000", false)).toEqual({ ok: false, message: expect.stringContaining("Wait 15 minutes") });
  });

  it("treats an answer that is not what was expected as a failure, never as a pass", async () => {
    fetchMock.mockResolvedValue(reply(200, { nothing: true }));

    expect((await verifyCode("123456", false)).ok).toBe(false);
  });

  it("says it could not check, rather than throwing, when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await verifyCode("1", false)).toEqual({ ok: false, message: messageForCodeFailure(undefined, 0) });
  });

  it("turns it on and returns the recovery codes, keeping only text", async () => {
    fetchMock.mockResolvedValue(reply(200, { recoveryCodes: ["AAAAA-BBBBB", 5, "CCCCC-DDDDD"] }));

    expect(await enableTwoFactor("123456")).toEqual({ ok: true, result: ["AAAAA-BBBBB", "CCCCC-DDDDD"] });
  });

  it("turns it off", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));

    expect(await disableTwoFactor("123456")).toEqual({ ok: true, result: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/two-factor/disable", expect.anything());
  });

  it("starts the setup and returns the secret and address", async () => {
    fetchMock.mockResolvedValue(reply(200, { secret: "ABCD", otpauth_uri: "otpauth://totp/x" }));

    expect(await startSetup()).toEqual({ ok: true, result: { secret: "ABCD", otpauth_uri: "otpauth://totp/x" } });
  });

  it("says it is already on, or could not start", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, {}));
    expect(await startSetup()).toEqual({ ok: false, message: "Two step verification is already on." });

    fetchMock.mockResolvedValueOnce(reply(200, { secret: 5 }));
    expect((await startSetup()).ok).toBe(false);

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await startSetup()).toEqual({ ok: false, message: expect.stringContaining("Couldn't start") });
  });
});
