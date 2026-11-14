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
    expect(dialog()).toHaveAccessibleName("Brief in under 2 minutes");
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

  describe("counting, with nobody identified", () => {
    const counted = () => (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.map(([url]) => url);

    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    });
    afterEach(() => vi.unstubAllGlobals());

    it("counts that it was opened, once for each time it is opened, with a POST that carries nothing", () => {
      render(<DemoVideoButton />);

      fireEvent.click(screen.getByRole("button", { name: /watch how it works/i }));

      expect(counted()).toEqual(["/api/events/demo_opened"]);
      const [, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
      expect(init).toEqual({ method: "POST", keepalive: true });
    });

    it("counts that the video was watched to the end, once, however often it is replayed", () => {
      const { container } = render(<DemoVideoButton />);
      fireEvent.click(screen.getByRole("button", { name: /watch how it works/i }));
      const video = container.querySelector("video")!;

      fireEvent.ended(video);
      fireEvent.ended(video);

      expect(counted()).toEqual(["/api/events/demo_opened", "/api/events/demo_finished"]);
    });

    it("counts the end again when it is opened and watched a second time", () => {
      const { container } = render(<DemoVideoButton />);
      fireEvent.click(screen.getByRole("button", { name: /watch how it works/i }));
      fireEvent.ended(container.querySelector("video")!);
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      fireEvent.click(screen.getByRole("button", { name: /watch how it works/i }));
      fireEvent.ended(container.querySelector("video")!);

      expect(counted()).toEqual(["/api/events/demo_opened", "/api/events/demo_finished", "/api/events/demo_opened", "/api/events/demo_finished"]);
    });

    it("does not count an end that never came, because the window was closed part way", () => {
      render(<DemoVideoButton />);
      fireEvent.click(screen.getByRole("button", { name: /watch how it works/i }));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(counted()).toEqual(["/api/events/demo_opened"]);
    });

    it("carries on when counting fails, because the video matters more than the count", () => {
      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
      render(<DemoVideoButton />);

      expect(() => fireEvent.click(screen.getByRole("button", { name: /watch how it works/i }))).not.toThrow();
      expect(screen.getByLabelText(/^Brief in under 2 minutes$/)).toBeInTheDocument();
    });
  });
});
