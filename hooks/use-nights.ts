"use client";

import { useEffect, useState } from "react";
import type { NightsPayload } from "@/lib/types";

interface NightsState {
  payload: NightsPayload | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads the nights baked at build time.
 *
 * There is nothing to top up at runtime: Aloft publishes a day at a time, so
 * between nightly deploys there is no newer night to fetch, and fetching one
 * would mean pulling a hundred megabytes of VPTS into the browser.
 */
export function useNights(): NightsState {
  const [state, setState] = useState<NightsState>({
    payload: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("data/nights.json");
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = (await response.json()) as NightsPayload;
        if (!cancelled) setState({ payload, loading: false, error: null });
      } catch {
        if (!cancelled) {
          setState({
            payload: null,
            loading: false,
            error: "Could not load the migration data.",
          });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
