import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface TimesheetPolicies {
  maxBacklogWeeks: number;
  monthEndRule: string;
  employeeRetroDays: number;
  workDays: number;
  autoSaveSeconds: number;
}

const DEFAULT_POLICIES: TimesheetPolicies = {
  maxBacklogWeeks: 1,
  monthEndRule: "COMPLETE_SPANNING_WEEK",
  employeeRetroDays: 30,
  workDays: 5,
  autoSaveSeconds: 3,
};

export const useTimesheetPolicies = () => {
  return useQuery({
    queryKey: ["timesheet-policies"],
    queryFn: async (): Promise<TimesheetPolicies> => {
      const { data, error } = await supabase
        .from("global_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "TS_MAX_BACKLOG_WEEKS",
          "TS_MONTH_END_RULE",
          "TS_EMPLOYEE_RETRO_DAYS",
          "TS_WORK_DAYS",
          "TS_AUTO_SAVE_SECONDS",
        ]);

      if (error) {
        logger.error("Error fetching timesheet policies:", error);
        return DEFAULT_POLICIES;
      }

      const settingsMap = new Map(
        data?.map((s) => [s.setting_key, s.setting_value]) || []
      );

      return {
        maxBacklogWeeks: parseInt(
          settingsMap.get("TS_MAX_BACKLOG_WEEKS") || String(DEFAULT_POLICIES.maxBacklogWeeks),
          10
        ),
        monthEndRule:
          settingsMap.get("TS_MONTH_END_RULE") || DEFAULT_POLICIES.monthEndRule,
        employeeRetroDays: parseInt(
          settingsMap.get("TS_EMPLOYEE_RETRO_DAYS") || String(DEFAULT_POLICIES.employeeRetroDays),
          10
        ),
        workDays: parseInt(
          settingsMap.get("TS_WORK_DAYS") || String(DEFAULT_POLICIES.workDays),
          10
        ),
        autoSaveSeconds: parseInt(
          settingsMap.get("TS_AUTO_SAVE_SECONDS") || String(DEFAULT_POLICIES.autoSaveSeconds),
          10
        ),
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};
