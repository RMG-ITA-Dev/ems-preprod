// Phase 7 (D-P7-15; PR #233 R2 review P1-01): rendered-container width,
// kept current via ResizeObserver. Pane-composition decisions must be
// made from the CONTAINER a widget actually occupies, not the viewport —
// with the expanded 256px sidebar plus two padding layers, a 768–1000px
// viewport leaves a sub-650px Gantt host while useIsMobile() reports
// desktop, and the two breakpoints disagree.

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Returns a ref to attach to the container and its current width in px —
 * `null` until the first layout measurement, so callers can defer
 * width-dependent composition instead of committing to a wrong guess.
 */
export function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    // jsdom has no ResizeObserver; the initial measurement above still
    // runs there, and real browsers get live updates below.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined) {
        setWidth((prev) => (prev === next ? prev : next));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
