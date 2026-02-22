import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WeekStatusCode =
  | 'APPROVED'
  | 'PENDING_APPROVAL'
  | 'NOT_LOGGED'
  | 'NOT_SUBMITTED'
  | 'DRAFT'
  | 'REJECTED'
  | 'CURRENT'
  | 'FUTURE';

export interface WeekStatus {
  week_start: string;
  week_end: string;
  status: WeekStatusCode;
  total_logged_hours: number;
  expected_hours: number;
  missing_hours: number;
  is_submitted: boolean;
  is_current_week: boolean;
}

export function useWeekStatuses(
  staffId: string | undefined,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ['week-statuses', staffId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_week_statuses', {
        p_staff_id: staffId!,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return (data as unknown as WeekStatus[]) || [];
    },
    enabled: !!staffId && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
  });
}
