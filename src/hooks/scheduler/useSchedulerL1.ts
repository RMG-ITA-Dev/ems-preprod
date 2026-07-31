// Level-1 Scheduler rows. Exposes TanStack Query isError / error / refetch
// to the page — failures throw typed errors (SchedulerDataError /
// SchedulerUnavailableError), never swallow to [].
//
// Fase 3 (plan v2 §1): statusFilter filtra por el BUCKET del estado
// efectivo (activo/pendiente/completado/cancelado/congelado), calculado
// server-side desde el estado numérico 1-9 — nunca contra la columna
// legacy `engagements.status`.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { SCHEDULER_L1_KEY } from "./keys";
import {
  invokeSchedulerData,
  isSchedulerAuthFailure,
  SchedulerUnavailableError,
  type SchedulerL1Result,
} from "./schedulerData";

export type SchedulerL1StatusFilter =
  | "active"
  | "pending"
  | "completed"
  | "cancelled"
  | "frozen"
  | "all";

export interface SchedulerL1Input {
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
  statusFilter?: SchedulerL1StatusFilter;
  partnerFilter?: string;
  managerFilter?: string;
  clientFilter?: string;
}

export function useSchedulerL1Rows(input: SchedulerL1Input) {
  const { user } = useAuth();
  const viewerId = user?.id;
  const statusFilter = input.statusFilter ?? "all";
  return useQuery<SchedulerL1Result, Error>({
    queryKey: [
      SCHEDULER_L1_KEY,
      viewerId,
      input.from,
      input.to,
      statusFilter,
      input.partnerFilter ?? null,
      input.managerFilter ?? null,
      input.clientFilter ?? null,
    ],
    queryFn: () =>
      invokeSchedulerData<SchedulerL1Result>({
        action: "scheduler-l1",
        startDate: input.from,
        endDate: input.to,
        statusFilter,
        partnerId: input.partnerFilter || undefined,
        managerId: input.managerFilter || undefined,
        clientId: input.clientFilter || undefined,
      }),
    enabled: Boolean(viewerId && input.from && input.to),
    staleTime: 60_000, // operational list
    // A missing deployment will not fix itself between retries; neither
    // will a revoked session (the session-recovery boundary resolves it).
    retry: (failureCount, error) =>
      !(error instanceof SchedulerUnavailableError) &&
      !isSchedulerAuthFailure(error) &&
      failureCount < 2,
  });
}
