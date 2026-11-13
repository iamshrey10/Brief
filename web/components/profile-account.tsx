"use client";

import { useState } from "react";

import { NameForm } from "@/components/name-form";
import { Button } from "@/components/ui/button";
import { badgeLetter, personLabel } from "@/lib/profile";

/** The Account card: the person's name, their address, and a way to change the name. */
export function ProfileAccount({ email, firstName, lastName }: { email: string; firstName: string | null; lastName: string | null }) {
  const [name, setName] = useState({ first: firstName ?? "", last: lastName ?? "" });
  const [editing, setEditing] = useState(false);
  const full = [name.first, name.last].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="account-heading" className="rounded-2xl border border-border bg-card p-6 max-sm:p-4">
      <h2 id="account-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Account
      </h2>
      <div className="mt-4 flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent font-heading text-xl font-semibold text-accent-foreground"
        >
          {badgeLetter(full, email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">{personLabel(full, email)}</p>
          {full && <p className="truncate text-sm text-muted-foreground">{email}</p>}
          <p className="text-sm text-muted-foreground">Signed in with Google</p>
        </div>
        {!editing && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            {full ? "Edit name" : "Add your name"}
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-4 border-t border-border pt-4">
          <NameForm
            initialFirst={name.first}
            initialLast={name.last}
            submitLabel="Save name"
            onSaved={(saved) => {
              setName({ first: saved.first_name, last: saved.last_name });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </section>
  );
}
