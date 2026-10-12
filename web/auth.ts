import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google is the only way in. `authorized` is what the middleware asks for every protected page:
 * without it, Auth.js lets everyone through, signed in or not. Someone who is not signed in is sent to
 * the landing page, where the Sign in with Google button is, instead of Auth.js's own plain sign in page.
 */
export const authConfig = {
  providers: [Google],
  pages: { signIn: "/" },
  callbacks: {
    authorized: ({ auth }: { auth: { user?: { email?: string | null } | null } | null }) =>
      Boolean(auth?.user?.email),
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
