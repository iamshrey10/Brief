// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { WelcomeSetup } from "./welcome-setup";

const saved = (extra: Record<string, unknown> = {}) => ({ ok: true, json: async () => ({ first_name: "Maya", last_name: "Rao", ...extra }) });

function show(first = "Maya", last = "Rao") {
  render(<WelcomeSetup initialFirst={first} initialLast={last} email="maya@example.com" />);
}

const sent = () => JSON.parse((vi.mocked(fetch).mock.calls[0][1] as { body: string }).body);

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(saved()));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WelcomeSetup", () => {
  it("offers the four reasons as a group of choices a person can pick one of", () => {
    show();

    const group = screen.getByRole("group", { name: "What brings you to Brief today?" });
    const choices = screen.getAllByRole("radio");
    expect(group).toBeInTheDocument();
    expect(choices.map((choice) => (choice as HTMLInputElement).value)).toEqual(["lease", "loan", "job_offer", "exploring"]);
    expect(screen.getByText("Check a lease")).toBeInTheDocument();
    expect(screen.getByText("Review a job offer")).toBeInTheDocument();
  });

  it("starts with nothing chosen, since the question can be skipped", () => {
    show();

    expect(screen.getAllByRole("radio").every((choice) => !(choice as HTMLInputElement).checked)).toBe(true);
  });

  it("sends the chosen reason along with the name", async () => {
    show();

    fireEvent.click(screen.getByRole("radio", { name: /Understand a loan/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(sent()).toEqual({ first_name: "Maya", last_name: "Rao", reason: "loan" });
  });

  it("lets a person skip the question, and sends no reason", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(sent()).toEqual({ first_name: "Maya", last_name: "Rao" });
  });

  it("goes on to the offer of a second lock on the account once saved", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(refresh).toHaveBeenCalled();
  });

  it("will not continue until both names are filled in", () => {
    show("", "");

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maya" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Rao" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("explains who sees the name, with the email address it replaces", () => {
    show();

    expect(screen.getByText(/people see this name instead of your email address \(maya@example.com\)/)).toBeInTheDocument();
  });

  it("shows a plain message and stays on the page when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, headers: new Headers() }));
    show();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your name just now");
    expect(push).not.toHaveBeenCalled();
  });
});
