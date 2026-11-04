/** The letter shown in the round badge on the Profile page: the first letter of the address, in capitals. */
export function initialOf(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "?";
}

/** The letter in the round badge for someone who has given a name: the first letter of it, else of the address. */
export function badgeLetter(name: string | null | undefined, email: string): string {
  return initialOf(name?.trim() || email);
}

/** Splits what Google calls a person ("Maya Rao", "Maya van der Rao") into a first name and the rest, to fill the form in. */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/**
 * Whether this person still has to give their name. Only a clear answer from the backend that there is none counts:
 * if it could not be reached, nobody is sent to a form because of that.
 */
export function needsName(me: unknown): boolean {
  const person = me as { id?: unknown; first_name?: unknown } | null;
  return typeof person?.id === "string" && !person.first_name;
}

/** "Maya Rao" when there is a name, otherwise the address, so something always names the person. */
export function personLabel(name: string | null | undefined, email: string): string {
  return name?.trim() || email;
}
