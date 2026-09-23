import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderKanban } from "lucide-react";
import type { DashboardEngagementItem } from "@/components/dashboard/tabs/encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §5.4): componente presentacional -- ya no
// consulta Supabase ni decide el alcance por rol (eso ahora lo resuelve el RPC
// list_dashboard_engagements(), vía useDashboardEngagements()). El único dueño de datos de
// la pestaña Encargo es EncargoTab.tsx, que le pasa options/value/onChange/isLoading.

interface EngagementSelectorProps {
  options: DashboardEngagementItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  isLoading: boolean;
}

export function EngagementSelector({ options, value, onChange, isLoading }: EngagementSelectorProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="h-10 bg-muted/50 rounded-md animate-pulse" />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <FolderKanban className="h-5 w-5 text-primary" />
      <Select
        value={value || ''}
        onValueChange={(v) => onChange(v || null)}
      >
        <SelectTrigger className="w-full max-w-md bg-card/80 backdrop-blur-sm border-border">
          <SelectValue placeholder={t('dashboard.encargo.selectEngagement')} />
        </SelectTrigger>
        <SelectContent>
          {options.length > 0 ? (
            options.map((eng) => (
              <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                <span className="font-medium text-primary">{eng.engagement_code || '—'}</span>
                <span className="mx-2">·</span>
                <span>{eng.engagement_name}</span>
                <span className="text-muted-foreground ml-2">
                  ({eng.client_legal_name || '—'})
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
