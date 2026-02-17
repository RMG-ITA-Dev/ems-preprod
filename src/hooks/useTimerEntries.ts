import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "./useCurrentStaff";
import { useCallback } from "react";

export interface TimerEntry {
  timer_id: string;
  staff_id: string;
  engagement_id: string;
  activity_id: string;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  is_imported: boolean;
  imported_to_time_id: string | null;
  created_at: string;
  engagement?: {
    engagement_name: string;
    engagement_code: string | null;
  };
  activity?: {
    activity_code: string;
    description: string;
  };
}

export function useTimerEntries() {
  const { staffRecord } = useCurrentStaff();
  
  return useQuery({
    queryKey: ['timer_entries', staffRecord?.staff_id],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return [];
      
      const { data, error } = await supabase
        .from('timer_entries')
        .select(`
          *,
          engagement:engagements(engagement_name, engagement_code),
          activity:activity_codes(activity_code, description)
        `)
        .eq('staff_id', staffRecord.staff_id)
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      return data as TimerEntry[];
    },
    enabled: !!staffRecord?.staff_id,
  });
}

export function useUnimportedTimerEntries(weekStart: Date, weekEnd: Date) {
  const { staffRecord } = useCurrentStaff();
  
  return useQuery({
    queryKey: ['timer_entries_unimported', staffRecord?.staff_id, weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return [];
      
      const { data, error } = await supabase
        .from('timer_entries')
        .select(`
          *,
          engagement:engagements(engagement_name, engagement_code),
          activity:activity_codes(activity_code, description)
        `)
        .eq('staff_id', staffRecord.staff_id)
        .eq('is_imported', false)
        .not('ended_at', 'is', null)
        .gte('started_at', weekStart.toISOString())
        .lte('started_at', weekEnd.toISOString())
        .order('started_at', { ascending: false });
      
      if (error) throw error;
      return data as TimerEntry[];
    },
    enabled: !!staffRecord?.staff_id,
  });
}

export function useCreateTimerEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (entry: {
      staff_id: string;
      engagement_id: string;
      activity_id: string;
      description?: string;
      started_at: string;
      ended_at?: string;
      duration_minutes?: number;
    }) => {
      const { data, error } = await supabase
        .from('timer_entries')
        .insert(entry)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer_entries'] });
    },
  });
}

export function useUpdateTimerEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ timer_id, ...updates }: {
      timer_id: string;
      started_at?: string;
      ended_at?: string;
      duration_minutes?: number;
      description?: string;
      engagement_id?: string;
      activity_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('timer_entries')
        .update(updates)
        .eq('timer_id', timer_id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer_entries'] });
    },
  });
}

export function useDeleteTimerEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (timer_id: string) => {
      const { error } = await supabase
        .from('timer_entries')
        .delete()
        .eq('timer_id', timer_id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer_entries'] });
    },
  });
}

export function useRunningTimerEntries() {
  const { staffRecord } = useCurrentStaff();

  return useQuery({
    queryKey: ['timer_entries_running', staffRecord?.staff_id],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return [];

      const { data, error } = await supabase
        .from('timer_entries')
        .select('timer_id, started_at, engagement_id, activity_id')
        .eq('staff_id', staffRecord.staff_id)
        .is('ended_at', null)
        .order('started_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!staffRecord?.staff_id,
  });
}

export function useMarkTimerEntriesImported() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (entries: { timer_id: string; time_id: string }[]) => {
      for (const entry of entries) {
        const { error } = await supabase
          .from('timer_entries')
          .update({
            is_imported: true,
            imported_to_time_id: entry.time_id,
          })
          .eq('timer_id', entry.timer_id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timer_entries'] });
      queryClient.invalidateQueries({ queryKey: ['timer_entries_unimported'] });
    },
  });
}

/**
 * Query: returns the single running timer entry (ended_at IS NULL) for current staff, or null.
 */
export function useRunningTimerEntry() {
  const { staffRecord } = useCurrentStaff();

  return useQuery({
    queryKey: ['running_timer', staffRecord?.staff_id],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return null;

      const { data, error } = await supabase
        .from('timer_entries')
        .select(`
          *,
          engagement:engagements(engagement_name, engagement_code),
          activity:activity_codes(activity_code, description)
        `)
        .eq('staff_id', staffRecord.staff_id)
        .is('ended_at', null)
        .maybeSingle();

      if (error) throw error;
      return data as TimerEntry | null;
    },
    enabled: !!staffRecord?.staff_id,
  });
}

/**
 * Mutation: calls start_timer_entry RPC.
 * On RUNNING_TIMER_EXISTS error, extracts existing timer_id for reattach.
 */
export function useStartTimerRPC() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      engagement_id: string;
      activity_id: string;
      description?: string;
    }) => {
      const { data, error } = await supabase.rpc('start_timer_entry', {
        p_engagement_id: params.engagement_id,
        p_activity_id: params.activity_id,
        p_description: params.description || null,
      });

      if (error) {
        // Check for RUNNING_TIMER_EXISTS pattern
        const match = error.message?.match(/RUNNING_TIMER_EXISTS:(.+)/);
        if (match) {
          const existingId = match[1].trim();
          throw Object.assign(new Error('RUNNING_TIMER_EXISTS'), { existingTimerId: existingId });
        }
        throw error;
      }
      return data as string; // returns timer_id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['running_timer'] });
      queryClient.invalidateQueries({ queryKey: ['timer_entries'] });
      queryClient.invalidateQueries({ queryKey: ['timer_entries_running'] });
    },
  });
}

/**
 * Mutation: calls stop_timer_entry RPC. Server handles clamp + round.
 */
export function useStopTimerRPC() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { timer_id: string }) => {
      const { data, error } = await supabase.rpc('stop_timer_entry', {
        p_timer_id: params.timer_id,
      });

      if (error) throw error;
      return data as { timer_id: string; duration_minutes: number }[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['running_timer'] });
      queryClient.invalidateQueries({ queryKey: ['timer_entries'] });
      queryClient.invalidateQueries({ queryKey: ['timer_entries_running'] });
    },
  });
}

/**
 * Imperative: calls finalize_my_stale_timers RPC. Returns count of finalized entries.
 */
export function useFinalizeMyStaleTimers() {
  const queryClient = useQueryClient();

  const finalize = useCallback(async (): Promise<number> => {
    const { data, error } = await supabase.rpc('finalize_my_stale_timers');
    if (error) {
      console.error('finalize_my_stale_timers error:', error);
      return 0;
    }
    if (data && data > 0) {
      queryClient.invalidateQueries({ queryKey: ['running_timer'] });
      queryClient.invalidateQueries({ queryKey: ['timer_entries'] });
    }
    return (data as number) || 0;
  }, [queryClient]);

  return finalize;
}
