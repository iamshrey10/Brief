// A tiny toolkit for drawing the diagrams as SVG: boxes with a coloured title band, zones, arrows with numbered badges.
// Every diagram is drawn on the same 1500 by 1040 canvas, in the same palette and type, so they read as one set.
export const W = 1500;
export const H = 1040;
export const COLOR = {
  person: "#52525b", web: "#4f46e5", api: "#0f766e", data: "#b45309", ai: "#9333ea", ext: "#2563eb", ci: "#475569", mon: "#15803d", rec: "#94949c",
};
const TINT = { person: "#f4f4f5", web: "#eeefff", api: "#e6f4f1", data: "#fdf3e3", ai: "#f5eafd", ext: "#e8f0fe", ci: "#eef0f3", mon: "#e8f6ec", rec: "#f6f6f7" };
export const tint = (c) => Object.entries(COLOR).find(([, v]) => v === c) ? TINT[Object.entries(COLOR).find(([, v]) => v === c)[0]] : "#fff";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SANS = "Arial, Helvetica, sans-serif";
const SERIF = '"Times New Roman", Times, serif';

export function text(x, y, s, { size = 18, weight = "normal", fill = "#1b1b1f", anchor = "start", family = SANS, italic = false } = {}) {
  return `<text x="${x}" y="${y}" font-family='${family}' font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`;
}

/** A box with a coloured band for its title and lines of text under it. */
export const STEP = (size) => size + 6;
export const needed = (lines, size = 17) => 40 + 16 + Math.max(lines.length, 1) * STEP(size) + 8;
export function box({ x, y, w, h = 0, title, lines = [], color, dashed = false, size = 17, titleSize = 20, chip }) {
  const band = 40;
  h = Math.max(h, needed(lines, size));
  const body = lines.map((l, i) => text(x + 14, y + band + 22 + i * STEP(size), l, { size })).join("");
  const stroke = dashed ? `stroke-dasharray="7 5"` : "";
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${tint(color)}" stroke="${color}" stroke-width="2" ${stroke}/>
<path d="M${x} ${y + 10} a10 10 0 0 1 10 -10 h${w - 20} a10 10 0 0 1 10 10 v${band - 10} h-${w} z" fill="${color}"/>
${text(x + 14, y + 27, title, { size: titleSize, weight: "bold", fill: "#fff" })}${chip ? `<rect x="${x + w - 14 - chip.length * 9.5 - 16}" y="${y + 8}" width="${chip.length * 9.5 + 16}" height="24" rx="12" fill="#fff"/>${text(x + w - 14 - (chip.length * 9.5 + 16) / 2, y + 25, chip, { size: 15, weight: "bold", fill: color, anchor: "middle" })}` : ""}${body}</g>`;
}

/** A dashed boundary around boxes, with a name on a tab. */
export function zone({ x, y, w, h, label, color }) {
  const tabW = label.length * 10.6 + 30;
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="none" stroke="${color}" stroke-width="2.4" stroke-dasharray="10 6"/>
<rect x="${x + 16}" y="${y - 17}" width="${tabW}" height="34" rx="8" fill="${color}"/>${text(x + 16 + tabW / 2, y + 6, label, { size: 19, weight: "bold", fill: "#fff", anchor: "middle" })}</g>`;
}

/** Boxes one under another, each as tall as its text needs. Returns the drawing, and where each box ended up so arrows can meet it. */
export function stack({ x, y, w, items, gap = 12 }) {
  let cursor = y;
  const placed = [];
  const parts = items.map((it) => {
    const h = Math.max(it.h ?? 0, needed(it.lines ?? [], it.size ?? 17));
    const drawing = box({ ...it, x, y: cursor, w, h });
    placed.push({ x, y: cursor, w, h, cy: cursor + h / 2 });
    cursor += h + gap;
    return drawing;
  });
  return { svg: parts.join(""), placed, bottom: cursor - gap };
}

export function badge(n, x, y, color = "#1b1b1f") {
  return `<g><circle cx="${x}" cy="${y}" r="15" fill="${color}"/>${text(x, y + 6, n, { size: 17, weight: "bold", fill: "#fff", anchor: "middle" })}</g>`;
}

/** A line through points with an arrowhead at the end (and at the start too when `both`). A label sits on a white tab at `at`. */
export function arrow({ pts, color = "#1b1b1f", dashed = false, label, at, both = false, n, nAt, labelSize = 16, anchor = "middle" }) {
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const id = `m${Math.abs(hash(color + d))}`;
  const head = `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8.5" markerHeight="8.5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`;
  let out = `<defs>${head}</defs><path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" ${dashed ? 'stroke-dasharray="9 6"' : ""} marker-end="url(#${id})"${both ? ` marker-start="url(#${id})"` : ""}/>`;
  if (label) {
    const lines = Array.isArray(label) ? label : [label];
    const widest = Math.max(...lines.map((l) => l.length)) * labelSize * 0.5 + 12;
    const [lx, ly] = at ?? pts[Math.floor(pts.length / 2)];
    const hh = lines.length * (labelSize + 3) + 6;
    const x0 = anchor === "middle" ? lx - widest / 2 : anchor === "start" ? lx - 4 : lx - widest + 4;
    out += `<rect x="${x0}" y="${ly - hh / 2}" width="${widest}" height="${hh}" rx="5" fill="#fff" fill-opacity="0.94"/>`;
    out += lines.map((l, i) => text(anchor === "middle" ? lx : anchor === "start" ? lx + 2 : lx - 2, ly - hh / 2 + labelSize + 1 + i * (labelSize + 3), l, { size: labelSize, anchor, fill: "#2b2b31" })).join("");
  }
  if (n) out += badge(n, ...(nAt ?? pts[0]));
  return out;
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

export function title(main, sub) {
  return text(30, 46, main, { size: 36, weight: "bold", family: SERIF, fill: "#25252b" }) + text(30, 76, sub, { size: 19, fill: "#55555e", italic: true });
}

/** Wraps the pieces of a diagram into one SVG on the shared canvas. */
export function svg(body, { height = H } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}"><rect width="${W}" height="${height}" fill="#ffffff"/>${body}</svg>`;
}

export function legend(items, x, y) {
  return items.map((it, i) => `<g>${it.line ? `<path d="M${x} ${y + i * 30} h46" stroke="${it.color}" stroke-width="2.6" ${it.dashed ? 'stroke-dasharray="9 6"' : ""}/>` : `<rect x="${x}" y="${y + i * 30 - 12}" width="46" height="22" rx="5" fill="${tint(it.color)}" stroke="${it.color}" stroke-width="2"/>`}${text(x + 58, y + i * 30 + 5, it.label, { size: 16 })}</g>`).join("");
}
