import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { Briefcase, Clock, DollarSign, Users } from "lucide-react";
import { useEngagements, useStaff, useTimeEntries, useWorkOrders } from "@/hooks/useEmsData";

const Index = () => {
  const { t } = useTranslation();
  const { data: engagements } = useEngagements();
  const { data: staff } = useStaff();
  const { data: timeEntries } = useTimeEntries();
  const { data: workOrders } = useWorkOrders();

  const activeEngagementsCount = engagements?.filter(e => e.status === 'active').length || 0;
  const weekHours = timeEntries?.reduce((sum, te) => sum + Number(te.hours_logged), 0) || 0;

  return (
    <AppLayout title={t("dashboard.title")}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={t("dashboard.activeEngagements")} value={activeEngagementsCount} icon={<Briefcase className="h-6 w-6" />} />
          <StatCard title={t("dashboard.hoursLogged")} value={weekHours.toFixed(1)} icon={<Clock className="h-6 w-6" />} />
          <StatCard title={t("dashboard.workOrders")} value={workOrders?.length || 0} icon={<DollarSign className="h-6 w-6" />} />
          <StatCard title={t("dashboard.activeStaff")} value={staff?.length || 0} icon={<Users className="h-6 w-6" />} />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
