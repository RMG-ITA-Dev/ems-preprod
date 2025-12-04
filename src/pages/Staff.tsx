import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useStaff, useEngagements, useCategories, Staff as StaffType } from "@/hooks/useEmsData";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";

const categoryColors: Record<string, string> = {
  Partner: "bg-accent/10 text-accent border-accent/20",
  Manager: "bg-success/10 text-success border-success/20",
  Senior: "bg-info/10 text-info border-info/20",
  Staff: "bg-warning/10 text-warning border-warning/20",
  Junior: "bg-muted text-muted-foreground border-border",
};

const Staff = () => {
  const navigate = useNavigate();
  const { data: staff, isLoading } = useStaff();
  const { data: engagements } = useEngagements();
  const { data: categories } = useCategories();

  const getInitials = (firstName: string, lastName: string) =>
    `${firstName[0]}${lastName[0]}`.toUpperCase();

  const getEngagementCount = (staffId: string) => {
    return engagements?.filter((e) => e.partner_id === staffId || e.manager_id === staffId).length || 0;
  };

  const categoryOptions = (categories || []).map((cat) => ({
    value: cat.category_id,
    label: cat.category_name,
  }));

  const columns: Column<StaffType>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {getInitials(row.first_name, row.last_name)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {row.first_name} {row.last_name}
          </span>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      render: (row) => <span className="text-muted-foreground">{row.email || "-"}</span>,
    },
    {
      key: "category.category_name",
      label: "Category",
      sortable: true,
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
      label: "Status",
      sortable: true,
      render: (row) => (
        <Badge
          variant="outline"
          className={row.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}
        >
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "auth_linked",
      label: "Auth",
      className: "text-center w-20",
      render: (row) =>
        (row as any).auth_user_id ? (
          <Check className="h-4 w-4 text-success mx-auto" />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "engagements",
      label: "Engagements",
      className: "text-center w-28",
      render: (row) => <Badge variant="secondary">{getEngagementCount(row.staff_id)}</Badge>,
    },
  ];

  return (
    <AppLayout title="Staff">
      <DataTable
        data={staff || []}
        columns={columns}
        searchPlaceholder="Search by name or email..."
        searchKeys={["first_name", "last_name", "email"]}
        isLoading={isLoading}
        newButtonLabel="New Staff"
        onNewClick={() => navigate("/staff/new")}
        onRowClick={(row) => navigate(`/staff/${row.staff_id}`)}
        getRowId={(row) => row.staff_id}
        filters={[
          {
            key: "category_id",
            label: "Category",
            options: categoryOptions,
          },
        ]}
        statusFilter={{
          key: "is_active",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        }}
      />
    </AppLayout>
  );
};

export default Staff;