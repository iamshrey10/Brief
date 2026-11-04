"use client";

import { useRouter } from "next/navigation";

import { NameForm } from "@/components/name-form";

/** The first screen after a first sign in: asks for the name other people will see, then goes to the Dashboard. */
export function WelcomeName({ initialFirst, initialLast }: { initialFirst: string; initialLast: string }) {
  const router = useRouter();
  return (
    <NameForm
      initialFirst={initialFirst}
      initialLast={initialLast}
      onSaved={() => {
        // Next, the offer of a second lock on the account.
        router.push("/dashboard/profile#two-step");
        router.refresh();
      }}
    />
  );
}
