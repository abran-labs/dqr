export type Star = {
  readonly angle: number;
  readonly baseOpacity: number;
  /** Position at rotation zero, relative to the galaxy center. Lets a frame apply one
   *  rotation matrix to the whole field instead of calling cos/sin once per star. */
  readonly baseX: number;
  readonly baseY: number;
  readonly distance: number;
  readonly radius: number;
  readonly spawnDelayMs: number;
  /** Always fully opaque; per-star alpha is applied through ctx.globalAlpha. */
  readonly tone: string;
  readonly twinkleOffset: number;
  readonly twinkleSpeed: number | null;
};

export type Palette = {
  readonly foreground: string;
  readonly muted: string;
  readonly primary: string;
};

export type StarGenerationOptions = {
  readonly allStarsTwinkle: boolean;
  readonly maxTwinkleSpeed: number;
  readonly minTwinkleSpeed: number;
  readonly starDensity: number;
  readonly twinkleProbability: number;
};

type StarFieldSpec = {
  readonly generation: StarGenerationOptions;
  readonly height: number;
  readonly palette: Palette;
  readonly width: number;
};

type PaintStarFieldInput = {
  readonly ctx: CanvasRenderingContext2D;
  readonly height: number;
  readonly introStartedAt: number | null;
  readonly reducedMotion: boolean;
  readonly stars: readonly Star[];
  readonly timestamp: number;
  readonly width: number;
};

const DEFAULT_PALETTE: Palette = {
  foreground: "hsl(15 7.1% 89%)",
  muted: "hsl(14.1 32.1% 79.2%)",
  primary: "hsl(14.2 100% 81%)"
};

export const DEFAULT_STAR_GENERATION: StarGenerationOptions = {
  allStarsTwinkle: false,
  maxTwinkleSpeed: 0.85,
  minTwinkleSpeed: 0.28,
  starDensity: 0.00029,
  twinkleProbability: 0.4
};

const GALAXY_ROTATION_SPEED = 0.000008;
const REDUCED_MOTION_ROTATION_SPEED = 0;
const MAX_STAR_COUNT = 1150;
const STAR_SPAWN_SPREAD_MS = 1400;
const STAR_SPAWN_FADE_MS = 480;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const getStarSpawnAlpha = (
  star: Star,
  timestamp: number,
  introStartedAt: number | null,
  reducedMotion: boolean
) => {
  if (reducedMotion || introStartedAt === null) {
    return 1;
  }

  const elapsed = timestamp - introStartedAt - star.spawnDelayMs;
  if (elapsed <= 0) {
    return 0;
  }

  if (elapsed >= STAR_SPAWN_FADE_MS) {
    return 1;
  }

  return easeOutCubic(elapsed / STAR_SPAWN_FADE_MS);
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const hexToRgba = (value: string, alpha: number) => {
  const hex = value.replace("#", "").trim();
  if (hex.length !== 6) {
    return value;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const clampAlpha = (alpha: number) => Math.min(1, Math.max(0, alpha));

const withAlpha = (tone: string, alpha: number) => {
  const value = tone.trim();
  const a = clampAlpha(alpha);

  if (value.startsWith("#")) {
    return hexToRgba(value, a);
  }

  const oklchMatch = value.match(/^oklch\(([^/)]+)(?:\/[^)]+)?\)$/i);
  const oklchBody = oklchMatch?.[1];
  if (oklchBody) {
    return `oklch(${oklchBody.trim()} / ${a})`;
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
  const rgbBody = rgbMatch?.[1];
  if (rgbBody) {
    const parts = rgbBody.split(/[,/]/).map((part) => part.trim()).filter(Boolean);
    const [r, g, b] = parts;
    if (r && g && b) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }

  const hslMatch = value.match(/^hsla?\(([^)]+)\)$/i);
  const hslBody = hslMatch?.[1];
  if (hslBody) {
    const body = hslBody.trim();
    const slashParts = body.split("/").map((part) => part.trim());
    const channelBody = slashParts[0] ?? "";
    const channels = channelBody.split(/[\s,]+/).filter(Boolean);
    if (channels.length >= 3) {
      const [h, sl, l] = channels;
      return `hsl(${h} ${sl} ${l} / ${a})`;
    }
  }

  // shadcn-style bare HSL channels: "15 7.1% 89%"
  if (/^\d/.test(value) && !value.includes("(")) {
    return `hsl(${value} / ${a})`;
  }

  return value;
};

const normalizeTone = (value: string) => {
  const tone = value.trim();
  if (!tone) return "";
  if (
    tone.startsWith("#") ||
    tone.startsWith("oklch") ||
    tone.startsWith("rgb") ||
    tone.startsWith("hsl")
  ) {
    return tone;
  }
  if (/^\d/.test(tone)) {
    return `hsl(${tone})`;
  }
  return tone;
};

export const getPalette = (): Palette => {
  const styles = getComputedStyle(document.documentElement);

  const read = (...names: readonly string[]) => {
    for (const name of names) {
      const value = styles.getPropertyValue(name).trim();
      if (value) {
        return normalizeTone(value);
      }
    }
    return "";
  };

  return {
    foreground: read("--foreground", "--text-primary") || DEFAULT_PALETTE.foreground,
    muted: read("--muted-foreground", "--text-muted") || DEFAULT_PALETTE.muted,
    primary: read("--primary") || DEFAULT_PALETTE.primary
  };
};

const getGalaxyCenter = (width: number, height: number) => ({
  x: width + height * 0.1,
  y: height + height * 0.5
});

const getDistanceRange = (width: number, height: number) => {
  const center = getGalaxyCenter(width, height);
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height]
  ];
  let min = Infinity;
  let max = 0;
  for (const [cx, cy] of corners) {
    const d = Math.hypot(cx - center.x, cy - center.y);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min: min * 0.82, max: max * 1.06 };
};

const createStar = (
  { palette, generation }: StarFieldSpec,
  distanceRange: { readonly min: number; readonly max: number }
): Star => {
  const { min, max } = distanceRange;
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(randomBetween(min * min, max * max));
  const toneRoll = Math.random();
  const radiusRoll = Math.random();
  const opacityRoll = Math.random();
  const shouldTwinkle = generation.allStarsTwinkle || Math.random() < generation.twinkleProbability;

  return {
    angle,
    baseOpacity: opacityRoll < 0.7 ? randomBetween(0.35, 0.62) : randomBetween(0.62, 0.92),
    baseX: Math.cos(angle) * distance,
    baseY: Math.sin(angle) * distance,
    distance,
    radius: radiusRoll < 0.78 ? randomBetween(0.45, 0.9) : radiusRoll < 0.97 ? randomBetween(0.9, 1.35) : randomBetween(1.35, 1.7),
    spawnDelayMs: Math.random() * STAR_SPAWN_SPREAD_MS,
    tone: toneRoll < 0.7 ? palette.foreground : toneRoll < 0.92 ? palette.muted : palette.primary,
    twinkleOffset: randomBetween(0, Math.PI * 2),
    twinkleSpeed: shouldTwinkle ? randomBetween(generation.minTwinkleSpeed, generation.maxTwinkleSpeed) : null
  };
};

export const generateStars = ({ width, height, palette, generation }: StarFieldSpec) => {
  const area = width * height;
  const visibleCount = Math.floor(area * generation.starDensity);
  const distanceRange = getDistanceRange(width, height);
  const { min, max } = distanceRange;
  const annulusArea = Math.PI * (max * max - min * min);
  const ringScale = annulusArea / Math.max(area, 1);
  const count = Math.min(MAX_STAR_COUNT, Math.max(visibleCount, Math.floor(visibleCount * ringScale)));

  // Resolve each tone to an opaque colour once per field instead of rebuilding a colour
  // string per star per frame. Alpha is applied at paint time via ctx.globalAlpha.
  const opaquePalette: Palette = {
    foreground: withAlpha(palette.foreground, 1),
    muted: withAlpha(palette.muted, 1),
    primary: withAlpha(palette.primary, 1)
  };
  const spec: StarFieldSpec = { width, height, palette: opaquePalette, generation };

  return Array.from({ length: count }, () => createStar(spec, distanceRange));
};

const CULL_MARGIN = 8;
const TAU = Math.PI * 2;

/**
 * Paints the whole field for one frame.
 *
 * Per-frame constants (galaxy centre, rotation matrix, intro completion) are computed once
 * here rather than once per star. The field rotates rigidly, so rotating each star's
 * precomputed base offset by a single matrix is algebraically identical to the previous
 * `cos(star.angle + t * speed) * distance` while calling cos/sin twice per frame instead of
 * twice per star. Alpha rides on ctx.globalAlpha so fillStyle only changes when the tone
 * changes, which keeps the canvas colour cache warm instead of parsing a fresh colour string
 * for every visible star.
 */
export const paintStarField = ({
  ctx,
  stars,
  timestamp,
  width,
  height,
  reducedMotion,
  introStartedAt
}: PaintStarFieldInput) => {
  const centerX = width + height * 0.1;
  const centerY = height + height * 0.5;
  const rotationSpeed = reducedMotion ? REDUCED_MOTION_ROTATION_SPEED : GALAXY_ROTATION_SPEED;
  const rotation = timestamp * rotationSpeed;
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);

  // Once every star has finished fading in, spawn alpha is 1 for the whole field forever.
  const introComplete =
    introStartedAt === null || timestamp - introStartedAt >= STAR_SPAWN_SPREAD_MS + STAR_SPAWN_FADE_MS;
  const skipSpawnFade = reducedMotion || introComplete;
  const twinklePhase = timestamp * 0.0009;

  const maxX = width + CULL_MARGIN;
  const maxY = height + CULL_MARGIN;

  let currentTone = "";
  ctx.globalAlpha = 1;

  for (const star of stars) {
    const x = centerX + star.baseX * cosRotation - star.baseY * sinRotation;
    if (x < -CULL_MARGIN || x > maxX) {
      continue;
    }

    const y = centerY + star.baseX * sinRotation + star.baseY * cosRotation;
    if (y < -CULL_MARGIN || y > maxY) {
      continue;
    }

    const spawnAlpha = skipSpawnFade ? 1 : getStarSpawnAlpha(star, timestamp, introStartedAt, reducedMotion);
    if (spawnAlpha <= 0) {
      continue;
    }

    const pulse =
      reducedMotion || star.twinkleSpeed === null
        ? 1
        : 0.82 + ((Math.sin(twinklePhase * star.twinkleSpeed + star.twinkleOffset) + 1) / 2) * 0.24;
    const opacity = Math.min(0.95, star.baseOpacity * pulse * spawnAlpha);

    if (star.tone !== currentTone) {
      currentTone = star.tone;
      ctx.fillStyle = currentTone;
    }
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(x, y, star.radius, 0, TAU);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
};
