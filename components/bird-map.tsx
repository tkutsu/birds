"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import {
  MigrationField,
  type GeoSample,
  type Theme,
} from "@/components/migration-field";
import { unifyFlow } from "@/lib/flow";
import {
  formatClock,
  formatDensity,
  formatSpeed,
  formatTraffic,
  headingLabel,
} from "@/lib/format";
import type { NightFrame, Radar, RadarSample } from "@/lib/types";

const EUROPE_CENTER: [number, number] = [52, 10];
const EUROPE_BOUNDS: [[number, number], [number, number]] = [
  [33, -17],
  [72, 40],
];

const RADAR_ICON_PX = 9;
const FIELD_PANE = "bird-field";
/** Set on a radar while nothing is flying over it; the CSS fades it back. */
const RADAR_QUIET = "bird-radar--quiet";

/** Birds/km2 over a radar for it to count as seeing anything at all. */
const ACTIVE_VID = 1;

/** Radars are 150 km apart; zooming further in shows the birds no better. */
const MAX_ZOOM = 8;

interface BirdMapProps {
  radars: readonly Radar[];
  /** The moment being shown, or undefined before the data lands. */
  frame: NightFrame | undefined;
  theme: Theme;
  /** Radar stations are a layer the visitor opts into, off by default. */
  showRadars: boolean;
  /** How long to blend into each new frame: the playback step, or 0. */
  blendMs: number;
}

function radarTooltip(
  radar: Radar,
  sample: RadarSample,
  at: string,
): string {
  const heading = headingLabel(sample.u, sample.v);
  const flight = heading
    ? `${heading} at ${formatSpeed(sample.u, sample.v)}`
    : "no direction resolved";
  const traffic =
    sample.mtr >= 1
      ? `${formatTraffic(sample.mtr)} birds/km per hour<br />`
      : "";
  return (
    `<strong>${radar.name}</strong><br />` +
    `${formatDensity(sample.vid)} birds/km² &middot; ${flight}<br />` +
    traffic +
    `<span style="opacity:0.65">${radar.country} &middot; ${formatClock(at)} UTC</span>`
  );
}

/**
 * Holds back every radar that has nothing flying over it, so the stations
 * carrying the night stand out from the ones that are merely switched on. The
 * class is toggled rather than the marker replaced, which lets the CSS fade
 * one into the other instead of popping frame by frame.
 */
function paintRadars(markers: Map<string, Marker>, active: Set<string>): void {
  for (const [id, marker] of markers) {
    marker.getElement()?.classList.toggle(RADAR_QUIET, !active.has(id));
  }
}

/** The Leaflet map, the interpolated field over it, and the radars themselves. */
export function BirdMap({
  radars,
  frame,
  theme,
  showRadars,
  blendMs,
}: BirdMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const fieldRef = useRef<MigrationField | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const markerGroupRef = useRef<LayerGroup | null>(null);
  // Which radars the current frame has birds over, kept outside the render so
  // the stations can be repainted when the layer is switched back on.
  const activeRef = useRef<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  // Read when a frame arrives, so starting or stopping playback does not
  // itself count as a new frame.
  const blendMsRef = useRef(blendMs);

  useEffect(() => {
    blendMsRef.current = blendMs;
  }, [blendMs]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;
    let disconnect: (() => void) | undefined;
    const markers = markersRef.current;

    const initialize = async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        center: EUROPE_CENTER,
        zoom: 5,
        minZoom: 4,
        maxZoom: MAX_ZOOM,
        maxBounds: EUROPE_BOUNDS,
        maxBoundsViscosity: 1,
        zoomSnap: 1,
        // The field is redrawn for whatever the viewport is; animating the
        // zoom would slide the tiles out from under it for 250 ms.
        zoomAnimation: false,
      });

      map.attributionControl.setPrefix(false);
      // Same basemap as _food: OSM's PNG tiles, held back to grey in CSS.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' +
          ' &middot; Bird data <a href="https://aloftdata.eu">Aloft</a> (ENRAM, CC0)',
        maxZoom: MAX_ZOOM,
      }).addTo(map);

      // Above the tiles, below the radar markers. The field is an overlay on
      // the map, not a thing sitting on top of the whole map.
      const pane = map.createPane(FIELD_PANE);
      pane.style.zIndex = "250";
      fieldRef.current = new MigrationField(map, pane);
      markerGroupRef.current = L.layerGroup();
      mapRef.current = map;
      setMapReady(true);

      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          if (!cancelled) map.invalidateSize({ animate: false, pan: false });
        });
      });
      observer.observe(containerRef.current);
      disconnect = () => observer.disconnect();
    };

    void initialize();

    return () => {
      cancelled = true;
      disconnect?.();
      fieldRef.current?.remove();
      fieldRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      markerGroupRef.current = null;
      markers.clear();
      setMapReady(false);
    };
    // The map instance is deliberately created only once.
  }, []);

  useEffect(() => {
    fieldRef.current?.setTheme(theme);
  }, [theme, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const group = markerGroupRef.current;
    if (!map || !group || !mapReady) return;
    if (showRadars) {
      group.addTo(map);
      // The markers were only just built: hold back the quiet ones to match
      // the frame already on screen.
      paintRadars(markersRef.current, activeRef.current);
    } else {
      group.remove();
    }
  }, [showRadars, mapReady]);

  /* One marker per radar, built once: only their tooltips change per frame. */
  useEffect(() => {
    const L = leafletRef.current;
    const group = markerGroupRef.current;
    if (!L || !group || !mapReady) return;

    group.clearLayers();
    markersRef.current.clear();
    for (const radar of radars) {

      const marker = L.marker([radar.latitude, radar.longitude], {
        icon: L.divIcon({
          className: "",
          html: `<div class="bird-radar" style="width:${RADAR_ICON_PX}px;height:${RADAR_ICON_PX}px"></div>`,
          iconSize: [RADAR_ICON_PX, RADAR_ICON_PX],
          iconAnchor: [RADAR_ICON_PX / 2, RADAR_ICON_PX / 2],
        }),
        keyboard: false,
        riseOnHover: true,
      });
      marker.bindTooltip(radar.name, {
        direction: "top",
        className: "bird-tooltip",
      });
      marker.addTo(group);
      markersRef.current.set(radar.id, marker);
    }
  }, [radars, mapReady]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || !mapReady) return;

    const samples: GeoSample[] = [];
    const reporting = new Set<string>();
    const active = new Set<string>();
    for (const sample of frame?.samples ?? []) {
      const radar = radars[sample.r];
      if (!radar) continue;
      if (sample.vid > ACTIVE_VID) active.add(radar.id);
      samples.push({
        latitude: radar.latitude,
        longitude: radar.longitude,
        vid: sample.vid,
        u: sample.u,
        v: sample.v,
      });
      reporting.add(radar.id);
      markersRef.current
        .get(radar.id)
        ?.setTooltipContent(radarTooltip(radar, sample, frame?.at ?? ""));
    }
    // A radar that sat out this frame would otherwise keep an old reading in
    // its tooltip; fall back to just its name.
    for (const radar of radars) {
      if (!reporting.has(radar.id)) {
        markersRef.current.get(radar.id)?.setTooltipContent(radar.name);
      }
    }
    activeRef.current = active;
    paintRadars(markersRef.current, active);
    // Neighbouring radars agree on one heading before the birds fly it, so
    // the flock moves as a front rather than in a cell per station. The
    // tooltips above keep each radar's own reading.
    field.setSamples(unifyFlow(samples), blendMsRef.current);
  }, [frame, radars, mapReady]);

  return (
    <div
      aria-label="Map of bird migration over Europe"
      className="relative z-0 size-full"
      ref={containerRef}
    />
  );
}
