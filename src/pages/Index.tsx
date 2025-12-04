import { AppLayout } from "@/components/layout/AppLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { EngagementCard } from "@/components/dashboard/EngagementCard";
import { RecentTimeEntries } from "@/components/dashboard/RecentTimeEntries";
import { Briefcase, Clock, DollarSign, Users } from "lucide-react";

// Mock data - will be replaced with real data from Supabase
const mockEngagements = [
  {
    clientName: "Minera San Cristóbal",
    engagementName: "2024 Financial Audit",
    partner: "Carlos Mendoza",
    progress: 65,
    budgetedHours: 480,
    actualHours: 312,
    status: "active" as const,
  },
  {
    clientName: "Banco Nacional de Bolivia",
    engagementName: "Q4 Tax Review",
    partner: "María Torres",
    progress: 30,
    budgetedHours: 200,
    actualHours: 60,
    status: "active" as const,
  },
  {
    clientName: "YPFB Corporación",
    engagementName: "Internal Controls Assessment",
    partner: "Carlos Mendoza",
    progress: 100,
    budgetedHours: 320,
    actualHours: 318,
    status: "completed" as const,
  },
];

const mockTimeEntries = [
  { id: "1", date: "2024-12-03", hours: 8, engagement: "Minera San Cristóbal - 2024 Audit", activity: "Fieldwork" },
  { id: "2", date: "2024-12-02", hours: 6, engagement: "Banco Nacional - Tax Review", activity: "Planning" },
  { id: "3", date: "2024-12-02", hours: 2, engagement: "Minera San Cristóbal - 2024 Audit", activity: "Review" },
  { id: "4", date: "2024-12-01", hours: 7.5, engagement: "YPFB - Internal Controls", activity: "Documentation" },
];

const Index = () => {
  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Engagements"
            value={12}
            subtitle="3 pending approval"
            icon={<Briefcase className="h-6 w-6" />}
            trend={{ value: 8, positive: true }}
          />
          <StatCard
            title="Hours This Week"
            value="32.5"
            subtitle="7.5h remaining"
            icon={<Clock className="h-6 w-6" />}
          />
          <StatCard
            title="WIP Value"
            value="Bs 245,800"
            subtitle="Unbilled time"
            icon={<DollarSign className="h-6 w-6" />}
            trend={{ value: 12, positive: true }}
          />
          <StatCard
            title="Active Staff"
            value={24}
            subtitle="6 on engagements"
            icon={<Users className="h-6 w-6" />}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Engagements */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">My Active Engagements</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mockEngagements.map((engagement, index) => (
                <EngagementCard key={index} {...engagement} />
              ))}
            </div>
          </div>

          {/* Recent Time Entries */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">This Week</h2>
            <RecentTimeEntries entries={mockTimeEntries} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
