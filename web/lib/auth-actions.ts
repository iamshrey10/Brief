"use server";

import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";

/** Starts Google sign in and lands on the dashboard. Used by every sign in button. */
export async function signInWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/dashboard" });
}

/** Ends the session and lands on the landing page. Used by every sign out button. */
export async function signOutToHome(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

/**
 * Starts Google sign in for someone who opened an invitation link, and brings them back to that same link afterwards.
 * The secret in the link is checked for its shape first, so this can never be made to send a person anywhere else.
 */
export async function signInToJoin(token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) redirect("/");
  await signIn("google", { redirectTo: `/shared/join/${token}` });
}
