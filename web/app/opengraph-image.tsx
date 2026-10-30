import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The card a link to Brief shows when shared, for example on LinkedIn. Same colors and serif as the site.
export const alt = "Brief: Every clause, explained.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1A1A1E";
const PAPER = "#FAFAF7";
const INDIGO = "#4F46E5";
const MUTED = "#5B5B66";

export default async function Image() {
  // The image is drawn once when the site is built, so the font only needs to exist at build time.
  const fraunces = await readFile(
    join(process.cwd(), "node_modules/@fontsource/fraunces/files/fraunces-latin-600-normal.woff"),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: PAPER,
          color: INK,
          fontFamily: "Fraunces",
        }}
      >
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            fontSize: 26,
            color: INDIGO,
            border: `2px solid ${INDIGO}33`,
            background: "#EEEFFF",
            borderRadius: 999,
            padding: "8px 22px",
          }}
        >
          For loans, leases and job offers
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 136, lineHeight: 1 }}>
          Brief<span style={{ color: INDIGO }}>.</span>
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 60, color: INDIGO }}>Every clause, explained.</div>
        <div style={{ display: "flex", marginTop: 34, fontSize: 30, color: MUTED, maxWidth: 900, lineHeight: 1.35 }}>
          Key terms, the questions a document leaves open, and answers checked against its exact words.
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Fraunces", data: fraunces, style: "normal", weight: 600 }] },
  );
}
