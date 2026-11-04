// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/two-factor", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/two-factor")>()), verifyCode: vi.fn() }));

import { verifyCode } from "@/lib/two-factor";
import { VerifyForm } from "./verify-form";

const verifyMock = vi.mocked(verifyCode);
beforeEach(() => {
  verifyMock.mockReset();
  push.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

const type = (value: string) => fireEvent.change(screen.getByLabelText("Code from your authenticator app"), { target: { value } });

describe("the code form", () => {
  it("cannot be sent with nothing typed", () => {
    render(<VerifyForm next="/dashboard" problem={false} />);

    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
    type("123456");
    expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled();
  });

  it("sends the code, without remembering, and goes on to where the person was going", async () => {
    verifyMock.mockResolvedValue({ ok: true, result: { usedRecoveryCode: false } });
    render(<VerifyForm next="/dashboard/documents" problem={false} />);
    type("123456");

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/dashboard/documents"));
    expect(verifyMock).toHaveBeenCalledExactlyOnceWith("123456", false);
    expect(refresh).toHaveBeenCalled();
  });

  it("asks for the browser to be remembered only when the box is ticked", async () => {
    verifyMock.mockResolvedValue({ ok: true, result: { usedRecoveryCode: false } });
    render(<VerifyForm next="/dashboard" problem={false} />);
    type("123456");
    fireEvent.click(screen.getByLabelText("Remember this browser for 30 days"));

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(verifyMock).toHaveBeenCalledExactlyOnceWith("123456", true));
  });

  it("shows why a code failed, goes nowhere, and can be tried again", async () => {
    verifyMock.mockResolvedValue({ ok: false, message: "That code isn't right." });
    render(<VerifyForm next="/dashboard" problem={false} />);
    type("000000");

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't right");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Verify" })).toBeEnabled();
    expect(screen.getByLabelText("Code from your authenticator app")).toHaveValue("000000");
  });

  it("says a recovery code was used, and that it cannot be used again", async () => {
    verifyMock.mockResolvedValue({ ok: true, result: { usedRecoveryCode: true } });
    render(<VerifyForm next="/dashboard" problem={false} />);
    type("AAAAA-BBBBB");

    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("status")).toHaveTextContent("recovery code");
  });

  it("says at once that the check could not be made, when it was sent here for that reason", () => {
    render(<VerifyForm next="/dashboard" problem />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't check your sign in just now");
  });
});
