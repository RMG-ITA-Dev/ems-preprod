import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "./useCurrentStaff";

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
