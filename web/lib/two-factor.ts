import type { ActionOutcome } from "@/lib/document-actions";
import { referenceFrom, withReference } from "@/lib/reference";

export type TwoFactorStatus = { enabled: boolean; recovery_codes_left: number };

/** The status the backend sent, or null when it is not one. */
export function asTwoFactorStatus(body: unknown): TwoFactorStatus | null {
  const status = body as { enabled?: unknown; recovery_codes_left?: unknown } | null;
  if (typeof status?.enabled !== "boolean") return null;
  return { enabled: status.enabled, recovery_codes_left: typeof status.recovery_codes_left === "number" ? status.recovery_codes_left : 0 };
}

/** What a failed code means, in words. `error` is the one word the website's routes answer with. */
export function messageForCodeFailure(error: string | undefined, status: number): string {
  if (error === "wrong") return "That code isn't right. Codes change every 30 seconds, so use the one showing now. Five wrong tries lock this for 15 minutes.";
  if (error === "locked" || status === 429) return "Too many wrong codes. Wait 15 minutes and try again.";
  if (error === "no setup") return "Start again: this setup is no longer waiting.";
  if (error === "not on") return "Two step verification is not on.";
  if (status === 401) return "Your session expired. Sign in again.";
  return "Couldn't check that just now. Try again in a moment.";
}

async function post<T>(path: string, body: unknown, read: (json: Record<string, unknown>) => T | null): Promise<ActionOutcome<T>> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      const result = read(json);
      if (result !== null) return { ok: true, result };
    }
    const error = typeof json.error === "string" ? json.error : undefined;
    return { ok: false, message: withReference(messageForCodeFailure(error, res.status), referenceFrom(res)) };
  } catch {
    return { ok: false, message: messageForCodeFailure(undefined, 0) };
  }
}

/** Gives the code at sign in. A recovery code works too, and `usedRecoveryCode` says it was one. */
export const verifyCode = (code: string, remember: boolean) =>
  post("/api/two-factor/verify", { code, remember }, (json) => (json.ok === true ? { usedRecoveryCode: json.usedRecoveryCode === true } : null));

/** Turns it on with the first code. The recovery codes come back this once. */
export const enableTwoFactor = (code: string) =>
  post("/api/two-factor/enable", { code }, (json) =>
    Array.isArray(json.recoveryCodes) ? json.recoveryCodes.filter((c): c is string => typeof c === "string") : null,
  );

/** Makes a new set of recovery codes, with a right code. Every old one stops working, and the new ones come back this once. */
export const makeNewRecoveryCodes = (code: string) =>
  post("/api/two-factor/recovery-codes", { code }, (json) =>
    Array.isArray(json.recoveryCodes) ? json.recoveryCodes.filter((c): c is string => typeof c === "string") : null,
  );

/** Turns it off, with a right code. */
export const disableTwoFactor = (code: string) => post("/api/two-factor/disable", { code }, (json) => (json.ok === true ? true : null));

export type Setup = { secret: string; otpauth_uri: string };

/** Starts setting up: a new secret and the address the QR code holds. */
export async function startSetup(): Promise<ActionOutcome<Setup>> {
  try {
    const res = await fetch("/api/backend/me/2fa/setup", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as Partial<Setup>;
    if (res.ok && typeof json.secret === "string" && typeof json.otpauth_uri === "string") {
      return { ok: true, result: { secret: json.secret, otpauth_uri: json.otpauth_uri } };
    }
    if (res.status === 409) return { ok: false, message: "Two step verification is already on." };
    return { ok: false, message: withReference("Couldn't start the setup just now. Try again in a moment.", referenceFrom(res)) };
  } catch {
    return { ok: false, message: "Couldn't start the setup just now. Try again in a moment." };
  }
}

/** The secret in groups of four, which is how it is easiest to copy into an app by hand. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
