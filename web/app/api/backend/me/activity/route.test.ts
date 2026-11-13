import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proxy", () => ({ proxyPost: vi.fn() }));

import { proxyPost } from "@/lib/proxy";
import { POST } from "./route";

const postMock = vi.mocked(proxyPost);

beforeEach(() => {
  postMock.mockReset();
  postMock.mockResolvedValue(new Response(null, { status: 204 }));
});

describe("the activity route", () => {
  it("passes the signal on to the backend, with no body", async () => {
    const response = await POST();

    expect(postMock).toHaveBeenCalledExactlyOnceWith("/me/activity");
    expect(response.status).toBe(204);
  });
});
