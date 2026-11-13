// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dateBounds } from "@/lib/share-access";
import { AccessPicker } from "./access-picker";

afterEach(cleanup);

describe("AccessPicker", () => {
  it("offers the seven lengths and a date, with a week chosen to begin with", () => {
    render(<AccessPicker onChange={vi.fn()} />);

    const select = screen.getByLabelText("How long can they look?") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["1 hour", "6 hours", "1 day", "7 days", "15 days", "30 days", "90 days", "Until a date I pick..."]);
    expect(select.value).toBe("168");
  });

  it("reports the length that was picked, in hours", () => {
    const onChange = vi.fn();
    render(<AccessPicker onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "720" } });

    expect(onChange).toHaveBeenLastCalledWith({ kind: "hours", hours: 720 });
  });

  it("shows a calendar when a date is asked for, and reports nothing until a day is picked", () => {
    const onChange = vi.fn();
    render(<AccessPicker onChange={onChange} />);
    expect(screen.queryByLabelText("Last day")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "date" } });

    expect(screen.getByLabelText("Last day")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps the calendar to today and the 90 days after it", () => {
    render(<AccessPicker onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "date" } });

    const day = screen.getByLabelText("Last day");
    const { min, max } = dateBounds();
    expect(day).toHaveAttribute("min", min);
    expect(day).toHaveAttribute("max", max);
  });

  it("reports the close of the day that was picked", () => {
    const onChange = vi.fn();
    render(<AccessPicker onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "date" } });
    const { min } = dateBounds();

    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: min } });

    const choice = onChange.mock.calls.at(-1)![0];
    expect(choice.kind).toBe("until");
    const end = new Date(choice.until);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
    expect(dateBounds(end).min).toBe(min);
  });

  it("reports nothing again if the day is cleared, or is not allowed", () => {
    const onChange = vi.fn();
    render(<AccessPicker onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "date" } });

    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2001-01-01" } });

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("goes back to a length when one is picked again", () => {
    const onChange = vi.fn();
    render(<AccessPicker onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "date" } });

    fireEvent.change(screen.getByLabelText("How long can they look?"), { target: { value: "24" } });

    expect(onChange).toHaveBeenLastCalledWith({ kind: "hours", hours: 24 });
    expect(screen.queryByLabelText("Last day")).not.toBeInTheDocument();
  });
});
