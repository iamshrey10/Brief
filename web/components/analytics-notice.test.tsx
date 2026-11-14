// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AnalyticsChoiceControl, AnalyticsNotice } from "./analytics-notice";

type W = Window & Record<string, unknown>;
const ID = "G-TEST123456";

beforeEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = "";
  delete (window as unknown as W).dataLayer;
  delete (window as unknown as W)[`ga-disable-${ID}`];
});
afterEach(cleanup);

const scripts = () => document.head.querySelectorAll("script#google-analytics-script").length;

describe("AnalyticsNotice", () => {
  it("shows nothing when no measurement id is set", () => {
    render(<AnalyticsNotice id={null} />);
    expect(screen.queryByRole("region", { name: "Counting visits" })).toBeNull();
    expect(scripts()).toBe(0);
  });

  it("asks first, and loads nothing before an answer", () => {
    render(<AnalyticsNotice id={ID} />);
    expect(screen.getByRole("region", { name: "Counting visits" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("href", "/privacy#cookies");
    expect(scripts()).toBe(0);
  });

  it("starts counting after yes, and the notice goes", async () => {
    render(<AnalyticsNotice id={ID} />);
    await userEvent.click(screen.getByRole("button", { name: "Yes, count it" }));

    expect(screen.queryByRole("region", { name: "Counting visits" })).toBeNull();
    expect(scripts()).toBe(1);
    expect(window.localStorage.getItem("brief-analytics-choice")).toBe("accepted");
  });

  it("counts nothing after no, and the notice goes", async () => {
    render(<AnalyticsNotice id={ID} />);
    await userEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(screen.queryByRole("region", { name: "Counting visits" })).toBeNull();
    expect(scripts()).toBe(0);
    expect(window.localStorage.getItem("brief-analytics-choice")).toBe("declined");
  });

  it("counts straight away for someone who already said yes, and stops when the page is left", () => {
    window.localStorage.setItem("brief-analytics-choice", "accepted");
    const view = render(<AnalyticsNotice id={ID} />);

    expect(screen.queryByRole("region", { name: "Counting visits" })).toBeNull();
    expect(scripts()).toBe(1);
    expect((window as unknown as W)[`ga-disable-${ID}`]).toBe(false);

    view.unmount();
    expect((window as unknown as W)[`ga-disable-${ID}`]).toBe(true);
  });

  it("never asks someone who already said no", () => {
    window.localStorage.setItem("brief-analytics-choice", "declined");
    render(<AnalyticsNotice id={ID} />);
    expect(screen.queryByRole("region", { name: "Counting visits" })).toBeNull();
    expect(scripts()).toBe(0);
  });
});

describe("AnalyticsChoiceControl", () => {
  it("shows nothing without a measurement id", () => {
    const { container } = render(<AnalyticsChoiceControl id={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says it is off until turned on, and can be turned on and off again", async () => {
    render(<AnalyticsChoiceControl id={ID} />);
    expect(screen.getByText("Counting visits is off in this browser.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Turn it on" }));
    expect(screen.getByText("Counting visits is on in this browser.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Turn it off" }));
    expect(screen.getByText("Counting visits is off in this browser.")).toBeInTheDocument();
    expect(window.localStorage.getItem("brief-analytics-choice")).toBe("declined");
  });
});
