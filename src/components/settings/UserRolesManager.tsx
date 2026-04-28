import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, Column, FilterConfig } from "@/components/data-table/DataTable";
import { Shield, User, Eye, Lock, Crown, Briefcase, Users, Star, StarHalf, ShieldCheck, Monitor, Calculator, AlertTriangle, UserPlus, Trash2 } from "lucide-react";
import { useAllUserRoles, useUpdateUserRole, useDeleteAuthUser, UserRoleData } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type AppRole = Database["public"]["Enums"]["app_role"];

const roleIcons: Record<AppRole, React.ReactNode> = {
  admin: <Shield className="h-3 w-3" />,
  partner: <Crown className="h-3 w-3" />,
  director: <Briefcase className="h-3 w-3" />,
  manager: <Users className="h-3 w-3" />,
  senior: <Star className="h-3 w-3" />,
  semisenior: <StarHalf className="h-3 w-3" />,
  staff: <User className="h-3 w-3" />,
  viewer: <Eye className="h-3 w-3" />,
  sqr: <ShieldCheck className="h-3 w-3" />,
  specialist_it: <Monitor className="h-3 w-3" />,
  specialist_tax: <Calculator className="h-3 w-3" />,
};

const roleColors: Record<AppRole, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  partner: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  director: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  manager: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  senior: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  semisenior: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  staff: "bg-primary/10 text-primary border-primary/20",
  viewer: "bg-muted text-muted-foreground border-muted",
  sqr: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  specialist_it: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  specialist_tax: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
};

export function UserRolesManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: userRoles, isLoading } = useAllUserRoles();
  const updateRoleMutation = useUpdateUserRole();
  const deleteAuthMutation = useDeleteAuthUser();

  const handleRoleChange = (userId: string, newRole: AppRole) => {
    updateRoleMutation.mutate({ userId, newRole });
  };

  const handleDeleteAccount = (userId: string) => {
    deleteAuthMutation.mutate(userId);
  };

  const getRoleLabel = (role: AppRole) => {
    return t(`userRoles.roles.${role}`);
  };

  const ALL_ROLES: AppRole[] = [
    "admin", "partner", "director", "manager", "senior",
    "semisenior", "staff", "viewer", "sqr", "specialist_it", "specialist_tax",
  ];

  const roleFilter: FilterConfig = {
    key: "role",
    label: t("userRoles.currentRole"),
    options: ALL_ROLES.map((r) => ({ value: r, label: getRoleLabel(r) })),
  };

  const columns: Column<UserRoleData>[] = [
    {
      key: "email",
      label: t("userRoles.email"),
      sortable: true,
      mobilePriority: "primary",
    },
    {
      key: "staff_name",
      label: t("userRoles.staffName"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) =>
        row.staff_name ? (
          row.staff_name
        ) : (
          <div
            className="flex items-center text-amber-600 dark:text-amber-400 gap-1.5"
            title={t("userRoles.orphanWarning")}
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-medium">{t("userRoles.orphan")}</span>
          </div>
        ),
    },
    {
      key: "role",
      label: t("userRoles.currentRole"),
      sortable: true,
      filterKey: "role",
      mobilePriority: "primary",
      render: (row) => (
        <Badge variant="outline" className={roleColors[row.role]}>
          {roleIcons[row.role]}
          <span className="ml-1">{getRoleLabel(row.role)}</span>
        </Badge>
      ),
    },
    {
      key: "change_role",
      label: t("userRoles.changeRole"),
      mobilePriority: "secondary",
      render: (row) => {
        const isSelf = user?.id === row.user_id;
        return isSelf ? (
          <span className="text-xs text-muted-foreground italic">
            {t("userRoles.cannotChangeSelf")}
          </span>
        ) : (
          <Select
            value={row.role}
            onValueChange={(value: AppRole) => handleRoleChange(row.user_id, value)}
            disabled={updateRoleMutation.isPending}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "actions",
      label: t("common.actions"),
      className: "text-right",
      mobilePriority: "secondary",
      render: (row) => {
        const isSelf = user?.id === row.user_id;
        const isOrphan = !row.staff_name;
        if (!isOrphan || isSelf) return null;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary"
              asChild
              title={t("userRoles.createStaff")}
            >
              <Link to={`/staff/new?email=${encodeURIComponent(row.email)}`}>
                <UserPlus className="h-4 w-4" />
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  title={t("userRoles.deleteAccount")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("userRoles.deleteAccountTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("userRoles.confirmDeleteAccount", { email: row.email })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDeleteAccount(row.user_id)}
                    className="bg-destructive/70 text-destructive-foreground hover:bg-destructive"
                  >
                    {t("userRoles.deleteAccount")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("userRoles.title")}
          <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
            <Lock className="h-3 w-3 mr-1" />
            {t("settings.adminOnly")}
          </Badge>
        </CardTitle>
        <CardDescription>{t("userRoles.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          data={userRoles || []}
          columns={columns}
          searchKeys={["email", "staff_name"]}
          filters={[roleFilter]}
          isLoading={isLoading}
          getRowId={(row) => row.role_id}
        />
      </CardContent>
    </Card>
  );
}
