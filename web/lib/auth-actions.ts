"use server";

import { signIn, signOut } from "@/auth";

/** Starts Google sign in and lands on the dashboard. Used by every sign in button. */
export async function signInWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/dashboard" });
}

/** Ends the session and lands on the landing page. Used by every sign out button. */
export async function signOutToHome(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
