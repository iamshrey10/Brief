// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileRow } from "./profile-row";

beforeEach(() => {
  window.history.replaceState(null, "", "/dashboard/profile");
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function row(anchor = "bin") {
  return (
    <ProfileRow anchor={anchor} icon={<span>i</span>} title="Bin" description="Deleted documents stay for 7 days.">
      <section id={anchor}>Inside</section>
    </ProfileRow>
  );
}

describe("ProfileRow", () => {
  it("is closed until it is asked for, and marks itself for the tour by its anchor", () => {
    const { container } = render(row());

    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelector("details")).toHaveAttribute("data-tour", "bin");
  });

  it("opens and scrolls to its section when the address points at it", () => {
    window.history.replaceState(null, "", "/dashboard/profile#bin");
    const { container } = render(row());

    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("opens when the address changes to point at it later", () => {
    const { container } = render(row());

    act(() => {
      window.history.replaceState(null, "", "/dashboard/profile#bin");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("stays closed when the address points at another row", () => {
    window.history.replaceState(null, "", "/dashboard/profile#sharing");
    const { container } = render(row());

    expect(container.querySelector("details")).not.toHaveAttribute("open");
  });

  it("is a link when it has somewhere to go, and says so for the tour too", () => {
    render(<ProfileRow anchor="tour" href="/dashboard?tour=1" icon={<span>i</span>} title="Take the tour" description="A short walk." badge={<b>2</b>} />);

    const link = screen.getByRole("link", { name: /Take the tour/ });
    expect(link).toHaveAttribute("href", "/dashboard?tour=1");
    expect(link).toHaveAttribute("data-tour", "tour");
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
