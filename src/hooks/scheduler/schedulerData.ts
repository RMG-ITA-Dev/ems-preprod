// Shared scheduler-data transport: typed errors + invoke helper.
//
// Error contract: failures THROW — never swallow to [].
//   - transport error / non-2xx / { error } body → SchedulerDataError
//   - function-not-deployed signature (gateway 404 without the EMS
//     envelope, or a fetch-level failure) → SchedulerUnavailableError,
//     rendered as a DISTINCT "Unavailable" state — never a fake empty
//     schedule.
//   - ONLY a 2xx with rows renders data; 2xx with zero rows renders Empty.
//
// Fase 3 (plan v2 §1): `status` es el string legacy del engagement,
// conservado solo para diagnóstico/compatibilidad. `engagement_status` es
// el ESTADO EFECTIVO NUMÉRICO (1-9, src/lib/engagementStatus.ts —
// EngagementState) calculado server-side; null cuando no puede derivarse
// de forma segura. En el timeline, `status` sigue siendo el estado del
// ASSIGNMENT (no se reutiliza para el engagement).

import { supabase } from "@/integrations/supabase/client";

export class SchedulerDataError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "SchedulerDataError";
    this.code = code;
    this.status = status;
  }
}

export class SchedulerUnavailableError extends Error {
  constructor() {
    super("The scheduler-data edge function is not reachable (not deployed?)");
    this.name = "SchedulerUnavailableError";
  }
}

export type StaffingHealth = "unknown" | "under" | "on_target" | "over";

export interface SchedulerL1Row {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  start_date: string | null;
  end_date: string | null;
  /** String legacy (`engagements.status`) — diagnóstico/compatibilidad, no fuente de verdad. */
  status: string | null;
  /** Estado efectivo numérico 1-9 (EngagementState) — fuente de verdad para filtros/color. */
  engagement_status: number | null;
  partner_id: string | null;
  manager_id: string | null;
  client_id: string | null;
  client_name: string | null;
  partner_short_name: string | null;
  manager_short_name: string | null;
  assignment_count: number;
  demand_count: number;
  staffing_health: StaffingHealth;
}

export interface SchedulerL1Result {
  rows: SchedulerL1Row[];
  truncated: boolean;
}

export interface StaffLoadRow {
  staff_id: string;
  active_engagement_count: number;
}

// scheduler-staff-timeline: the viewer-scoped cross-engagement timeline
// for one staff member. Hidden engagements arrive as a COUNT only —
// identities never reach the client.
export interface StaffTimelineSegmentRow {
  assignment_id: string;
  engagement_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  /** Estado del ASSIGNMENT (PROPOSED/PROVISIONAL/CONFIRMED/COMPLETED/CANCELLED). */
  status: string | null;
  engagement_code: string | null;
  engagement_name: string;
  /** Estado efectivo numérico 1-9 del ENGAGEMENT — fuente de verdad para color de barra. */
  engagement_status: number | null;
  client_name: string | null;
  /** Vista de un manager sobre un engagement que NO lidera: fila de
   *  contexto morada — nombre + su manager, cliente omitido, sin navegación. */
  out_of_scope: boolean;
  manager_name: string | null;
}

export interface StaffTimelineStaff {
  staff_id: string;
  first_name: string;
  last_name: string;
  short_name: string | null;
  weekly_capacity_hours: number | null;
}

/** Total booking level over a date stretch, computed server-side over ALL
 *  segments (visible + hidden) — aggregates only. */
export interface UtilizationBand {
  start_date: string;
  end_date: string; // inclusive
  total_allocation_percent: number;
  total_hours_per_week: number;
}

export interface StaffTimelineResult {
  staff: StaffTimelineStaff | null;
  rows: StaffTimelineSegmentRow[];
  hiddenEngagementCount: number;
  truncated: boolean;
  /** Contiguous full-window coverage; [] means UNKNOWN (schema window). */
  utilization: UtilizationBand[];
}

interface EnvelopeError {
  error?: { code?: string; message?: string };
}

/**
 * Pure mapping from a supabase.functions.invoke outcome to the typed
 * error contract (exported for unit tests).
 *
 * @param errorName  invoke error's .name (FunctionsHttpError | FunctionsRelayError | FunctionsFetchError)
 * @param status     HTTP status from error.context, when available
 * @param body       parsed response body, when available
 */
export function mapInvokeFailure(
  errorName: string | undefined,
  status: number | undefined,
  body: unknown
): SchedulerDataError | SchedulerUnavailableError {
  const envelope = (body ?? {}) as EnvelopeError;
  const hasEnvelope =
    typeof envelope.error?.code === "string" && envelope.error.code.length > 0;

  // Fetch-level failure: could be network OR missing deployment — both
  // render Unavailable rather than a fake Empty.
  if (errorName === "FunctionsFetchError") {
    return new SchedulerUnavailableError();
  }
  // Gateway 404 without the EMS envelope = function not deployed. (The
  // function's own 404 — e.g. staff-load "not_found" — carries the
  // envelope and stays a SchedulerDataError.)
  if (status === 404 && !hasEnvelope) {
    return new SchedulerUnavailableError();
  }
  if (hasEnvelope) {
    return new SchedulerDataError(
      envelope.error!.code!,
      envelope.error!.message ?? "Scheduler request failed",
      status
    );
  }
  return new SchedulerDataError(
    "unknown",
    "Scheduler request failed",
    status
  );
}

/**
 * Deterministic invalid-session failure for RETRY predicates: a revoked
 * session won't heal between attempts — retrying only pumps more doomed
 * 401s while recovery runs.
 */
export function isSchedulerAuthFailure(error: unknown): boolean {
  return (
    error instanceof SchedulerDataError &&
    (error.code === "unauthorized" || error.status === 401)
  );
}

export async function invokeSchedulerData<T>(
  body: Record<string, unknown>
): Promise<T> {
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke("scheduler-data", {
      body,
    }));
  } catch {
    throw new SchedulerUnavailableError();
  }

  if (error) {
    const e = error as {
      name?: string;
      context?: { status?: number; json?: () => Promise<unknown> };
    };
    let parsedBody: unknown = null;
    try {
      parsedBody = await e.context?.json?.();
    } catch {
      parsedBody = null;
    }
    throw mapInvokeFailure(e.name, e.context?.status, parsedBody);
  }

  // Defensive: a 2xx body carrying an envelope is still an error.
  const envelope = (data ?? {}) as EnvelopeError;
  if (envelope.error?.code) {
    throw new SchedulerDataError(
      envelope.error.code,
      envelope.error.message ?? "Scheduler request failed"
    );
  }
  return data as T;
}
