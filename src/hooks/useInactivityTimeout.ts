import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import i18n from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TIMEOUT_MIN = 30;
const WARNING_BEFORE_MS = 2 * 60 * 1000;
const THROTTLE_MS = 60 * 1000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

const BC_CHANNEL = "ems_session_channel";

export function useInactivityTimeout(timeoutMinutes: number = DEFAULT_TIMEOUT_MIN) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const safeTimeout = Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
    ? timeoutMinutes
    : DEFAULT_TIMEOUT_MIN;
  const timeoutMs = safeTimeout * 60 * 1000;

  const logoutTimerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const lastResetRef = useRef<number>(0);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const clearTimers = useCallback(() => {
    if (logoutTimerRef.current) window.clearTimeout(logoutTimerRef.current);
    if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
    logoutTimerRef.current = null;
    warningTimerRef.current = null;
  }, []);

  const doLogout = useCallback(async (remote = false) => {
    clearTimers();
    if (!remote) {
      bcRef.current?.postMessage({ type: "LOGOUT" });
      toast.info(i18n.t("auth.sessionExpiredInactivity"));
    }
    try {
      // Finalize stale timers (>8h) before logout — no-op if under 8h
      await supabase.rpc('finalize_my_stale_timers');
      await signOut();
    } finally {
      navigate("/auth", { replace: true });
    }
  }, [signOut, navigate, clearTimers]);

  const startTimers = useCallback(() => {
    clearTimers();

    if (timeoutMs > WARNING_BEFORE_MS) {
      warningTimerRef.current = window.setTimeout(() => {
        toast.warning(i18n.t("auth.sessionWarningInactivity"));
      }, timeoutMs - WARNING_BEFORE_MS);
    }

    logoutTimerRef.current = window.setTimeout(() => {
      void doLogout(false);
    }, timeoutMs);
  }, [clearTimers, doLogout, timeoutMs]);

  const onActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastResetRef.current < THROTTLE_MS) return;
    lastResetRef.current = now;
    startTimers();
  }, [startTimers]);

  useEffect(() => {
    if (!user) return;

    // Cross-tab sync
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_CHANNEL);
      bcRef.current = bc;
      bc.onmessage = (evt) => {
        if (evt?.data?.type === "LOGOUT") {
          void doLogout(true);
        }
      };
    } catch {
      // BroadcastChannel not supported -- single-tab fallback
    }

    // Visibility handler for backgrounded tabs
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastResetRef.current = Date.now();
        startTimers();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Activity listeners
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );

    // Start immediately
    lastResetRef.current = Date.now();
    startTimers();

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
      bc?.close();
      bcRef.current = null;
    };
  }, [user, startTimers, onActivity, doLogout, clearTimers]);
}
