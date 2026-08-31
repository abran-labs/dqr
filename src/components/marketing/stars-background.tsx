import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";

import type { PointerPrecision, StarFieldResizeSnapshot } from "@/components/marketing/stars-background-resize";
import { shouldRegenerateStarField } from "@/components/marketing/stars-background-resize";
import type { Star, StarGenerationOptions } from "@/components/marketing/stars-background-scene";
import { DEFAULT_STAR_GENERATION, generateStars, getPalette, paintStarField } from "@/components/marketing/stars-background-scene";

type Scene = {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly devicePixelRatio: number;
  readonly fieldHeight: number;
  readonly fieldWidth: number;
  readonly introStartedAt: number | null;
  readonly stars: readonly Star[];
};

type StarBackgroundProps = {
  readonly allStarsTwinkle?: boolean;
  readonly className?: string;
  readonly maxTwinkleSpeed?: number;
  readonly minTwinkleSpeed?: number;
  readonly starDensity?: number;
  readonly twinkleProbability?: number;
};

const getPointerPrecision = (): PointerPrecision => (window.matchMedia("(pointer: coarse)").matches ? "coarse" : "fine");

const toResizeSnapshot = (scene: Scene): StarFieldResizeSnapshot => ({
  devicePixelRatio: scene.devicePixelRatio,
  hasStars: scene.stars.length > 0,
  height: scene.fieldHeight,
  width: scene.fieldWidth
});

const createEmptyScene = (): Scene => ({
  canvasHeight: 0,
  canvasWidth: 0,
  devicePixelRatio: 1,
  fieldHeight: 0,
  fieldWidth: 0,
  introStartedAt: null,
  stars: []
});

export function StarsBackground({
  starDensity = DEFAULT_STAR_GENERATION.starDensity,
  allStarsTwinkle = DEFAULT_STAR_GENERATION.allStarsTwinkle,
  twinkleProbability = DEFAULT_STAR_GENERATION.twinkleProbability,
  minTwinkleSpeed = DEFAULT_STAR_GENERATION.minTwinkleSpeed,
  maxTwinkleSpeed = DEFAULT_STAR_GENERATION.maxTwinkleSpeed,
  className
}: StarBackgroundProps) {
  const canvasRef: RefObject<HTMLCanvasElement | null> = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene>(createEmptyScene());
  const reducedMotionRef = useRef(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const generation: StarGenerationOptions = {
      allStarsTwinkle,
      maxTwinkleSpeed,
      minTwinkleSpeed,
      starDensity,
      twinkleProbability
    };
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrameId: number | null = null;

    const render = (timestamp: number) => {
      paint(timestamp);
      if (reducedMotionRef.current) {
        // Rotation and twinkle are both disabled under reduced motion, so the field is a
        // still image. Hold the last painted frame instead of redrawing it every vsync.
        animationFrameId = null;
        return;
      }
      animationFrameId = window.requestAnimationFrame(render);
    };

    const startRendering = () => {
      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(render);
      }
    };

    const handleMotionPreference = () => {
      reducedMotionRef.current = mediaQuery.matches;
      startRendering();
    };

    reducedMotionRef.current = mediaQuery.matches;
    mediaQuery.addEventListener("change", handleMotionPreference);

    const paint = (timestamp: number) => {
      const scene = sceneRef.current;

      if (scene.canvasWidth <= 0 || scene.canvasHeight <= 0 || scene.stars.length === 0) {
        return;
      }

      ctx.clearRect(0, 0, scene.canvasWidth, scene.canvasHeight);

      paintStarField({
        ctx,
        height: scene.fieldHeight,
        introStartedAt: scene.introStartedAt,
        reducedMotion: reducedMotionRef.current,
        stars: scene.stars,
        timestamp,
        width: scene.fieldWidth
      });
    };

    const updateScene = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : window.innerWidth;
      const height = rect.height > 0 ? rect.height : window.innerHeight;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const previousScene = sceneRef.current;
      const nextSnapshot: StarFieldResizeSnapshot = {
        devicePixelRatio,
        hasStars: previousScene.stars.length > 0,
        height,
        width
      };
      const regenerateStars = shouldRegenerateStarField(toResizeSnapshot(previousScene), nextSnapshot, getPointerPrecision());
      const now = performance.now();

      // Assigning width/height reallocates and clears the backing store, so only do it when
      // the pixel dimensions actually changed. ResizeObserver fires on observe() and on any
      // mobile viewport-height nudge, where the size is usually unchanged.
      const backingWidth = Math.floor(width * devicePixelRatio);
      const backingHeight = Math.floor(height * devicePixelRatio);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const fieldWidth = regenerateStars ? width : previousScene.fieldWidth;
      const fieldHeight = regenerateStars ? height : previousScene.fieldHeight;
      const playIntro = regenerateStars && previousScene.stars.length === 0 && !reducedMotionRef.current;

      sceneRef.current = {
        canvasHeight: height,
        canvasWidth: width,
        devicePixelRatio,
        fieldHeight,
        fieldWidth,
        introStartedAt: regenerateStars
          ? playIntro
            ? now
            : null
          : previousScene.introStartedAt,
        // getPalette() runs getComputedStyle on the document element, so only pay for that
        // style recalc on the ticks that actually rebuild the field.
        stars: regenerateStars
          ? generateStars({ width: fieldWidth, height: fieldHeight, palette: getPalette(), generation })
          : previousScene.stars
      };

      paint(now);
    };

    updateScene();

    const resizeObserver = new ResizeObserver(updateScene);
    resizeObserver.observe(canvas);

    startRendering();

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", handleMotionPreference);
    };
  }, [allStarsTwinkle, maxTwinkleSpeed, minTwinkleSpeed, starDensity, twinkleProbability]);

  return <canvas ref={canvasRef} className={className ? `stars-background ${className}` : "stars-background"} aria-hidden />;
}
