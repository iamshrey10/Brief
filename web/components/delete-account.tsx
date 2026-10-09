"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/lib/account";

const CONFIRM_WORD = "DELETE";

function signOutAfterDelete() {
  void signOut({ redirectTo: "/" });
}

/**
 * Deletes the signed-in account and everything in it. It is the one thing in Brief that cannot be
 * taken back, so it takes more than a click: the person has to type the word, and it starts with
 * focus in the box so a stray Enter does nothing. When it works the person is signed out, because
 * the account they were using no longer exists.
 */
export function DeleteAccount({ onDeleted = signOutAfterDelete }: { onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) input.current?.focus();
    else if (wasOpen.current) openButton.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !deleting) {
      event.preventDefault();
      close();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (typed !== CONFIRM_WORD || deleting) return;

    setDeleting(true);
    setError(null);
    const outcome = await deleteAccount();
    if (outcome.ok) {
      onDeleted();
      return;
    }
    setDeleting(false);
    setError(outcome.message);
  }

  if (!open) {
    return (
      <Button
        ref={openButton}
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Delete my account
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Delete your account"
      onKeyDown={onKeyDown}
      className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
    >
      <p className="text-sm font-medium text-foreground">Delete your account?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This permanently removes every document you uploaded, the files themselves, and everything
        Brief read from them. It can&apos;t be undone.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Type {CONFIRM_WORD} to confirm
          <input
            ref={input}
            value={typed}
            disabled={deleting}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={deleting} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" size="sm" disabled={typed !== CONFIRM_WORD || deleting}>
            {deleting ? "Deleting..." : "Delete everything"}
          </Button>
        </div>
      </form>
    </div>
  );
}
