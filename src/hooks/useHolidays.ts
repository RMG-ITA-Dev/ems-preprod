import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalSettings } from "./useEmsData";
import { useCurrentStaff } from "./useCurrentStaff";
import { toISODateString } from "@/lib/timesheetUtils";

export interface Holiday {
  holiday_id: string;
  holiday_date: string;
  holiday_name: string;
  oficina: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// oficina=0 (Todas) always applies; 1=La Paz, 2=Santa Cruz apply only to the
// matching staff city. Staff with no city only ever match oficina=0.
function holidayAppliesToCity(oficina: number, city: string | null | undefined): boolean {
  if (oficina === 0) return true;
  if (!city) return false;
  if (oficina === 1) return city === "La Paz";
  if (oficina === 2) return city === "Santa Cruz";
  return false;
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
  const { staffRecord } = useCurrentStaff();
  const staffCity = staffRecord?.city ?? null;

  const startStr = weekDates.length > 0 ? toISODateString(weekDates[0]) : "";
  const endStr =
    weekDates.length > 0
      ? toISODateString(weekDates[weekDates.length - 1])
      : "";

  const query = useQuery({
    queryKey: ["holidays-week", startStr, endStr, staffCity],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("holiday_date, holiday_name, oficina")
        .gte("holiday_date", startStr)
        .lte("holiday_date", endStr);
      if (error) throw error;

      const map = new Map<string, string>();
      (data || []).forEach(
        (h: { holiday_date: string; holiday_name: string; oficina: number }) => {
          if (holidayAppliesToCity(h.oficina, staffCity)) {
            // DB returns YYYY-MM-DD; use raw string as key
            map.set(h.holiday_date, h.holiday_name);
          }
        }
      );
      return map;
    },
    // Don't run until the staff record has resolved (even to null) — filtering
    // by office requires knowing the city first.
    enabled: weekDates.length > 0 && staffRecord !== undefined,
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
