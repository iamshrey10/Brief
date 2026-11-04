import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/backend", () => ({ backendGet: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { auth } from "@/auth";
import { backendGet } from "@/lib/backend";
import WelcomePage, { metadata } from "./page";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const getMock = backendGet as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  authMock.mockReset();
  getMock.mockReset();
  authMock.mockResolvedValue({ user: { email: "maya@example.com", name: "Maya van Rao" } });
  getMock.mockResolvedValue({ id: "u1", email: "maya@example.com", first_name: null, last_name: null });
});

describe("the welcome page", () => {
  it("sends a visitor who is not signed in to the landing page, asking for nothing", async () => {
    authMock.mockResolvedValue(null);

    await expect(WelcomePage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("sends someone who already gave their name on to the Dashboard", async () => {
    getMock.mockResolvedValue({ id: "u1", email: "maya@example.com", first_name: "Maya", last_name: "Rao" });

    await expect(WelcomePage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("asks for the name, filled in from the Google name, and says why", async () => {
    const html = renderToStaticMarkup(await WelcomePage());

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('value="Maya"');
    expect(html).toContain('value="van Rao"');
    expect(html).toContain("instead of your email address");
  });

  it("is not indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
