import { useBlocker } from "react-router-dom";
import { useEffect, useRef } from "react";

interface UsePageLeaveLockOptions {
  locked: boolean;
  isDirty?: boolean;
}

export function usePageLeaveLock({ locked, isDirty }: UsePageLeaveLockOptions) {
  const bypassRef = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      locked &&
      !bypassRef.current &&
      currentLocation.pathname !== nextLocation.pathname
  );

  // beforeunload for tab close/refresh
  useEffect(() => {
    if (!locked) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [locked]);

  const allowNextNavigation = () => {
    bypassRef.current = true;
    queueMicrotask(() => {
      bypassRef.current = false;
    });
  };

  return { blocker, allowNextNavigation, isDirty: isDirty ?? false };
}
