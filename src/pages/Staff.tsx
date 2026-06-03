import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useStaffFull, useEngagements, useCategories, StaffFull } from "@/hooks/useEmsData";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";
import { Check, Lock } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

interface StaffRow extends StaffFull {
  auth_user_id: string | null;
}

const categoryColors: Record<string, string> = {
  Partner: "bg-accent/10 text-accent border-accent/20",
  Manager: "bg-success/10 text-success border-success/20",
  Senior: "bg-info/10 text-info border-info/20",
  Staff: "bg-warning/10 text-warning border-warning/20",
  Junior: "bg-muted text-muted-foreground border-border",
};

const Staff = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Use full staff data (admin-only) for admin view with PII fields
  const { isAdmin } = useUserRole();
  const { data: staff, isLoading } = useStaffFull();
  const { data: engagements } = useEngagements();
  const { data: categories } = useCategories();

  const getInitials = (row: StaffFull) => {
    // Use stored initials if available, otherwise compute from names
    if (row.initials) return row.initials;
    return `${row.first_name[0]}${row.last_name[0]}`.toUpperCase();
  };

  const getEngagementCount = (staffId: string) => {
    return engagements?.filter((e) => e.partner_id === staffId || e.manager_id === staffId).length || 0;
  };

  const categoryOptions = (categories || []).map((cat) => ({
    value: cat.category_id,
    label: cat.category_name,
  }));

  const columns: Column<StaffFull>[] = [
    {
      key: "name",
      label: t("staff.name"),
      sortable: true,
      mobilePriority: 'primary',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {getInitials(row)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {row.first_name} {row.last_name}
          </span>
        </div>
      ),
    },
    {
      key: "short_name",
      label: t("staff.shortName"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => <span className="text-muted-foreground">{row.short_name || "-"}</span>,
    },
    {
      key: "initials",
      label: t("staff.initials"),
      sortable: true,
      className: "w-20 text-center",
      render: (row) => <span className="font-mono">{row.initials || "-"}</span>,
    },
    {
      key: "email",
      label: t("staff.email"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => <span className="text-muted-foreground">{row.email || "-"}</span>,
    },
    {
      key: "category.category_name",
      label: t("staff.category"),
      sortable: true,
      filterKey: "category_id",
      mobilePriority: 'primary',
      render: (row) =>
        row.category ? (
          <Badge variant="outline" className={categoryColors[row.category.category_name] || ""}>
            {row.category.category_name}
          </Badge>
        ) : (
          "-"
        ),
    },
    {
      key: "is_active",
      label: t("staff.status"),
      sortable: true,
      filterKey: "is_active",
      mobilePriority: 'primary',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={row.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}
          >
            {row.is_active ? t("status.active") : t("status.inactive")}
          </Badge>
          {(row as StaffRow).is_blocked && (
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
              <Lock className="h-3 w-3" />
              {t("staff.blockedBadge")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "auth_linked",
      label: t("staff.auth"),
      className: "text-center w-20",
      mobilePriority: 'secondary',
      render: (row) =>
        (row as StaffRow).auth_user_id ? (
          <Check className="h-4 w-4 text-success mx-auto" />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "engagements",
      label: t("staff.engagements"),
      className: "text-center w-28",
      mobilePriority: 'secondary',
      render: (row) => <Badge variant="secondary">{getEngagementCount(row.staff_id)}</Badge>,
    },
  ];

  return (
    <AppLayout title={t("nav.staff")}>
      <DataTable
        data={staff || []}
        columns={columns}
        searchPlaceholder={t("staff.searchPlaceholder")}
        searchKeys={["first_name", "last_name", "email", "short_name"]}
        isLoading={isLoading}
        newButtonLabel={isAdmin ? t("staff.newStaff") : undefined}
        onNewClick={isAdmin ? () => navigate("/staff/new") : undefined}
        onRowClick={isAdmin ? (row) => navigate(`/staff/${row.staff_id}`) : undefined}
        getRowId={(row) => row.staff_id}
        filters={[
          {
            key: "category_id",
            label: t("staff.category"),
            options: categoryOptions,
          },
        ]}
        statusFilter={{
          key: "is_active",
          options: [
            { value: "active", label: t("status.active") },
            { value: "inactive", label: t("status.inactive") },
          ],
        }}
      />
    </AppLayout>
  );
};

export default Staff;
