import { expect, test } from "@playwright/test";

test.describe("someone who is not signed in", () => {
  for (const path of ["/dashboard", "/dashboard/documents/00000000-0000-0000-0000-000000000000"]) {
    test(`is sent to the landing page from ${path}`, async ({ page }) => {
      await page.goto(path);

      expect(new URL(page.url()).pathname).toBe("/");
      await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    });
  }

  for (const path of [
    "/api/backend/documents",
    "/api/backend/me",
    "/api/backend/me/usage",
    "/api/backend/documents/00000000-0000-0000-0000-000000000000/key-terms",
    "/api/backend/documents/00000000-0000-0000-0000-000000000000/checklist",
  ]) {
    test(`gets nothing from ${path}`, async ({ request }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(401);
    });
  }

  test("cannot delete or rename a document", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";

    expect((await request.delete(`/api/backend/documents/${id}`)).status()).toBe(401);
    expect(
      (await request.patch(`/api/backend/documents/${id}`, { data: { filename: "x.pdf" } })).status(),
    ).toBe(401);
  });

  test("cannot ask a question of a document", async ({ request }) => {
    const response = await request.post("/api/backend/documents/00000000-0000-0000-0000-000000000000/ask", {
      data: { question: "What is the rent?" },
    });

    expect(response.status()).toBe(401);
  });
});
