"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { MetricsSnapshot } from "./api";
import { useEngineEvents } from "./useEngineEvents";
import { SEEDED_METRICS } from "./snapshot";

/**
 * How the numbers on screen were obtained. Surfaced in the UI on every
 * page that shows figures — a seeded replay and a live engine must never
 * look the same to someone reading the dashboard.
 */
export type Source = "connecting" | "live" | "seeded";

/**
 * Fetches a resource from the engine and keeps it current from the SSE
 * stream, falling back to a committed seeded snapshot when the engine
 * is not reachable (a static deploy, or the API not started yet).
 */
export function useEngineResource<T>(
  fetcher: () => Promise<T>,
  fallback: T,
  shouldRefresh: (eventType: string) => boolean,
) {
  const [data, setData] = useState<T>(fallback);
  const [source, setSource] = useState<Source>("connecting");
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      setData(next);
      setSource("live");
    } catch {
      setSource((prev) => (prev === "live" ? "live" : "seeded"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEngineEvents((event) => {
    if (shouldRefresh(event.type)) void load();
  });

  return { data, source, reload: load };
}

/** The money wall's numbers, live where possible. */
export function useMetrics() {
  const [metrics, setMetrics] = useState<MetricsSnapshot>(SEEDED_METRICS);
  const [source, setSource] = useState<Source>("connecting");

  const load = useCallback(async () => {
    try {
      setMetrics(await api.metrics());
      setSource("live");
    } catch {
      setSource((prev) => (prev === "live" ? "live" : "seeded"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Metrics arrive on the stream already computed, so there is no need to
  // re-fetch — the payload on the event is the payload the API returns.
  useEngineEvents((event) => {
    if (event.type === "metrics_update") {
      setMetrics(event.metrics as MetricsSnapshot);
      setSource("live");
    }
  });

  return { metrics, source, reload: load };
}

/** Small presentational helper so the badge reads the same everywhere. */
export function sourceLabel(source: Source): { text: string; live: boolean } {
  if (source === "live") return { text: "Live engine", live: true };
  if (source === "connecting") return { text: "Connecting", live: false };
  return { text: "Seeded batch", live: false };
}
