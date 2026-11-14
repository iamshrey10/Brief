import { shortDay, type AdminDay } from "@/lib/admin";
import { cn } from "@/lib/utils";

/** One line on a chart: what it is called, what it measures on each day, and its colour. */
export type Line = { label: string; pick: (day: AdminDay) => number; color: string };

const WIDTH = 560;
const HEIGHT = 230;
const LEFT = 46;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 30;

/** A round number to top the scale with, so the gridlines read as 0, 5, 10 and not 0, 4.7, 9.4. */
export function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  for (const multiple of [1, 2, 2.5, 5, 10]) if (value <= multiple * step) return multiple * step;
  return 10 * step;
}

/** The days to name along the bottom of a chart: the first, the last, and a few between. */
export function labelIndexes(count: number): number[] {
  if (count <= 1) return [0];
  const wanted = count <= 7 ? count : 5;
  return Array.from(new Set(Array.from({ length: wanted }, (_, i) => Math.round((i * (count - 1)) / (wanted - 1)))));
}

/**
 * A line chart of the days, with a light grid, a scale, a name for some of the days and a dot for each day on the first line. It
 * is drawn as a picture that grows with its box. Each point also carries its value as a tooltip, and the same numbers are in a table
 * for a screen reader.
 */
export function LineChart({ title, days, lines, unit, note }: { title: string; days: AdminDay[]; lines: Line[]; unit: string; note?: string }) {
  const series = lines.map((line) => days.map(line.pick));
  const top = niceMax(Math.max(1, ...series.flat()));
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (index: number) => LEFT + (days.length <= 1 ? plotWidth / 2 : (index / (days.length - 1)) * plotWidth);
  const y = (value: number) => TOP + plotHeight - (value / top) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((share) => share * top);
  const path = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  const area = (values: number[]) => `${path(values)} L${x(values.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          {lines.map((line, index) => (
            <span key={line.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded" style={{ background: line.color }} />
              {line.label} <span className="font-medium text-foreground">{Math.round(total(series[index]) * 10) / 10}</span>
            </span>
          ))}
        </span>
      </figcaption>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <svg role="img" aria-label={`${title}, over ${days.length} days`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mt-2 h-auto w-full" preserveAspectRatio="xMidYMid meet">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} strokeDasharray={tick === 0 ? undefined : "3 4"} />
            <text x={LEFT - 7} y={y(tick) + 4.5} textAnchor="end" className="fill-muted-foreground" fontSize={13}>
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}
        {labelIndexes(days.length).map((index, position, all) => (
          <text key={index} x={x(index)} y={HEIGHT - 9} textAnchor={position === 0 ? "start" : position === all.length - 1 ? "end" : "middle"} className="fill-muted-foreground" fontSize={13}>
            {days[index] ? shortDay(days[index].day) : ""}
          </text>
        ))}
        {series[0] && <path d={area(series[0])} fill={lines[0].color} opacity={0.12} />}
        {series.map((values, index) => (
          <path key={lines[index].label} d={path(values)} fill="none" stroke={lines[index].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {days.map((day, index) => (
          <g key={day.day}>
            {days.length <= 31 && series[0] && <circle cx={x(index)} cy={y(series[0][index])} r={2.5} fill={lines[0].color} />}
            {/* A wide invisible strip for each day, so the pointer has something to rest on and the tooltip names the day. */}
            <rect x={x(index) - plotWidth / Math.max(1, days.length - 1) / 2} y={TOP} width={plotWidth / Math.max(1, days.length - 1)} height={plotHeight} fill="transparent">
              <title>{`${shortDay(day.day)}: ${lines.map((line, i) => `${series[i][index]} ${line.label.toLowerCase()}`).join(", ")}`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {lines.map((line) => (
              <th key={line.label} scope="col">
                {line.label} ({unit})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day, index) => (
            <tr key={day.day}>
              <th scope="row">{shortDay(day.day)}</th>
              {series.map((values, i) => (
                <td key={lines[i].label}>{values[index]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

/** A tiny line with no axes, for a number's tile: only its shape over the days. */
export function Sparkline({ values, color = "var(--primary)" }: { values: number[]; color?: string }) {
  const top = Math.max(1, ...values);
  const points = values.map((value, index) => `${((index / Math.max(1, values.length - 1)) * 100).toFixed(1)},${(26 - (value / top) * 24).toFixed(1)}`);
  return (
    <svg aria-hidden="true" viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full">
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Steps people pass through, each as a bar as wide as how many reached it, with the share of the step before and of the first. */
export function Funnel({ label, steps }: { label: string; steps: { name: string; count: number }[] }) {
  const first = Math.max(1, steps[0]?.count ?? 1);
  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {steps.map((step, index) => {
        const before = index === 0 ? null : steps[index - 1].count;
        return (
          <li key={step.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="text-foreground">{step.name}</span>
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{step.count}</span>
                {index > 0 && <> · {before === 0 ? "none" : `${Math.round((step.count / (before as number)) * 100)}%`} of the step before</>}
              </span>
            </div>
            <div aria-hidden="true" className="mt-1 h-3 overflow-hidden rounded-full bg-border">
              <div className={cn("h-full rounded-full bg-primary")} style={{ width: `${Math.max(step.count > 0 ? 2 : 0, (step.count / first) * 100)}%`, opacity: 1 - index * 0.14 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
