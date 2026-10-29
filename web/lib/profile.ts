/** The letter shown in the round badge on the Profile page: the first letter of the address, in capitals. */
export function initialOf(email: string): string {
  return email.trim().charAt(0).toUpperCase() || "?";
}
