// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account";
import { DeleteAccount } from "./delete-account";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account")>();
  return { ...actual, deleteAccount: vi.fn() };
});

const deleteMock = vi.mocked(deleteAccount);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function open() {
  const user = userEvent.setup();
  const onDeleted = vi.fn();
  render(<DeleteAccount onDeleted={onDeleted} />);
  await user.click(screen.getByRole("button", { name: "Delete my account" }));
  return { user, onDeleted };
}

const confirmButton = () => screen.getByRole("button", { name: "Delete everything" });

describe("DeleteAccount", () => {
  it("shows only a quiet button until it is pressed", () => {
    render(<DeleteAccount onDeleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("explains what is lost and that it cannot be undone, before anything is deleted", async () => {
    await open();

    const question = screen.getByRole("group", { name: "Delete your account" });
    expect(question).toHaveTextContent("every document you uploaded");
    expect(question).toHaveTextContent("files");
    expect(question).toHaveTextContent("can't be undone");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("needs DELETE typed exactly before the button works", async () => {
    const { user } = await open();
    expect(confirmButton()).toBeDisabled();

    for (const wrong of ["delete", "DELET", "DELETE ME", "yes"]) {
      await user.clear(screen.getByLabelText(/type DELETE/i));
      await user.type(screen.getByLabelText(/type DELETE/i), wrong);
      expect(confirmButton()).toBeDisabled();
    }

    await user.clear(screen.getByLabelText(/type DELETE/i));
    await user.type(screen.getByLabelText(/type DELETE/i), "DELETE");
    expect(confirmButton()).toBeEnabled();
  });

  it("puts focus in the box so nothing can be confirmed by a stray Enter", async () => {
    await open();

    expect(screen.getByLabelText(/type DELETE/i)).toHaveFocus();
  });

  it("does not delete when Enter is pressed before DELETE is typed", async () => {
    const { user } = await open();

    await user.keyboard("{Enter}");

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("refuses a submit with the wrong word even if the form is submitted some other way", async () => {
    const { user } = await open();
    const form = screen.getByRole("group").querySelector("form") as HTMLFormElement;

    for (const wrong of ["", "delete", "Delete", " DELETE", "DELETE "]) {
      await user.clear(screen.getByLabelText(/type DELETE/i));
      if (wrong) await user.type(screen.getByLabelText(/type DELETE/i), wrong);
      fireEvent.submit(form);
    }

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("goes back without deleting on Cancel, and focus returns to the opening button", async () => {
    const { user } = await open();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete my account" })).toHaveFocus();
  });

  it("goes back without deleting on Escape", async () => {
    const { user } = await open();

    await user.keyboard("{Escape}");

    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("deletes once when confirmed, then tells the page so it can sign out", async () => {
    deleteMock.mockResolvedValue({ ok: true });
    const { user, onDeleted } = await open();
    await user.type(screen.getByLabelText(/type DELETE/i), "DELETE");

    await user.click(confirmButton());

    expect(deleteMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("also deletes when Enter is pressed after DELETE is typed", async () => {
    deleteMock.mockResolvedValue({ ok: true });
    const { user, onDeleted } = await open();

    await user.type(screen.getByLabelText(/type DELETE/i), "DELETE{Enter}");

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("shows why and stays open when it fails, and does not sign out", async () => {
    deleteMock.mockResolvedValue({ ok: false, message: "Some of your files could not be removed, try again." });
    const { user, onDeleted } = await open();
    await user.type(screen.getByLabelText(/type DELETE/i), "DELETE");

    await user.click(confirmButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be removed");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(confirmButton()).toBeEnabled();
  });

  it("locks everything while deleting, ignores Escape, and cannot be started twice", async () => {
    deleteMock.mockReturnValue(new Promise(() => {}));
    const { user } = await open();
    await user.type(screen.getByLabelText(/type DELETE/i), "DELETE");

    await user.click(confirmButton());

    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText(/type DELETE/i)).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
    expect(screen.getByRole("group")).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("group").querySelector("form") as HTMLFormElement);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("starts clean each time it is opened", async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText(/type DELETE/i), "DELETE");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(screen.getByLabelText(/type DELETE/i)).toHaveValue("");
    expect(confirmButton()).toBeDisabled();
  });
});
