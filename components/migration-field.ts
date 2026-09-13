import type { Map as LeafletMap } from "leaflet";
import {
  BIRD_SPAN_PX,
  BIRD_STROKE_PX,
  birdWings,
  headingOf,
  WINGBEAT_S,
} from "@/lib/bird";
import {
  cumulative,
  estimateField,
  pickWeighted,
  type FieldSample,
} from "@/lib/grid";
import { drawnBirdDensity, zoomScale, type ZoomScale } from "@/lib/scale";

/** One radar's reading, positioned. */
export interface GeoSample {
  latitude: number;
  longitude: number;
  vid: number;
  /** Ground speed east/north, m/s. Both zero when velocity did not resolve. */
  u: number;
  v: number;
}

export type Theme = "light" | "dark";

/**
 * How far a radar's reading is allowed to travel.
 *
 * Stations are 80-150 km apart across the Low Countries and Germany and 300 km
 * apart in Iberia, so 220 km closes the dense part of the network into a
 * continuous field and leaves the sparse part visibly empty, which is the
 * truth about European radar coverage and should look like it.
 */
const INFLUENCE_KM = 220;

/** Screen pixels per cell of the interpolation grid. */
const CELL_PX = 6;

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

/**
 * Screen pixels per metre-per-second of real ground speed.
 *
 * The motion is a direction-and-relative-speed cue, not a simulation: real
 * birds at 15 m/s would take ten minutes to cross a continent-wide view. This
 * factor is fixed in screen space so the flock reads the same at every zoom.
 */
const PX_PER_MPS = 2.4;

/** Below this a bird flaps in place: there is no heading worth drawing. */
const MIN_FLOW_MPS = 0.5;

const MIN_LIFE_MS = 1800;
const MAX_LIFE_MS = 3600;
/** Birds fade in and out over this long, so the flock never pops. */
const FADE_MS = 300;
/**
 * What a browser can animate inside a frame. Measured in Chromium at
 * 1280x800: 6,000 stroked birds take about 11 ms, while 40,000 dots written
 * straight into a pixel buffer take under 2 ms, trail fade included. Past the
 * budget the whole flock is thinned evenly, which only happens on a busy
 * night seen from far out.
 */
const MAX_BIRDS = 6000;
const MAX_DOTS = 40000;
/** Share of a dot's trail kept each frame; sets how long the trail is. */
const DOT_TRAIL_KEEP = 0.84;
const DOT_ALPHA = 220;

interface Bird {
  x: number;
  y: number;
  age: number;
  life: number;
  /** Wingbeat offset, 0-1, so the flock does not flap in unison. */
  phase: number;
  heading: number;
  /** Drawn density where the bird was placed, for thinning on a new frame. */
  density: number;
}

/** The interpolated field on the grid, for one view and one frame. */
interface FieldGrid {
  cols: number;
  rows: number;
  /** Drawn birds per px², already faded by coverage. */
  density: Float32Array;
  u: Float32Array;
  v: Float32Array;
  /** Running totals of birds per cell, for placing new ones. */
  totals: Float64Array;
  /** How many birds this view should hold. */
  target: number;
  scale: ZoomScale;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Draws the night's birds over the map.
 *
 * Density is shown as count: the radars are interpolated onto a grid, each
 * cell holds birds in proportion to how many were aloft there, and they fly
 * along the interpolated heading. The grid is rebuilt when the view or the
 * timeline moves; between those the animation only reads it.
 */
export class MigrationField {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  /** Dots are drawn at CSS resolution into this buffer, then scaled up once. */
  private readonly dotCanvas: HTMLCanvasElement;
  private dotImage: ImageData | null = null;

  private samples: readonly GeoSample[] = [];
  private theme: Theme = "dark";
  private grid: FieldGrid | null = null;
  private birds: Bird[] = [];
  private width = 0;
  private height = 0;
  private animation: number | null = null;
  private lastTick = 0;
  private readonly reducedMotion = prefersReducedMotion();
  /** Layer-space position of the viewport's corner, to follow a pan. */
  private origin = { x: 0, y: 0 };
  private readonly onRescale = () => this.render("rescale");
  private readonly onPan = () => this.render("pan");

  constructor(
    private readonly map: LeafletMap,
    container: HTMLElement,
  ) {
    this.root = document.createElement("div");
    this.root.className = "bird-field";
    this.canvas = document.createElement("canvas");
    this.dotCanvas = document.createElement("canvas");
    this.root.append(this.canvas);
    container.append(this.root);

    this.map.on("zoom resize viewreset", this.onRescale);
    this.map.on("move", this.onPan);
  }

  remove(): void {
    this.map.off("zoom resize viewreset", this.onRescale);
    this.map.off("move", this.onPan);
    if (this.animation !== null) cancelAnimationFrame(this.animation);
    this.animation = null;
    this.root.remove();
  }

  setTheme(theme: Theme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    if (this.reducedMotion) this.drawStill();
  }

  setSamples(samples: readonly GeoSample[]): void {
    this.samples = samples;
    this.render("frame");
  }

  private resize(): boolean {
    const size = this.map.getSize();
    if (size.x === 0 || size.y === 0) return false;
    if (size.x === this.width && size.y === this.height) return true;

    this.width = size.x;
    this.height = size.y;
    // A Leaflet pane has no size of its own, so the overlay cannot inherit one.
    this.root.style.width = `${size.x}px`;
    this.root.style.height = `${size.y}px`;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(size.x * ratio);
    this.canvas.height = Math.round(size.y * ratio);
    this.canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.dotCanvas.width = size.x;
    this.dotCanvas.height = size.y;
    this.dotImage = null;
    return true;
  }

  /**
   * Pins the canvas to the viewport.
   *
   * It lives in a Leaflet pane so the birds sit above the tiles and below the
   * radars, but it is drawn in screen coordinates, so the pane's own pan
   * transform has to be cancelled out on every move.
   */
  private reposition(): { x: number; y: number } {
    const origin = this.map.containerPointToLayerPoint([0, 0]);
    this.root.style.transform = `translate3d(${origin.x}px, ${origin.y}px, 0)`;
    const shift = { x: this.origin.x - origin.x, y: this.origin.y - origin.y };
    this.origin = { x: origin.x, y: origin.y };
    return shift;
  }

  /**
   * Rebuilds the grid. A zoom invalidates every bird's screen position, so the
   * flock is replaced. A pan carries the birds with the
   * ground. A new frame only changes where birds should be, so the flock is
   * thinned and topped up in place.
   */
  private render(reason: "rescale" | "pan" | "frame"): void {
    const resized = this.resize();
    if (!resized) return;
    const shift = this.reposition();
    this.grid = this.buildGrid();

    if (reason === "rescale") {
      this.birds = [];
    } else {
      for (const bird of this.birds) {
        bird.x += shift.x;
        bird.y += shift.y;
      }
      this.thin();
    }
    // Dot trails are painted in screen space; a new view would smear them.
    if (reason !== "frame") {
      this.canvas.getContext("2d")?.clearRect(0, 0, this.width, this.height);
      this.dotImage?.data.fill(0);
    }
    this.topUp(reason === "rescale");

    if (this.reducedMotion) {
      this.drawStill();
      return;
    }
    if (this.animation === null) {
      this.lastTick = performance.now();
      this.animation = requestAnimationFrame((now) => this.tick(now));
    }
  }

  /**
   * Interpolates the radar network onto the grid, in a flat kilometre space
   * centred on the current view.
   *
   * Mercator makes longitude separable from latitude, so a row's latitude and
   * a column's longitude each need one unprojection rather than one per cell.
   */
  private buildGrid(): FieldGrid | null {
    if (this.samples.length === 0) return null;
    const cols = Math.max(1, Math.ceil(this.width / CELL_PX));
    const rows = Math.max(1, Math.ceil(this.height / CELL_PX));
    const kx =
      KM_PER_DEG_LON_EQUATOR *
      Math.cos((this.map.getCenter().lat * Math.PI) / 180);
    const samples: FieldSample[] = this.samples.map((sample) => ({
      x: sample.longitude * kx,
      y: sample.latitude * KM_PER_DEG_LAT,
      value: sample.vid,
      u: sample.u,
      v: sample.v,
    }));

    const xs = new Float64Array(cols);
    for (let col = 0; col < cols; col += 1) {
      xs[col] =
        this.map.containerPointToLatLng([(col + 0.5) * CELL_PX, 0]).lng * kx;
    }
    const ys = new Float64Array(rows);
    for (let row = 0; row < rows; row += 1) {
      ys[row] =
        this.map.containerPointToLatLng([0, (row + 0.5) * CELL_PX]).lat *
        KM_PER_DEG_LAT;
    }

    const cells = cols * rows;
    const density = new Float32Array(cells);
    const perCell = new Float32Array(cells);
    const u = new Float32Array(cells);
    const v = new Float32Array(cells);
    const scale = zoomScale(
      this.map.getZoom(),
      this.map.getMaxZoom(),
      BIRD_SPAN_PX,
    );
    // Birds per cell at this zoom: the closest zoom's count for the same ground.
    const cellArea = CELL_PX * CELL_PX * scale.factor;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const estimate = estimateField(samples, xs[col], ys[row], INFLUENCE_KM);
        const index = row * cols + col;
        // Coverage thins the flock towards the edge of the network, so a gap
        // between radars reads as a gap rather than as an empty sky.
        density[index] = drawnBirdDensity(estimate.value) * estimate.coverage;
        perCell[index] = density[index] * cellArea;
        u[index] = estimate.u;
        v[index] = estimate.v;
      }
    }

    const totals = cumulative(perCell);
    const budget = scale.mode === "dots" ? MAX_DOTS : MAX_BIRDS;
    const target = Math.min(budget, Math.round(totals[cells - 1] ?? 0));
    return { cols, rows, density, u, v, totals, target, scale };
  }

  private cellAt(x: number, y: number): number {
    const grid = this.grid;
    if (!grid) return -1;
    const col = Math.floor(x / CELL_PX);
    const row = Math.floor(y / CELL_PX);
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
    return row * grid.cols + col;
  }

  /** A new bird, placed with probability proportional to the density. */
  private spawn(): Bird | null {
    const grid = this.grid;
    if (!grid) return null;
    const index = pickWeighted(grid.totals, Math.random());
    if (index < 0) return null;
    const x = ((index % grid.cols) + Math.random()) * CELL_PX;
    const y = (Math.floor(index / grid.cols) + Math.random()) * CELL_PX;
    const moving = Math.hypot(grid.u[index], grid.v[index]) >= MIN_FLOW_MPS;
    return {
      x,
      y,
      age: 0,
      life: MIN_LIFE_MS + Math.random() * (MAX_LIFE_MS - MIN_LIFE_MS),
      phase: Math.random(),
      // A bird with no resolved heading still counts; it just faces anywhere.
      heading: moving
        ? headingOf(grid.u[index], grid.v[index])
        : Math.random() * 2 * Math.PI,
      density: grid.density[index],
    };
  }

  /**
   * On a new frame, each bird survives with the ratio of the density now to
   * the density it was placed at, so a thinning flock thins in place instead
   * of lingering until its birds age out.
   */
  private thin(): void {
    const grid = this.grid;
    if (!grid) {
      this.birds = [];
      return;
    }
    this.birds = this.birds.filter((bird) => {
      const index = this.cellAt(bird.x, bird.y);
      if (index < 0 || bird.density <= 0) return false;
      const now = grid.density[index];
      const keep = Math.random() < Math.min(1, now / bird.density);
      if (keep) bird.density = now;
      return keep;
    });
  }

  private topUp(freshView: boolean): void {
    const target = this.grid?.target ?? 0;
    while (this.birds.length > target) {
      this.birds.splice(Math.floor(Math.random() * this.birds.length), 1);
    }
    while (this.birds.length < target) {
      const bird = this.spawn();
      if (!bird) break;
      // A fresh view starts every bird at a random point in its life, or the
      // whole flock would fade in, and later out, in unison.
      if (freshView) bird.age = Math.random() * bird.life * 0.7;
      this.birds.push(bird);
    }
  }

  private get ink(): string {
    return this.theme === "dark" ? "240, 238, 231" : "27, 26, 23";
  }

  private tick(now: number): void {
    this.animation = requestAnimationFrame((next) => this.tick(next));
    const context = this.canvas.getContext("2d");
    if (!context) return;
    // Long frames (a backgrounded tab) would teleport every bird.
    const elapsed = Math.min(64, now - this.lastTick);
    this.lastTick = now;
    const seconds = elapsed / 1000;
    const grid = this.grid;

    for (let index = 0; index < this.birds.length; index += 1) {
      const bird = this.birds[index];
      bird.age += elapsed;
      bird.phase = (bird.phase + seconds / WINGBEAT_S) % 1;
      const cell = this.cellAt(bird.x, bird.y);
      if (bird.age > bird.life || cell < 0 || !grid) {
        const fresh = this.spawn();
        if (fresh) this.birds[index] = fresh;
        continue;
      }
      const u = grid.u[cell];
      const v = grid.v[cell];
      if (Math.hypot(u, v) >= MIN_FLOW_MPS) {
        bird.heading = headingOf(u, v);
        bird.x += u * PX_PER_MPS * seconds;
        // Screen y grows downwards; northward flight goes up.
        bird.y -= v * PX_PER_MPS * seconds;
      }
    }

    this.draw(context);
  }

  private draw(context: CanvasRenderingContext2D): void {
    if (this.grid?.scale.mode === "dots") this.drawDots(context);
    else this.drawBirds(context, this.grid?.scale.span ?? BIRD_SPAN_PX);
  }

  /**
   * Zoomed far out: each bird is a single pixel, and its trail is what is left
   * of the pixels it lit in earlier frames, faded a little every frame. Tens of
   * thousands of dots are only affordable written straight into a buffer; as
   * canvas strokes the same flock costs fifty times as much.
   */
  private drawDots(context: CanvasRenderingContext2D): void {
    const dots = this.dotCanvas.getContext("2d");
    if (!dots) return;
    const { width, height } = this.dotCanvas;
    if (!this.dotImage) this.dotImage = dots.createImageData(width, height);
    const data = this.dotImage.data;

    for (let alpha = 3; alpha < data.length; alpha += 4) {
      if (data[alpha] !== 0) data[alpha] = (data[alpha] * DOT_TRAIL_KEEP) | 0;
    }

    const [r, g, b] = this.ink.split(",").map(Number);
    for (const bird of this.birds) {
      const x = bird.x | 0;
      const y = bird.y | 0;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = DOT_ALPHA;
    }

    dots.putImageData(this.dotImage, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(this.dotCanvas, 0, 0, this.width, this.height);
  }

  /** Draws the flock in three opacity passes, so fading birds batch too. */
  private drawBirds(context: CanvasRenderingContext2D, span: number): void {
    context.clearRect(0, 0, this.width, this.height);
    context.lineWidth = BIRD_STROKE_PX;
    // Round caps cost twice as much to stroke and are invisible at this size.
    context.lineCap = "butt";
    context.lineJoin = "miter";

    for (const [floor, alpha] of [
      [0, 0.3],
      [0.5, 0.6],
      [1, 0.9],
    ] as const) {
      context.strokeStyle = `rgba(${this.ink}, ${alpha})`;
      context.beginPath();
      for (const bird of this.birds) {
        const fade = Math.min(1, bird.age / FADE_MS, (bird.life - bird.age) / FADE_MS);
        const bucket = fade < 0.5 ? 0 : fade < 1 ? 0.5 : 1;
        if (bucket !== floor) continue;
        const [lx, ly, bx, by, rx, ry] = birdWings(
          bird.x,
          bird.y,
          bird.heading,
          span,
          bird.phase,
        );
        context.moveTo(lx, ly);
        context.lineTo(bx, by);
        context.lineTo(rx, ry);
      }
      context.stroke();
    }
  }

  /**
   * The still version, for a visitor who has asked the system for less
   * movement: the same flock, wings mid-beat, redrawn only when data changes.
   */
  private drawStill(): void {
    const context = this.canvas.getContext("2d");
    if (!context) return;
    for (const bird of this.birds) {
      bird.age = FADE_MS;
      bird.life = FADE_MS * 3;
      bird.phase = 0.25;
    }
    // A still frame has no past to trail behind it.
    this.dotImage?.data.fill(0);
    context.clearRect(0, 0, this.width, this.height);
    this.draw(context);
  }
}
