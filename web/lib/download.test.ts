// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBytes, downloadTextFile, safeFileName, saveFile } from "./download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("downloadTextFile", () => {
  it("saves the text under the given name, then cleans up after itself", () => {
    vi.useFakeTimers();
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
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});

describe("downloadBytes", () => {
  it("saves bytes under the given name with the given type, and withdraws the file only after a minute", async () => {
    vi.useFakeTimers();
    const create = vi.fn().mockReturnValue("blob:bytes");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadBytes("summary.pdf", new Uint8Array([37, 80, 68, 70]), "application/pdf");

    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(4);
    expect(click.mock.contexts[0]).toMatchObject({ download: "summary.pdf" });
    vi.advanceTimersByTime(59_000);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
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

describe("saveFile", () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);

  function setup({ touch, share, canShare }: { touch: boolean; share?: ReturnType<typeof vi.fn>; canShare?: boolean }) {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: touch && query === "(pointer: coarse)" }));
    Object.assign(navigator, { share, canShare: share ? () => canShare ?? true : undefined });
    Object.assign(URL, { createObjectURL: vi.fn().mockReturnValue("blob:x"), revokeObjectURL: vi.fn() });
    return vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  }

  it("offers a phone its share sheet, with the file", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const click = setup({ touch: true, share });

    expect(await saveFile("summary.pdf", bytes, "application/pdf")).toBe("shared");
    const arg = share.mock.calls[0][0] as { files: File[]; title: string };
    expect(arg.files[0].name).toBe("summary.pdf");
    expect(arg.files[0].type).toBe("application/pdf");
    expect(arg.title).toBe("summary.pdf");
    expect(click).not.toHaveBeenCalled();
  });

  it("counts someone closing the share sheet as a choice, not a failure, and does not download as well", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    const click = setup({ touch: true, share });

    expect(await saveFile("summary.pdf", bytes, "application/pdf")).toBe("cancelled");
    expect(click).not.toHaveBeenCalled();
  });

  it("falls back to the plain download when the share sheet fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("not allowed"));
    const click = setup({ touch: true, share });

    expect(await saveFile("summary.pdf", bytes, "application/pdf")).toBe("downloaded");
    expect(click).toHaveBeenCalledOnce();
  });

  it("falls back to the plain download when the device cannot share files", async () => {
    const share = vi.fn();
    const click = setup({ touch: true, share, canShare: false });

    expect(await saveFile("summary.pdf", bytes, "application/pdf")).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  it("downloads on a computer even if it could share", async () => {
    const share = vi.fn();
    const click = setup({ touch: false, share });

    expect(await saveFile("summary.pdf", bytes, "application/pdf")).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  it("downloads when there is no share feature at all, or no way to ask about the screen", async () => {
    const click = setup({ touch: true });
    expect(await saveFile("summary.pdf", bytes, "application/pdf")).toBe("downloaded");

    vi.stubGlobal("matchMedia", undefined);
    expect(await saveFile("summary.pdf", bytes, "application/pdf")).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(2);
  });
});
