// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/name", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/name")>()), saveName: vi.fn() }));

import { saveName } from "@/lib/name";
import { ProfileAccount } from "./profile-account";

const saveMock = vi.mocked(saveName);
beforeEach(() => saveMock.mockReset());
afterEach(cleanup);

describe("the account card", () => {
  it("shows the name with the address beneath it", () => {
    render(<ProfileAccount email="maya@example.com" firstName="Maya" lastName="Rao" />);

    const card = screen.getByRole("region", { name: "Account" });
    expect(card).toHaveTextContent("Maya Rao");
    expect(card).toHaveTextContent("maya@example.com");
    expect(card).toHaveTextContent("Signed in with Google");
    expect(screen.getByRole("button", { name: "Edit name" })).toBeInTheDocument();
  });

  it("shows the address and offers to add a name when there is none", () => {
    render(<ProfileAccount email="maya@example.com" firstName={null} lastName={null} />);

    expect(screen.getByRole("region", { name: "Account" })).toHaveTextContent("maya@example.com");
    expect(screen.getByRole("button", { name: "Add your name" })).toBeInTheDocument();
  });

  it("changes the name in place and closes the form", async () => {
    saveMock.mockResolvedValue({ ok: true, result: { first_name: "Mia", last_name: "Rao" } });
    render(<ProfileAccount email="maya@example.com" firstName="Maya" lastName="Rao" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Mia" } });

    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Account" })).toHaveTextContent("Mia Rao"));
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
  });

  it("leaves the name as it was when the change is cancelled", () => {
    render(<ProfileAccount email="maya@example.com" firstName="Maya" lastName="Rao" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Zed" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("region", { name: "Account" })).toHaveTextContent("Maya Rao");
    expect(saveMock).not.toHaveBeenCalled();
  });
});
