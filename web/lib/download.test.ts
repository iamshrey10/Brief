// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadTextFile, safeFileName } from "./download";

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
