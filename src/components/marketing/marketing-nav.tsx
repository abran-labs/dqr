import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { isMarketingNavLinkActive, type SiteNavLink } from "@/components/marketing/site-nav-links";
import { requestCalculatorReset } from "@/lib/calculator-reset";
import { cn } from "@/lib/utils";

type MarketingNavProps = {
  navLinks: readonly SiteNavLink[];
  pathname: string;
};

const navLinkClass =
  "relative inline-flex h-11 items-center justify-center px-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[active=true]:text-foreground md:h-8";

export function MarketingNav({ navLinks, pathname: initialPathname }: MarketingNavProps) {
  const navLinksRef = useRef<HTMLDivElement>(null);
  const hasMeasuredRef = useRef(false);
  const readyFrameRef = useRef<number | null>(null);
  const [pathname, setPathname] = useState(initialPathname);
  const [isMobileNavFloating, setIsMobileNavFloating] = useState(false);
  const [activeIndicator, setActiveIndicator] = useState({
    left: 0,
    width: 0,
    visible: false,
  });
  const [isIndicatorReady, setIsIndicatorReady] = useState(false);

  useEffect(() => {
    setPathname(initialPathname);
  }, [initialPathname]);

  useEffect(() => {
    let scrollFrame: number | null = null;

    const syncFloatingState = () => {
      setIsMobileNavFloating(window.scrollY > 40);
      scrollFrame = null;
    };

    const queueFloatingStateSync = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(syncFloatingState);
    };

    syncFloatingState();
    window.addEventListener("scroll", queueFloatingStateSync, { passive: true });
    document.addEventListener("astro:page-load", queueFloatingStateSync);

    return () => {
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", queueFloatingStateSync);
      document.removeEventListener("astro:page-load", queueFloatingStateSync);
    };
  }, []);

  useEffect(() => {
    const syncPathname = () => {
      setPathname(window.location.pathname);
    };

    document.addEventListener("astro:page-load", syncPathname);
    document.addEventListener("astro:after-swap", syncPathname);
    window.addEventListener("popstate", syncPathname);

    return () => {
      document.removeEventListener("astro:page-load", syncPathname);
      document.removeEventListener("astro:after-swap", syncPathname);
      window.removeEventListener("popstate", syncPathname);
    };
  }, []);

  const measure = useCallback(() => {
    const hideIndicator = () => {
      setActiveIndicator((previous) => (previous.visible ? { ...previous, visible: false } : previous));
    };
    const navElement = navLinksRef.current;
    if (!navElement) return;

    const hasActiveLink = navLinks.some((link) => isMarketingNavLinkActive(pathname, link));
    if (!hasActiveLink) {
      hideIndicator();
      return;
    }

    const activeLink = navElement.querySelector<HTMLAnchorElement>('a[data-active="true"]');
    if (!activeLink) {
      hideIndicator();
      return;
    }

    const labelElement = activeLink.querySelector<HTMLSpanElement>("span[data-nav-label]");
    if (!labelElement) return;

    const navRect = navElement.getBoundingClientRect();
    const labelRect = labelElement.getBoundingClientRect();
    const width = Math.max(14, Math.round(labelRect.width - 8));
    const opticalLeftOffset = 1;
    const left = labelRect.left - navRect.left + (labelRect.width - width) / 2 - opticalLeftOffset;

    // Returning the previous object lets React bail out instead of re-rendering the nav for
    // a position it is already in. Resize observers fire far more often than the bar moves.
    setActiveIndicator((previous) =>
      previous.visible && previous.left === left && previous.width === width
        ? previous
        : { left, width, visible: true }
    );

    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      // Enable transitions one frame after initial positioning so first paint doesn't animate.
      readyFrameRef.current = window.requestAnimationFrame(() => {
        setIsIndicatorReady(true);
        readyFrameRef.current = null;
      });
    }
  }, [navLinks, pathname]);

  // Keep the latest measure closure reachable from listeners that are bound only once.
  const measureRef = useRef(measure);
  measureRef.current = measure;

  // Re-measure when the active route changes, after React has written the new data-active
  // attributes but before paint.
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Bound once. Previously these were torn down and re-created on every pathname change, and
  // ResizeObserver.observe() fires immediately, so each navigation triggered extra measure
  // passes, extra forced layouts, and extra renders while the bar was mid-transition.
  useLayoutEffect(() => {
    const navElement = navLinksRef.current;
    if (!navElement) return;

    const run = () => measureRef.current();
    window.addEventListener("resize", run);
    const resizeObserver = new ResizeObserver(run);
    resizeObserver.observe(navElement);

    return () => {
      if (readyFrameRef.current !== null) {
        window.cancelAnimationFrame(readyFrameRef.current);
      }
      window.removeEventListener("resize", run);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <nav
      className={cn(
        "relative rounded-lg border border-transparent px-2 transition-[transform,background-color,border-color] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:rounded-none md:border-transparent md:bg-transparent md:px-0 md:transform-none",
        isMobileNavFloating &&
          "translate-y-2 border-white/15 bg-white/[0.03] motion-reduce:translate-y-0",
      )}
      aria-label="Primary"
    >
      <div ref={navLinksRef} className="relative flex items-center gap-2 md:gap-3">
        {navLinks.map((link, index) => {
          const isActive = isMarketingNavLinkActive(pathname, link);
          const content = (
            <span data-nav-label className="inline-block">
              {link.label}
            </span>
          );
          const separator =
            index > 0 ? (
              <span aria-hidden="true" className="select-none text-xs text-border/70">
                |
              </span>
            ) : null;

          return (
            <Fragment key={link.href}>
              {separator}
              <a
                href={link.href}
                data-active={isActive ? "true" : "false"}
                aria-current={isActive ? "page" : undefined}
                className={navLinkClass}
                onClick={(event) => {
                  // Optimistic move so the bar slides before/during client navigation.
                  setPathname(link.href);
                  if (link.href !== "/") return;
                  requestCalculatorReset();
                  // Same-route ClientRouter no-ops — stop the click so we
                  // reset in place instead of keeping the filled island.
                  if (window.location.pathname === "/") event.preventDefault();
                }}
              >
                {content}
              </a>
            </Fragment>
          );
        })}
        <span
          className={cn(
            "absolute bottom-1 h-px rounded-full bg-primary shadow-[0_0_10px_color-mix(in_srgb,hsl(var(--primary))_70%,transparent),0_0_22px_color-mix(in_srgb,hsl(var(--primary))_35%,transparent)]",
            isIndicatorReady &&
              "transition-[left,width,opacity] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
          )}
          style={{
            left: `${activeIndicator.left}px`,
            width: `${activeIndicator.width}px`,
            opacity: activeIndicator.visible ? 1 : 0,
          }}
        />
      </div>
    </nav>
  );
}
