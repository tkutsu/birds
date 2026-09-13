"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { BirdMap } from "@/components/bird-map";
import { Legend } from "@/components/legend";
import type { Theme } from "@/components/migration-field";
import { TimelineControls } from "@/components/timeline-controls";
import { useNights } from "@/hooks/use-nights";
import {
  formatDensity,
  formatNightLabel,
  formatSpeed,
  headingLabel,
  summarizeFrame,
} from "@/lib/format";

/**
 * The theme lives on the document element, stamped by a script that runs
 * before hydration so the first paint is already the right colour. React reads
 * it rather than owning it, which keeps the two from disagreeing.
 */
function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

// Prerendering has no document; dark is what the layout script defaults to.
const serverTheme = (): Theme => "dark";

/* Sized by the caller so the same glyph works in any control. */
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16">
      <path
        d="M13.8 9.9A5.6 5.6 0 0 1 6.1 2.2a5.9 5.9 0 1 0 7.7 7.7Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 16 16">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      >
        <circle cx="8" cy="8" r="3.2" />
        <path d="M8 1.4v1.6M8 13v1.6M1.4 8H3M13 8h1.6M3.33 3.33l1.13 1.13M11.54 11.54l1.13 1.13M3.33 12.67l1.13-1.13M11.54 4.46l1.13-1.13" />
      </g>
    </svg>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-paper/90 px-3 py-1 text-xs shadow-lg backdrop-blur">
      {children}
    </span>
  );
}

export function BirdApp() {
  const { payload, loading, error } = useNights();
  const [nightIndex, setNightIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, serverTheme);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("birds-theme", next);
    } catch {
      // Private browsing: the theme simply resets next visit.
    }
  };

  const nights = payload?.nights ?? [];
  const night = nights[Math.min(nightIndex, Math.max(0, nights.length - 1))];
  const frame = night?.frames[Math.min(frameIndex, night.frames.length - 1)];
  const summary = useMemo(() => summarizeFrame(frame), [frame]);
  const heading = headingLabel(summary.u, summary.v);

  return (
    <div className="relative flex h-dvh flex-col">
      <div className="relative min-h-0 flex-1">
        <BirdMap
          frame={frame}
          radars={payload?.radars ?? []}
          theme={theme}
        />

        <div className="pointer-events-none absolute top-3 left-14 z-[500] flex max-w-[calc(100%-8rem)] flex-col items-start gap-1.5">
          {loading && <Chip>Loading the night…</Chip>}
          {error && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-900 shadow-lg">
              {error}
            </span>
          )}
          {night && (
            <>
              <Chip>
                <strong className="font-semibold">
                  Night of {formatNightLabel(night.date)}
                </strong>
              </Chip>
              <Chip>
                {summary.peakVid < 1
                  ? "An empty sky"
                  : `Up to ${formatDensity(summary.peakVid)} birds/km²`}
                {heading
                  ? ` · heading ${heading} at ${formatSpeed(summary.u, summary.v)}`
                  : ""}
              </Chip>
              <Chip>
                {summary.active} of {payload?.radars.length ?? 0} radars seeing
                birds
              </Chip>
            </>
          )}
        </div>

        <div className="absolute top-3 right-3 z-[500] flex flex-col items-end gap-2">
          <button
            aria-label="Toggle dark mode"
            className="flex size-9 items-center justify-center rounded-full border border-ink/15 bg-paper/90 shadow-lg backdrop-blur transition hover:bg-paper"
            onClick={toggleTheme}
            type="button"
          >
            {theme === "dark" ? (
              <SunIcon className="size-4" />
            ) : (
              <MoonIcon className="size-4" />
            )}
          </button>

          {nights.length > 1 && (
            <select
              aria-label="Night"
              className="rounded-full border border-ink/15 bg-paper/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur"
              onChange={(event) => {
                setNightIndex(Number(event.target.value));
                setFrameIndex(0);
                setPlaying(false);
              }}
              value={nightIndex}
            >
              {nights.map((option, index) => (
                <option key={option.date} value={index}>
                  {formatNightLabel(option.date)}
                </option>
              ))}
            </select>
          )}

          <Legend />

          <details className="max-w-[15rem] rounded-xl border border-ink/15 bg-paper/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
            <summary className="font-medium">About this map</summary>
            <div className="mt-2 space-y-2 leading-snug opacity-80">
              <p>
                Weather radars see birds as well as rain. Aloft publishes the
                bird density profile each European radar retrieves every few
                minutes; this map integrates those profiles into a column total
                and interpolates between stations.
              </p>
              <p>
                Insects, rain and ground clutter contaminate the retrieval, and
                coverage is far denser in the Low Countries than in Iberia or
                the Balkans. Where the network thins out, so do the birds.
              </p>
              <p>
                Data:{" "}
                <a
                  className="underline"
                  href="https://aloftdata.eu"
                  rel="noreferrer"
                  target="_blank"
                >
                  aloftdata.eu
                </a>{" "}
                (ENRAM, CC0). Times are UTC.
              </p>
            </div>
          </details>
        </div>

        {night && night.frames.length > 1 && (
          <TimelineControls
            index={Math.min(frameIndex, night.frames.length - 1)}
            night={night}
            onPlayingChange={setPlaying}
            onSelect={setFrameIndex}
            playing={playing}
          />
        )}
      </div>
    </div>
  );
}
