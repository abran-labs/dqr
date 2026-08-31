export type PointerPrecision = "coarse" | "fine";

export type StarFieldResizeSnapshot = {
  readonly devicePixelRatio: number;
  readonly hasStars: boolean;
  readonly height: number;
  readonly width: number;
};

const SIZE_DELTA_EPSILON_PX = 1;
const MOBILE_BROWSER_CHROME_DELTA_PX = 160;

export const shouldRegenerateStarField = (
  previous: StarFieldResizeSnapshot,
  next: StarFieldResizeSnapshot,
  pointerPrecision: PointerPrecision
) => {
  if (!previous.hasStars) {
    return true;
  }

  if (Math.abs(previous.width - next.width) > SIZE_DELTA_EPSILON_PX) {
    return true;
  }

  if (previous.devicePixelRatio !== next.devicePixelRatio) {
    return true;
  }

  const heightDelta = Math.abs(previous.height - next.height);

  if (heightDelta <= SIZE_DELTA_EPSILON_PX) {
    return false;
  }

  if (pointerPrecision === "coarse" && heightDelta <= MOBILE_BROWSER_CHROME_DELTA_PX) {
    return false;
  }

  return true;
};
