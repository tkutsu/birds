/** A weather radar contributing vertical profiles, with its ODIM code. */
export interface Radar {
  /** ODIM station code, e.g. "nldhl". */
  id: string;
  /** Human name of the site. */
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  latitude: number;
  longitude: number;
}

/**
 * One radar's profile at one timestamp, with height already integrated away.
 * This is the whole point of the build step: a 25-bin profile collapses to
 * four numbers, which is what makes a continent-wide night a few hundred KB.
 */
export interface RadarSample {
  /** Index into NightsPayload.radars. */
  r: number;
  /** Vertically integrated density, birds/km². */
  vid: number;
  /** Migration traffic rate, birds/km/hour. */
  mtr: number;
  /** Density-weighted mean ground speed, eastward, m/s. */
  u: number;
  /** Density-weighted mean ground speed, northward, m/s. */
  v: number;
}

/** Every radar reporting at one instant of the night. */
export interface NightFrame {
  /** ISO-8601 UTC timestamp. */
  at: string;
  samples: RadarSample[];
}

export interface Night {
  /**
   * UTC date of the evening the night starts on. The night itself runs past
   * midnight into the following day.
   */
  date: string;
  frames: NightFrame[];
  /** Highest VID seen anywhere that night, birds/km². Scales the colour ramp. */
  peakVid: number;
}

export interface NightsPayload {
  /** Radars that reported, shared across every night. */
  radars: Radar[];
  /** Newest night last. */
  nights: Night[];
  /** When the build script read Aloft. */
  observedAt: string;
}
