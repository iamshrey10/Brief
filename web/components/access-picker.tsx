"use client";

import { useId, useState } from "react";

import { ACCESS_OPTIONS, dateBounds, DEFAULT_ACCESS_HOURS, endOfDay, type AccessChoice } from "@/lib/share-access";

const CONTROL = "h-11 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const DATE = "date";

/**
 * Where a person says how long someone may look at their dashboard: one of seven lengths, or a day on the calendar.
 * It reports the choice, or null while a date has been asked for and not yet picked, so a button can wait for it.
 */
export function AccessPicker({
  onChange,
  initialHours = DEFAULT_ACCESS_HOURS,
  label = "How long can they look?",
  stacked = false,
}: {
  onChange: (choice: AccessChoice | null) => void;
  initialHours?: number;
  label?: string;
  /** Put the calendar under the length, not beside it, for a place that is only half as wide. */
  stacked?: boolean;
}) {
  const id = useId();
  const [kind, setKind] = useState<string>(String(initialHours));
  const [day, setDay] = useState("");
  const { min, max } = dateBounds();

  function pickLength(value: string) {
    setKind(value);
    if (value === DATE) return onChange(endOfDay(day) ? { kind: "until", until: endOfDay(day)! } : null);
    onChange({ kind: "hours", hours: Number(value) });
  }

  function pickDay(value: string) {
    setDay(value);
    const until = endOfDay(value);
    onChange(until ? { kind: "until", until } : null);
  }

  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex flex-col gap-2 sm:flex-row sm:items-end"}>
      <label htmlFor={`${id}-length`} className="flex flex-1 flex-col gap-1 text-sm font-medium text-foreground">
        {label}
        <select id={`${id}-length`} value={kind} onChange={(event) => pickLength(event.target.value)} className={CONTROL}>
          {ACCESS_OPTIONS.map((option) => (
            <option key={option.hours} value={option.hours}>
              {option.label}
            </option>
          ))}
          <option value={DATE}>Until a date I pick...</option>
        </select>
      </label>
      {kind === DATE && (
        <label htmlFor={`${id}-day`} className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Last day
          <input id={`${id}-day`} type="date" value={day} min={min} max={max} onChange={(event) => pickDay(event.target.value)} className={CONTROL} />
        </label>
      )}
    </div>
  );
}
