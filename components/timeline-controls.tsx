"use client";

import { useEffect, useMemo } from "react";
import { formatClock } from "@/lib/format";
import type { Night } from "@/lib/types";

/** Milliseconds per frame at play: a night of 15-minute steps in ~13 seconds. */
const PLAY_STEP_MS = 240;

interface TimelineControlsProps {
  night: Night;
  index: number;
  onSelect: (index: number) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
}

/**
 * Scrubs the night.
 *
 * The track is a chart of how much was aloft across the network at each
 * moment, so the shape of the night (the climb after dusk, the peak, the
 * landing before dawn) is visible before you press play, and its peak is
 * something to aim at.
 */
export function TimelineControls({
  night,
  index,
  onSelect,
  playing,
  onPlayingChange,
}: TimelineControlsProps) {
  const last = night.frames.length - 1;
  const atEnd = index >= last;

  const profile = useMemo(
    () =>
      night.frames.map((frame) =>
        frame.samples.length === 0
          ? 0
          : frame.samples.reduce((total, sample) => total + sample.vid, 0) /
            frame.samples.length,
      ),
    [night],
  );
  const peak = useMemo(() => Math.max(0.001, ...profile), [profile]);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (atEnd) {
        onPlayingChange(false);
        return;
      }
      onSelect(index + 1);
    }, PLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, index, atEnd, onSelect, onPlayingChange]);

  const current = night.frames[index];

  return (
    <div className="absolute right-3 bottom-6 left-3 z-[500] mx-auto flex max-w-[46rem] items-center gap-2 rounded-2xl border border-ink/15 bg-paper/90 px-3 py-3 shadow-xl backdrop-blur sm:gap-3 sm:px-4">
      <button
        aria-label={playing ? "Pause" : "Play the night"}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-signal text-white shadow-sm transition hover:brightness-110"
        onClick={() => {
          // Replaying from dawn restarts at dusk.
          if (!playing && atEnd) onSelect(0);
          onPlayingChange(!playing);
        }}
        type="button"
      >
        {playing ? (
          <svg aria-hidden="true" className="size-4" viewBox="0 0 16 16">
            <path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="size-4" viewBox="0 0 16 16">
            <path d="M4 2l9 6-9 6z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className="relative min-w-0 flex-1">
        <svg
          aria-hidden="true"
          className="block h-8 w-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${night.frames.length} 100`}
        >
          {profile.map((mean, frameIndex) => {
            const height = Math.max((mean / peak) * 100, mean > 0 ? 2 : 0);
            if (height === 0) return null;
            return (
              <rect
                key={night.frames[frameIndex].at}
                fill="var(--chart-bar)"
                height={height}
                opacity={frameIndex === index ? 1 : 0.42}
                width={1}
                x={frameIndex}
                y={100 - height}
              />
            );
          })}
        </svg>
        <input
          aria-label="Time of night"
          aria-valuetext={current ? `${formatClock(current.at)} UTC` : undefined}
          className="bird-range absolute inset-0 w-full"
          max={last}
          min={0}
          onChange={(event) => {
            onPlayingChange(false);
            onSelect(Number(event.target.value));
          }}
          type="range"
          value={index}
        />
      </div>

      <span className="w-14 shrink-0 text-right text-sm tabular-nums">
        {current ? formatClock(current.at) : ""}
      </span>
    </div>
  );
}
