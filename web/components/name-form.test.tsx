// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/name", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/name")>()), saveName: vi.fn() }));

import { saveName } from "@/lib/name";
import { NameForm } from "./name-form";

const saveMock = vi.mocked(saveName);
beforeEach(() => saveMock.mockReset());
afterEach(cleanup);

const fill = (first: string, last: string) => {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: first } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: last } });
};

describe("the name form", () => {
  it("starts with what it was given, and cannot be sent while either name is empty", () => {
    render(<NameForm initialFirst="Maya" initialLast="" onSaved={() => {}} />);

    expect(screen.getByLabelText("First name")).toHaveValue("Maya");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fill("Maya", "   ");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fill("Maya", "Rao");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("saves both names and tells whoever is listening what was saved", async () => {
    saveMock.mockResolvedValue({ ok: true, result: { first_name: "Maya", last_name: "Rao" } });
    const onSaved = vi.fn();
    render(<NameForm onSaved={onSaved} submitLabel="Save name" />);
    fill("Maya", "Rao");

    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith({ first_name: "Maya", last_name: "Rao" }));
    expect(saveMock).toHaveBeenCalledExactlyOnceWith("Maya", "Rao");
  });

  it("shows why it failed and keeps what was typed", async () => {
    saveMock.mockResolvedValue({ ok: false, message: "Use letters." });
    const onSaved = vi.fn();
    render(<NameForm onSaved={onSaved} />);
    fill("M4ya", "Rao");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Use letters.");
    expect(screen.getByLabelText("First name")).toHaveValue("M4ya");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("offers Cancel only when it can be cancelled", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<NameForm onSaved={() => {}} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    rerender(<NameForm onSaved={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
