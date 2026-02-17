import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalSettings } from "./useEmsData";
import { toISODateString } from "@/lib/timesheetUtils";

export interface Holiday {
  holiday_id: string;
  holiday_date: string;
  holiday_name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useHolidays() {
  return useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .order("holiday_date", { ascending: false });
      if (error) throw error;
      return data as Holiday[];
    },
  });
}

export function useHolidaysForWeek(weekDates: Date[]) {
  const startStr = weekDates.length > 0 ? toISODateString(weekDates[0]) : "";
  const endStr =
    weekDates.length > 0
      ? toISODateString(weekDates[weekDates.length - 1])
      : "";

  const query = useQuery({
    queryKey: ["holidays-week", startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("holiday_date, holiday_name")
        .gte("holiday_date", startStr)
        .lte("holiday_date", endStr);
      if (error) throw error;

      const map = new Map<string, string>();
      (data || []).forEach((h: { holiday_date: string; holiday_name: string }) => {
        // DB returns YYYY-MM-DD; use raw string as key
        map.set(h.holiday_date, h.holiday_name);
      });
      return map;
    },
    enabled: weekDates.length > 0,
  });

  return query.data ?? new Map<string, string>();
}

export function useHolidayEngagementId(): string | null {
  const { data: settings } = useGlobalSettings();
  const raw =
    settings?.find((s) => s.setting_key === "HOLIDAY_ENGAGEMENT_ID")
      ?.setting_value ?? "";
  return raw.trim() || null;
}
