import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { EngagementCard } from "@/components/dashboard/EngagementCard";
import { RecentTimeEntries } from "@/components/dashboard/RecentTimeEntries";
import { Briefcase, Clock, DollarSign, Users } from "lucide-react";
import { useEngagements, useStaff, useTimeEntries, useWorkOrders } from "@/hooks/useEmsData";

const Index = () => {
  const { t } = useTranslation();
  const { data: engagements } = useEngagements();
  const { data: staff } = useStaff();
  const { data: timeEntries } = useTimeEntries();
  const { data: workOrders } = useWorkOrders();

  const activeEngagements = engagements?.filter(e => e.status === 'active') || [];
  
  const recentEntries = timeEntries?.slice(0, 5).map(te => ({
    id: te.time_id,
    date: te.date_worked,
    hours: Number(te.hours_logged),
    engagement: `${te.engagement?.client?.client_legal_name} - ${te.engagement?.engagement_name}`,
    activity: te.activity?.description || te.activity?.activity_code || '',
  })) || [];

  const weekHours = timeEntries?.reduce((sum, te) => sum + Number(te.hours_logged), 0) || 0;

  return (
    <AppLayout title={t("dashboard.title")}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={t("dashboard.activeEngagements")} value={activeEngagements.length} icon={<Briefcase className="h-6 w-6" />} />
          <StatCard title={t("dashboard.hoursLogged")} value={weekHours.toFixed(1)} icon={<Clock className="h-6 w-6" />} />
          <StatCard title={t("dashboard.workOrders")} value={workOrders?.length || 0} icon={<DollarSign className="h-6 w-6" />} />
          <StatCard title={t("dashboard.activeStaff")} value={staff?.length || 0} icon={<Users className="h-6 w-6" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("dashboard.activeEngagements")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeEngagements.slice(0, 4).map((engagement) => (
                <EngagementCard
                  key={engagement.engagement_id}
                  clientName={engagement.client?.client_legal_name || ''}
                  engagementName={engagement.engagement_name}
                  partner={`${engagement.partner?.first_name || ''} ${engagement.partner?.last_name || ''}`}
                  progress={65}
                  budgetedHours={480}
                  actualHours={312}
                  status="active"
                />
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">{t("dashboard.recentTime")}</h2>
            <RecentTimeEntries entries={recentEntries} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
