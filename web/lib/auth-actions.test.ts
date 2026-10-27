import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { signIn, signOut } from "@/auth";
import { signInWithGoogle, signOutToHome } from "./auth-actions";

const signInMock = signIn as unknown as ReturnType<typeof vi.fn>;
const signOutMock = signOut as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
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
});
