// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sharing", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/sharing")>()), joinShare: vi.fn() }));

import { joinShare } from "@/lib/sharing";
import { JoinForm } from "./join-form";

const joinMock = vi.mocked(joinShare);
beforeEach(() => joinMock.mockReset());
afterEach(cleanup);

const type = (value: string) => fireEvent.change(screen.getByLabelText("Six digit code"), { target: { value } });

describe("the join form", () => {
  it("only takes digits, at most six, and cannot be sent until there are six", () => {
    render(<JoinForm token="t" />);
    const button = screen.getByRole("button", { name: "Ask for access" });
    expect(button).toBeDisabled();

    type("12a3-45");
    expect(screen.getByLabelText("Six digit code")).toHaveValue("12345");
    expect(button).toBeDisabled();

    type("1234567890");
    expect(screen.getByLabelText("Six digit code")).toHaveValue("123456");
    expect(button).toBeEnabled();
  });

  it("asks the owner for access with the secret and the code, then says who must approve", async () => {
    joinMock.mockResolvedValue({ ok: true, result: { owner_email: "owner@example.com", status: "requested" } });
    render(<JoinForm token="secret-token" />);
    type("482913");

    fireEvent.click(screen.getByRole("button", { name: "Ask for access" }));

    expect(await screen.findByRole("status")).toHaveTextContent("owner@example.com");
    expect(joinMock).toHaveBeenCalledExactlyOnceWith("secret-token", "482913");
    expect(screen.getByRole("link", { name: "Go to Profile" })).toHaveAttribute("href", "/dashboard/profile#shared");
    expect(screen.queryByLabelText("Six digit code")).not.toBeInTheDocument();
  });

  it("names the owner by their name when they gave one", async () => {
    joinMock.mockResolvedValue({ ok: true, result: { owner_email: "owner@example.com", owner_name: "Maya Rao", status: "requested" } });
    render(<JoinForm token="t" />);
    type("482913");

    fireEvent.click(screen.getByRole("button", { name: "Ask for access" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Maya Rao");
    expect(status).not.toHaveTextContent("owner@example.com");
  });

  it("shows why it failed, keeps the code typed, and can be tried again", async () => {
    joinMock.mockResolvedValue({ ok: false, message: "That code isn't right." });
    render(<JoinForm token="t" />);
    type("111111");

    fireEvent.click(screen.getByRole("button", { name: "Ask for access" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't right");
    expect(screen.getByLabelText("Six digit code")).toHaveValue("111111");
    expect(screen.getByRole("button", { name: "Ask for access" })).toBeEnabled();
  });
});
