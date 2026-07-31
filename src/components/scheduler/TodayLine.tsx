// Phase 4 — EMS-owned Today marker (plan §6, I-9).
//
// SVAR's `markers` are PRO-only (the MIT store force-clears them —
// verified), so EMS renders its own 1px brand-teal line. The line is
// portaled INTO the chart's full-width content element (`.wx-area`, a
// stable semantic class) so it scrolls natively with the timeline; its x
// offset mirrors SVAR's cell layout via todayOffsetPx (unit cells are
// equal width, position within a cell is proportional by day).
//
// "Today" here is CLIENT-LOCAL by design; the L1 staffing-health dot is
// server-UTC and labeled as such (§5/§9) — the two may legitimately
// disagree around midnight.

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  todayOffsetPx,
  toLocalDate,
  ZOOM_CONFIG,
  type SchedulerZoom,
} from "@/lib/schedulerGantt";

interface TodayLineProps {
  hostRef: RefObject<HTMLElement | null>;
  zoom: SchedulerZoom;
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
  /** Bump to re-locate the chart area after zoom/data/theme remounts. */
  refreshKey: string;
}

export function TodayLine({ hostRef, zoom, from, to, refreshKey }: TodayLineProps) {
  const { t } = useTranslation();
  const [area, setArea] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // The Gantt renders synchronously on mount, but zoom/theme changes
    // replace the internal chart DOM — re-locate after every commit and
    // watch for late mounts.
    const locate = () =>
      setArea(hostRef.current?.querySelector<HTMLElement>(".wx-area") ?? null);
    locate();
    const id = window.setTimeout(locate, 0);
    const observer = hostRef.current
      ? new MutationObserver(locate)
      : null;
    if (hostRef.current && observer) {
      observer.observe(hostRef.current, { childList: true, subtree: true });
    }
    return () => {
      window.clearTimeout(id);
      observer?.disconnect();
    };
  }, [hostRef, refreshKey]);

  if (!area) return null;

  const today = new Date();
  const fromD = toLocalDate(from);
  const toD = toLocalDate(to);
  if (today < fromD || today > toD) return null;

  const left = todayOffsetPx(zoom, from, today, ZOOM_CONFIG[zoom].cellWidth);
  if (left === null) return null;

  return createPortal(
    <div
      className="sch-today-line"
      style={{ left: `${left}px` }}
      title={t("scheduler.gantt.today")}
      aria-hidden="true"
    />,
    area
  );
}
