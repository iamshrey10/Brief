import { describe, expect, it } from "vitest";
import { startFailureMessage } from "./upload";

const GENERIC = "could not start the upload";

function refusal(status: number, body: unknown): Pick<Response, "status" | "json"> {
  return { status, json: async () => body };
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
    expect(await startFailureMessage(refusal(429, { detail: "slow down" }))).toBe(GENERIC);
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
