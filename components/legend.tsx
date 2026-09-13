"use client";

import { BIRD_SPAN_PX, BIRD_STROKE_PX, birdWings } from "@/lib/bird";
import { drawnBirdDensity, VID_SCALE_MAX } from "@/lib/scale";

const SWATCH_W = 72;
const SWATCH_H = 30;
const SAMPLES = [10, 50, VID_SCALE_MAX] as const;

/** Deterministic scatter, so the swatches do not reshuffle on every render. */
function scatter(seed: number, count: number): [number, number][] {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => [
    6 + next() * (SWATCH_W - 12),
    6 + next() * (SWATCH_H - 12),
  ]);
}

function Swatch({ vid }: { vid: number }) {
  // The same density-to-count rule the map uses, over the swatch's area, so
  // the legend is a literal sample of the map at that density.
  const count = Math.round(drawnBirdDensity(vid) * SWATCH_W * SWATCH_H);
  const path = scatter(vid, count)
    .map(([x, y], index) => {
      const [lx, ly, bx, by, rx, ry] = birdWings(
        x,
        y,
        Math.PI / 4,
        BIRD_SPAN_PX,
        (index % 4) / 4,
      );
      return `M${lx.toFixed(1)} ${ly.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}L${rx.toFixed(1)} ${ry.toFixed(1)}`;
    })
    .join("");

  return (
    <figure className="m-0 flex flex-col items-center gap-0.5">
      <svg
        aria-hidden="true"
        className="rounded-md border border-ink/10"
        height={SWATCH_H}
        viewBox={`0 0 ${SWATCH_W} ${SWATCH_H}`}
        width={SWATCH_W}
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.85}
          strokeWidth={BIRD_STROKE_PX}
        />
      </svg>
      <figcaption className="text-[0.65rem] tabular-nums opacity-70">
        {vid === VID_SCALE_MAX ? `${vid}+` : vid}
      </figcaption>
    </figure>
  );
}

/**
 * What the flock density means, drawn with the map's own rule. Linear: five
 * times the birds aloft is five times the birds drawn.
 */
export function Legend() {
  return (
    <div className="pointer-events-none rounded-xl border border-ink/15 bg-paper/90 px-3 py-2 shadow-lg backdrop-blur">
      <p className="text-[0.7rem] font-medium">Birds aloft per km²</p>
      <div className="mt-1.5 flex gap-1.5">
        {SAMPLES.map((vid) => (
          <Swatch key={vid} vid={vid} />
        ))}
      </div>
      <p className="mt-1.5 max-w-[14rem] text-[0.65rem] leading-snug opacity-70">
        Birds as drawn at the closest zoom. Zoom out and the same birds shrink,
        then turn to dots. They fly the heading the radars measured, sped up to
        be visible.
      </p>
    </div>
  );
}
