import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Timer } from "lucide-react";
import { useRunningTimerEntry } from "@/hooks/useTimerEntries";

const MAX_SECONDS = 28800; // 8h

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RunningTimerChip() {
  const navigate = useNavigate();
  const { data: runningEntry } = useRunningTimerEntry();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!runningEntry?.started_at) {
      setElapsed(0);
      return;
    }

    const startMs = new Date(runningEntry.started_at).getTime();

    const tick = () => {
      const raw = Math.floor((Date.now() - startMs) / 1000);
      setElapsed(Math.min(raw, MAX_SECONDS));
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [runningEntry?.started_at]);

  if (!runningEntry) return null;

  const engagementCode = runningEntry.engagement?.engagement_code;

  return (
    <button
      onClick={() => navigate("/tracker/new")}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 border border-success/30 text-success hover:bg-success/25 transition-colors text-xs font-medium flex-shrink-0"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
      </span>
      <Timer className="h-3.5 w-3.5" />
      <span className="font-mono">{formatElapsed(elapsed)}</span>
      {engagementCode && (
        <span className="hidden sm:inline text-success/80">· {engagementCode}</span>
      )}
    </button>
  );
}
