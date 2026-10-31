// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBytes, downloadTextFile, safeFileName } from "./download";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadTextFile", () => {
  it("saves the text under the given name, then cleans up after itself", () => {
    const create = vi.fn().mockReturnValue("blob:fake");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadTextFile("dates.ics", "BEGIN:VCALENDAR", "text/calendar");

    expect(create).toHaveBeenCalledOnce();
    expect((create.mock.calls[0][0] as Blob).type).toBe("text/calendar");
    expect(click).toHaveBeenCalledOnce();
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("dates.ics");
    expect(link.href).toBe("blob:fake");
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});

describe("downloadBytes", () => {
  it("saves bytes under the given name with the given type, then cleans up after itself", async () => {
    const create = vi.fn().mockReturnValue("blob:bytes");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadBytes("summary.pdf", new Uint8Array([37, 80, 68, 70]), "application/pdf");

    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(4);
    expect(click.mock.contexts[0]).toMatchObject({ download: "summary.pdf" });
    expect(revoke).toHaveBeenCalledWith("blob:bytes");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});

describe("safeFileName", () => {
  it.each([
    ["sample-lease.pdf", "dates", "ics", "sample-lease-dates.ics"],
    ["Deposit Agreement EMV.pdf", "dates", "ics", "Deposit-Agreement-EMV-dates.ics"],
    ["../../etc/passwd", "dates", "ics", "etcpasswd-dates.ics"],
    ["???.pdf", "dates", "ics", "brief-dates.ics"],
    ["no extension", "questions", "txt", "no-extension-questions.txt"],
  ])("turns %s into a safe name", (name, suffix, extension, expected) => {
    expect(safeFileName(name, suffix, extension)).toBe(expected);
  });
});
