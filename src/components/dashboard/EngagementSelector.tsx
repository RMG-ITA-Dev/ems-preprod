import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useDashboard } from "@/contexts/DashboardContext";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderKanban } from "lucide-react";

export function EngagementSelector() {
  const { t } = useTranslation();
  const { staffRecord } = useCurrentStaff();
  const { selectedEngagementId, setSelectedEngagementId, startDateStr, endDateStr } = useDashboard();
  const { isPartner, isManager } = useDashboardAccess();

  // Fetch accessible engagements based on role
  const { data: engagements, isLoading } = useQuery({
    queryKey: ['encargo-engagements', staffRecord?.staff_id, isPartner, isManager, startDateStr, endDateStr],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return [];

      // Partners see all engagements
      if (isPartner) {
        const { data, error } = await supabase
          .from('engagements')
          .select(`
            engagement_id,
            engagement_code,
            engagement_name,
            status,
            client:clients(client_legal_name)
          `)
          .eq('status', 'active')
          .order('engagement_code');
        
        if (error) throw error;
        return data || [];
      }

      // Managers see engagements where they are partner or manager
      if (isManager) {
        const { data, error } = await supabase
          .from('engagements')
          .select(`
            engagement_id,
            engagement_code,
            engagement_name,
            status,
            client:clients(client_legal_name)
          `)
          .eq('status', 'active')
          .or(`partner_id.eq.${staffRecord.staff_id},manager_id.eq.${staffRecord.staff_id}`)
          .order('engagement_code');
        
        if (error) throw error;
        return data || [];
      }

      // Staff see engagements where they've logged time in the period
      const { data: timeData, error: timeError } = await supabase
        .from('time_entries')
        .select(`
          engagement_id,
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name,
            status,
            client:clients(client_legal_name)
          )
        `)
        .eq('staff_id', staffRecord.staff_id)
        .gte('date_worked', startDateStr)
        .lte('date_worked', endDateStr);

      if (timeError) throw timeError;

      // Deduplicate engagements
      const uniqueEngagements = new Map();
      timeData?.forEach(entry => {
        const eng = entry.engagement;
        if (eng && !uniqueEngagements.has(eng.engagement_id)) {
          uniqueEngagements.set(eng.engagement_id, eng);
        }
      });

      return Array.from(uniqueEngagements.values())
        .sort((a, b) => (a.engagement_code || '').localeCompare(b.engagement_code || ''));
    },
    enabled: !!staffRecord?.staff_id,
  });

  if (isLoading) {
    return (
      <div className="h-10 bg-muted/50 rounded-md animate-pulse" />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <FolderKanban className="h-5 w-5 text-primary" />
      <Select
        value={selectedEngagementId || ''}
        onValueChange={(value) => setSelectedEngagementId(value || null)}
      >
        <SelectTrigger className="w-full max-w-md bg-card/80 backdrop-blur-sm border-border">
          <SelectValue placeholder={t('dashboard.encargo.selectEngagement')} />
        </SelectTrigger>
        <SelectContent>
          {engagements && engagements.length > 0 ? (
            engagements.map((eng) => (
              <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                <span className="font-medium text-primary">{eng.engagement_code || '—'}</span>
                <span className="mx-2">·</span>
                <span>{eng.engagement_name}</span>
                <span className="text-muted-foreground ml-2">
                  ({(eng.client as any)?.client_legal_name || '—'})
                </span>
              </SelectItem>
            ))
          ) : (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              {t('dashboard.encargo.noEngagements')}
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
