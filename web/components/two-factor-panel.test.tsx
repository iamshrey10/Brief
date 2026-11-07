// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,AAAA") } }));
vi.mock("@/lib/two-factor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/two-factor")>()),
  startSetup: vi.fn(),
  enableTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  makeNewRecoveryCodes: vi.fn(),
}));

import { disableTwoFactor, enableTwoFactor, makeNewRecoveryCodes, startSetup } from "@/lib/two-factor";
import { TwoFactorPanel } from "./two-factor-panel";

const startMock = vi.mocked(startSetup);
const enableMock = vi.mocked(enableTwoFactor);
const disableMock = vi.mocked(disableTwoFactor);
const newCodesMock = vi.mocked(makeNewRecoveryCodes);
const CODES = Array.from({ length: 10 }, (_, i) => `ABCDE-FGH${i}J`);

beforeEach(() => {
  startMock.mockReset();
  enableMock.mockReset();
  disableMock.mockReset();
  newCodesMock.mockReset();
  startMock.mockResolvedValue({ ok: true, result: { secret: "ABCDEFGHIJKLMNOP", otpauth_uri: "otpauth://totp/Brief" } });
});
afterEach(cleanup);

const region = () => screen.getByRole("region", { name: "Two step verification" });

describe("when it is off", () => {
  it("says what it is, that it is off, and offers to turn it on", () => {
    render(<TwoFactorPanel initialEnabled={false} initialCodesLeft={0} />);

    expect(region()).toHaveTextContent("Status: off");
    expect(region()).toHaveTextContent("authenticator app");
    expect(screen.getByRole("button", { name: "Turn on" })).toBeInTheDocument();
  });

  it("shows the QR code, the key in groups of four, and asks for the first code", async () => {
    render(<TwoFactorPanel initialEnabled={false} initialCodesLeft={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));

    expect(await screen.findByAltText("QR code for your authenticator app")).toBeInTheDocument();
    expect(region()).toHaveTextContent("ABCD EFGH IJKL MNOP");
    expect(screen.getByRole("button", { name: "Turn on" })).toBeDisabled();
  });

  it("only takes digits in the first code, six at most", async () => {
    render(<TwoFactorPanel initialEnabled={false} initialCodesLeft={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByLabelText("6 digit code");

    fireEvent.change(screen.getByLabelText("6 digit code"), { target: { value: "12a3-4567890" } });

    expect(screen.getByLabelText("6 digit code")).toHaveValue("123456");
    expect(screen.getByRole("button", { name: "Turn on" })).toBeEnabled();
  });

  it("shows why the setup could not start, and stays off", async () => {
    startMock.mockResolvedValue({ ok: false, message: "Couldn't start the setup just now." });
    render(<TwoFactorPanel initialEnabled={false} initialCodesLeft={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start");
    expect(region()).toHaveTextContent("Status: off");
  });

  it("keeps the setup open and says why when the first code is wrong", async () => {
    enableMock.mockResolvedValue({ ok: false, message: "That code isn't right." });
    render(<TwoFactorPanel initialEnabled={false} initialCodesLeft={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    fireEvent.change(await screen.findByLabelText("6 digit code"), { target: { value: "000000" } });

    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't right");
    expect(screen.getByAltText("QR code for your authenticator app")).toBeInTheDocument();
  });

  it("can be cancelled, which goes back to off", async () => {
    render(<TwoFactorPanel initialEnabled={false} initialCodesLeft={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByLabelText("6 digit code");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(region()).toHaveTextContent("Status: off");
    expect(screen.queryByAltText("QR code for your authenticator app")).not.toBeInTheDocument();
  });
});

describe("turning it on", () => {
  async function turnOn() {
    enableMock.mockResolvedValue({ ok: true, result: CODES });
    render(<TwoFactorPanel initialEnabled={false} initialCodesLeft={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    fireEvent.change(await screen.findByLabelText("6 digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByRole("list", { name: "Recovery codes" });
  }

  it("shows the ten recovery codes, once, and says it is on", async () => {
    await turnOn();

    expect(enableMock).toHaveBeenCalledExactlyOnceWith("123456");
    expect(within(screen.getByRole("list", { name: "Recovery codes" })).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByRole("status")).toHaveTextContent("Two step verification is on");
    expect(region()).toHaveTextContent("shown only now");
  });

  it("copies the codes, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await turnOn();

    fireEvent.click(screen.getByRole("button", { name: "Copy codes" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
  });

  it("does not claim a copy when the browser refuses it", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    await turnOn();

    fireEvent.click(screen.getByRole("button", { name: "Copy codes" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy codes" })).toBeInTheDocument());
  });

  it("forgets the codes once they are saved, and shows how many are left", async () => {
    await turnOn();

    fireEvent.click(screen.getByRole("button", { name: "I have saved them" }));

    expect(screen.queryByRole("list", { name: "Recovery codes" })).not.toBeInTheDocument();
    expect(region()).toHaveTextContent("Status: on · 10 recovery codes left");
  });
});

describe("when it is on", () => {
  it("says it is on and how many recovery codes are left, in the right number", () => {
    const first = render(<TwoFactorPanel initialEnabled initialCodesLeft={7} />);
    expect(region()).toHaveTextContent("Status: on · 7 recovery codes left");
    first.unmount();

    render(<TwoFactorPanel initialEnabled initialCodesLeft={1} />);
    expect(region()).toHaveTextContent("1 recovery code left");
  });

  it("turns it off with a code, and says so", async () => {
    disableMock.mockResolvedValue({ ok: true, result: true });
    render(<TwoFactorPanel initialEnabled initialCodesLeft={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    fireEvent.change(screen.getByLabelText(/Code, or a recovery code/), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));

    await waitFor(() => expect(region()).toHaveTextContent("Status: off"));
    expect(disableMock).toHaveBeenCalledExactlyOnceWith("123456");
  });

  it("stays on and says why when the code is wrong", async () => {
    disableMock.mockResolvedValue({ ok: false, message: "That code isn't right." });
    render(<TwoFactorPanel initialEnabled initialCodesLeft={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    fireEvent.change(screen.getByLabelText(/Code, or a recovery code/), { target: { value: "000000" } });

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't right");
    expect(screen.getByLabelText(/Code, or a recovery code/)).toBeInTheDocument();
  });

  it("can change its mind about turning it off", () => {
    render(<TwoFactorPanel initialEnabled initialCodesLeft={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(region()).toHaveTextContent("Status: on");
    expect(disableMock).not.toHaveBeenCalled();
  });

  it("makes a new set of recovery codes with a code, shows them once with a note that the old ones no longer work, and counts ten", async () => {
    newCodesMock.mockResolvedValue({ ok: true, result: CODES });
    render(<TwoFactorPanel initialEnabled initialCodesLeft={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Make new recovery codes" }));
    expect(region()).toHaveTextContent("The old ones stop working at once");
    fireEvent.change(screen.getByLabelText(/to make new ones/), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: "Make new codes" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Here are your new recovery codes. The old ones no longer work.");
    expect(newCodesMock).toHaveBeenCalledExactlyOnceWith("123456");
    expect(within(screen.getByRole("list", { name: "Recovery codes" })).getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "I have saved them" }));
    expect(region()).toHaveTextContent("10 recovery codes left");
  });

  it("says why when new recovery codes are refused, and keeps the old ones", async () => {
    newCodesMock.mockResolvedValue({ ok: false, message: "That code isn't right." });
    render(<TwoFactorPanel initialEnabled initialCodesLeft={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Make new recovery codes" }));
    fireEvent.change(screen.getByLabelText(/to make new ones/), { target: { value: "000000" } });

    fireEvent.click(screen.getByRole("button", { name: "Make new codes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't right");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(region()).toHaveTextContent("2 recovery codes left");
  });
});
