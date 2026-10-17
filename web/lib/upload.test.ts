import { describe, expect, it } from "vitest";
import { startFailureMessage } from "./upload";

const GENERIC = "could not start the upload";

function refusal(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Pick<Response, "status" | "json"> & { headers?: Headers } {
  return { status, json: async () => body, ...(headers ? { headers: new Headers(headers) } : {}) };
}

describe("startFailureMessage", () => {
  it("passes on the server's own sentence when the refusal is something the reader can act on", async () => {
    const detail = "You can keep up to 25 documents. Delete one you no longer need to upload another.";

    expect(await startFailureMessage(refusal(409, { detail }))).toBe(detail);
    expect(await startFailureMessage(refusal(400, { detail: "file is too large, 50MB max" }))).toBe(
      "file is too large, 50MB max",
    );
  });

  it("uses the generic line for server errors, whatever text they carry", async () => {
    expect(await startFailureMessage(refusal(500, { detail: "Traceback: db password" }))).toBe(GENERIC);
    expect(await startFailureMessage(refusal(502, { detail: "bad gateway" }))).toBe(GENERIC);
  });

  it("uses the generic line when signed out or rate limited, which have their own handling", async () => {
    expect(await startFailureMessage(refusal(401, { detail: "nope" }))).toBe(GENERIC);
    expect(await startFailureMessage(refusal(429, { error: "too many requests" }))).toBe(GENERIC);
  });

  it("uses the generic line when the detail is missing, empty, blank or not text", async () => {
    expect(await startFailureMessage(refusal(409, {}))).toBe(GENERIC);
    expect(await startFailureMessage(refusal(409, null))).toBe(GENERIC);
    expect(await startFailureMessage(refusal(409, { detail: "" }))).toBe(GENERIC);
    expect(await startFailureMessage(refusal(409, { detail: "   " }))).toBe(GENERIC);
    expect(await startFailureMessage(refusal(422, { detail: [{ msg: "field required" }] }))).toBe(GENERIC);
  });

  it("uses the generic line when the response is not JSON", async () => {
    const broken = {
      status: 409,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    };

    expect(await startFailureMessage(broken)).toBe(GENERIC);
  });
});

describe("startFailureMessage with its own fallback", () => {
  it("uses the fallback it is given instead of the start wording", async () => {
    expect(await startFailureMessage(refusal(500, {}), "could not confirm the upload")).toBe(
      "could not confirm the upload",
    );
    expect(await startFailureMessage(refusal(409, { detail: "" }), "could not confirm the upload")).toBe(
      "could not confirm the upload",
    );
  });

  it("still shows the server's own sentence when there is one", async () => {
    const detail = "this file does not look like the kind of file it was said to be";

    expect(await startFailureMessage(refusal(400, { detail }), "could not confirm the upload")).toBe(detail);
  });

  it("keeps the start wording when no fallback is given", async () => {
    expect(await startFailureMessage(refusal(502, {}))).toBe("could not start the upload");
  });
});

describe("startFailureMessage when the daily limit is reached", () => {
  const detail = "You have reached today's limit of 30 document reads. Try again tomorrow.";

  it("shows the server's own sentence for a 429 that carries one", async () => {
    expect(await startFailureMessage(refusal(429, { detail }))).toBe(detail);
  });

  it("uses the fallback it is given when the 429 has no usable sentence", async () => {
    expect(await startFailureMessage(refusal(429, {}), "could not confirm the upload")).toBe(
      "could not confirm the upload",
    );
    expect(await startFailureMessage(refusal(429, { detail: "  " }))).toBe(GENERIC);
  });

  it("still gives the generic line for a 401 that carries a sentence", async () => {
    expect(await startFailureMessage(refusal(401, { detail }))).toBe(GENERIC);
  });
});

describe("the reference on a failed upload step", () => {
  const ID = { "X-Request-ID": "3f2b8c1e-9d4a-4e07-8a55-0c1d2e3f4a5b" };

  it("is added after the generic line", async () => {
    expect(await startFailureMessage(refusal(502, {}, ID))).toBe(`${GENERIC} Reference: 3f2b8c1e`);
  });

  it("is added after the server's own sentence", async () => {
    const detail = "You can keep up to 25 documents. Delete one you no longer need to upload another.";

    expect(await startFailureMessage(refusal(409, { detail }, ID))).toBe(`${detail} Reference: 3f2b8c1e`);
  });

  it("is added after a daily limit sentence", async () => {
    expect(
      await startFailureMessage(refusal(429, { detail: "That is all the uploads for today." }, ID)),
    ).toBe("That is all the uploads for today. Reference: 3f2b8c1e");
  });

  it("is added after the line for another step too", async () => {
    expect(await startFailureMessage(refusal(500, {}, ID), "could not confirm the upload")).toBe(
      "could not confirm the upload Reference: 3f2b8c1e",
    );
  });

  it("is left out when the server sent no id", async () => {
    expect(await startFailureMessage(refusal(502, {}))).toBe(GENERIC);
  });
});
