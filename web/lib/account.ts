export type AccountDeleteOutcome = { ok: true } | { ok: false; message: string };

/** Plain-language messages for each way deleting an account can fail, never a raw status. */
export function messageForAccountDeleteFailure(status: number): string {
  switch (status) {
    case 401:
      return "Your session expired. Sign in again to delete your account.";
    case 429:
      return "Too many requests at once. Wait a few seconds and try again.";
    case 502:
      return "Some of your files could not be removed, so your account was kept. Try again, it picks up where it stopped.";
    default:
      return "Couldn't delete your account just now. Nothing more was removed, so try again in a moment.";
  }
}

/** Deletes the signed-in account, every document in it, and every file. */
export async function deleteAccount(): Promise<AccountDeleteOutcome> {
  try {
    const res = await fetch("/api/backend/me", { method: "DELETE" });
    if (res.status === 204) return { ok: true };
    return { ok: false, message: messageForAccountDeleteFailure(res.status) };
  } catch {
    return { ok: false, message: messageForAccountDeleteFailure(0) };
  }
}
