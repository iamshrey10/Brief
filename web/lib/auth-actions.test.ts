import { beforeEach, describe, expect, it, vi } from "vitest";

const deleted: string[] = [];
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: (name: string) => deleted.push(name) }) }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { signIn, signOut } from "@/auth";
import { signInToJoin, signInWithGoogle, signOutToHome } from "./auth-actions";

const signInMock = signIn as unknown as ReturnType<typeof vi.fn>;
const signOutMock = signOut as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  deleted.length = 0;
  signInMock.mockReset();
  signOutMock.mockReset();
});

describe("the sign in and sign out actions", () => {
  it("sign in with Google and land on the dashboard", async () => {
    await signInWithGoogle();

    expect(signInMock).toHaveBeenCalledExactlyOnceWith("google", { redirectTo: "/dashboard" });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("sign out and land on the landing page", async () => {
    await signOutToHome();

    expect(signOutMock).toHaveBeenCalledExactlyOnceWith({ redirectTo: "/" });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("sign out forgets that the second step was given, so the next sign in is asked again", async () => {
    await signOutToHome();

    expect(deleted).toEqual(["brief_2fa"]);
  });
});

describe("signing in from an invitation link", () => {
  const TOKEN = "A".repeat(43);

  it("signs in with Google and comes back to that same invitation", async () => {
    await signInToJoin(TOKEN);

    expect(signInMock).toHaveBeenCalledExactlyOnceWith("google", { redirectTo: `/shared/join/${TOKEN}` });
  });

  it.each(["", "short", "../../evil", "a/b".padEnd(30, "c"), `${TOKEN}?next=https://evil.example`, "A".repeat(201)])(
    "sends nobody anywhere for a secret shaped like %j",
    async (token) => {
      await expect(signInToJoin(token)).rejects.toThrow("NEXT_REDIRECT:/");
      expect(signInMock).not.toHaveBeenCalled();
    },
  );
});
