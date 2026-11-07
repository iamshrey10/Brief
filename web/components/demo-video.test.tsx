// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoVideoButton } from "./demo-video";

beforeEach(() => {
  // jsdom does not open or close a modal window, so these stand in for it.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});
afterEach(cleanup);

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;

describe("DemoVideoButton", () => {
  it("is a button that says what it does, and fetches no video until it is pressed", () => {
    render(<DemoVideoButton />);

    expect(screen.getByRole("button", { name: "Watch how it works" })).toBeInTheDocument();
    expect(document.querySelector("video")).toBeNull();
  });

  it("opens a window with the video, its captions and a poster, ready to play", () => {
    render(<DemoVideoButton />);

    fireEvent.click(screen.getByRole("button", { name: "Watch how it works" }));

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("poster", "/demo/brief-demo-poster.jpg");
    expect(video.querySelector("source")).toHaveAttribute("src", "/demo/brief-demo.mp4");
    const captions = video.querySelector("track") as HTMLTrackElement;
    expect(captions).toHaveAttribute("kind", "captions");
    expect(captions).toHaveAttribute("src", "/demo/brief-demo.vtt");
    expect(captions).toHaveAttribute("srclang", "en");
    expect(dialog()).toHaveAccessibleName("Brief in 35 seconds");
  });

  it("is put away, and the video taken out so it stops, by the Close button", () => {
    render(<DemoVideoButton />);
    fireEvent.click(screen.getByRole("button", { name: "Watch how it works" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(dialog()).not.toHaveAttribute("open");
    expect(document.querySelector("video")).toBeNull();
  });

  it("is put away by a click outside the video, but not by a click on it", () => {
    render(<DemoVideoButton />);
    fireEvent.click(screen.getByRole("button", { name: "Watch how it works" }));

    fireEvent.click(document.querySelector("video") as HTMLVideoElement);
    expect(dialog()).toHaveAttribute("open");

    fireEvent.click(dialog());
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("can be opened again after it was put away", () => {
    render(<DemoVideoButton />);
    fireEvent.click(screen.getByRole("button", { name: "Watch how it works" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Watch how it works" }));

    expect(document.querySelector("video")).not.toBeNull();
  });
});
