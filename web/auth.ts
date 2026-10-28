import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { e2eSignInEnabled, e2eUserFor } from "@/lib/e2e-auth";

/**
 * Google is the only way in. `authorized` is what the proxy asks for every protected page:
 * without it, Auth.js lets everyone through, signed in or not. Someone who is not signed in is sent to
 * the landing page, where the Sign in with Google button is, instead of Auth.js's own plain sign in page.
 * `prompt: select_account` makes Google ask which account every time, so a signed-out browser does not
 * sign straight back in as whoever Google remembers.
 */
export const authConfig = {
  providers: [
    Google({ authorization: { params: { prompt: "select_account" } } }),
    // Only for the browser tests, and only outside production: see lib/e2e-auth.ts.
    ...(e2eSignInEnabled(process.env)
      ? [
          Credentials({
            id: "e2e",
            credentials: { email: {} },
            authorize: async (credentials) => e2eUserFor(credentials?.email),
          }),
        ]
      : []),
  ],
  pages: { signIn: "/" },
  callbacks: {
    authorized: ({ auth }: { auth: { user?: { email?: string | null } | null } | null }) =>
      Boolean(auth?.user?.email),
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
