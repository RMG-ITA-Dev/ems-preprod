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
import { Shield, User, Eye, Lock, Crown, Briefcase, Users, Star, StarHalf, ShieldCheck, Monitor, Calculator, AlertTriangle, UserPlus, Trash2, Landmark, Wallet, HeartHandshake, Siren, ScrollText } from "lucide-react";
import { useAllUserRoles, useUpdateUserRoleKey, useDeleteAuthUser, UserRoleData } from "@/hooks/useUserRoles";
import { useAuthorizationRoles } from "@/hooks/useAuthorizationRoles";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useAuth } from "@/hooks/useAuth";
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

// Presentación por role_key (catálogo authorization_roles, 23 roles). Se incluyen
// además los valores del enum legacy para que una fila vieja nunca quede sin
// insignia; ambos mapas caen a un default si aparece un rol desconocido.
const roleIcons: Record<string, React.ReactNode> = {
  admin: <Shield className="h-3 w-3" />,
  it_security_manager: <Lock className="h-3 w-3" />,
  senior_partner: <Crown className="h-3 w-3" />,
  partner: <Crown className="h-3 w-3" />,
  sqr: <ShieldCheck className="h-3 w-3" />,
  director: <Briefcase className="h-3 w-3" />,
  manager: <Users className="h-3 w-3" />,
  senior: <Star className="h-3 w-3" />,
  semisenior: <StarHalf className="h-3 w-3" />,
  assistant: <User className="h-3 w-3" />,
  ita_manager: <Monitor className="h-3 w-3" />,
  ita_senior: <Monitor className="h-3 w-3" />,
  ita_assistant: <Monitor className="h-3 w-3" />,
  tax_manager: <Calculator className="h-3 w-3" />,
  tax_senior: <Calculator className="h-3 w-3" />,
  tax_assistant: <Calculator className="h-3 w-3" />,
  accounting_manager: <Landmark className="h-3 w-3" />,
  accounting_analyst: <Landmark className="h-3 w-3" />,
  collections_analyst: <Wallet className="h-3 w-3" />,
  risk_partner: <Siren className="h-3 w-3" />,
  risk_supervisor: <Siren className="h-3 w-3" />,
  hr_manager: <HeartHandshake className="h-3 w-3" />,
  hr_analyst: <HeartHandshake className="h-3 w-3" />,
  // Enum legacy sin equivalente en el catálogo
  staff: <User className="h-3 w-3" />,
  viewer: <Eye className="h-3 w-3" />,
  specialist_it: <Monitor className="h-3 w-3" />,
  specialist_tax: <Calculator className="h-3 w-3" />,
};

const DEFAULT_ROLE_ICON = <ScrollText className="h-3 w-3" />;
const DEFAULT_ROLE_COLOR = "bg-muted text-muted-foreground border-muted";

// Deliberate exception, not a design-system bypass: the Ruizmier design system's semantic
// tokens (bg-success/warning/destructive/info/muted) encode SEVERITY, not IDENTITY — there is no
// categorical token set for a 23-way role palette (confirmed against docs/skills/design-system.md).
// Semantic tokens are used wherever they fit (admin→destructive, assistant→primary, default→muted);
// the rest use curated Tailwind palette colors, one per role, with dark-mode variants hand-picked
// per entry. Expanding the design system with a categorical token set is a separate decision, not
// something to do unilaterally in this component.
const roleColors: Record<string, string> = {
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  it_security_manager: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20",
  senior_partner: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  partner: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  sqr: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  director: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  manager: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  senior: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  semisenior: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  assistant: "bg-primary/10 text-primary border-primary/20",
  ita_manager: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  ita_senior: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  ita_assistant: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  tax_manager: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  tax_senior: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  tax_assistant: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  accounting_manager: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  accounting_analyst: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  collections_analyst: "bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-500/20",
  risk_partner: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  risk_supervisor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  hr_manager: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  hr_analyst: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  // Enum legacy sin equivalente en el catálogo
  staff: "bg-primary/10 text-primary border-primary/20",
  viewer: "bg-muted text-muted-foreground border-muted",
  specialist_it: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  specialist_tax: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
};

export function UserRolesManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // user_role.read (lo que gatea este tab en Settings.tsx) y user_role.update son permisos
  // distintos: solo admin tiene el segundo. Sin este chequeo, un lector (ej. it_security_manager)
  // ve el selector de rol activo para cada usuario y cada intento de cambio falla con NOT_ADMIN.
  const { can: canAuthz } = useAuthorization();
  const canChangeRoles = canAuthz("user_role.update");
  const { data: userRoles, isLoading } = useAllUserRoles();
  const { data: catalogRoles, isLoading: isLoadingRoles } = useAuthorizationRoles();
  const updateRoleMutation = useUpdateUserRoleKey();
  const deleteAuthMutation = useDeleteAuthUser();

  const handleRoleChange = (userId: string, newRoleKey: string) => {
    updateRoleMutation.mutate({ userId, newRoleKey });
  };

  const handleDeleteAccount = (userId: string) => {
    deleteAuthMutation.mutate(userId);
  };

  // El catálogo guarda su propia label_key ("authz.role.*"). Se cae a las claves
  // del enum legacy para filas que aún no tienen role_key, y al role_key crudo si
  // un rol nuevo llegara sin traducción.
  const getRoleLabel = (roleKey: string | null): string => {
    if (!roleKey) return t("userRoles.noRoleAssigned");

    const catalogKey = `authz.role.${roleKey}`;
    const catalogLabel = t(catalogKey);
    if (catalogLabel !== catalogKey) return catalogLabel;

    const legacyKey = `userRoles.roles.${roleKey}`;
    const legacyLabel = t(legacyKey);
    return legacyLabel !== legacyKey ? legacyLabel : roleKey;
  };

  const assignableRoles = catalogRoles ?? [];

  const roleFilter: FilterConfig = {
    key: "role_key",
    label: t("userRoles.currentRole"),
    options: assignableRoles.map((r) => ({
      value: r.role_key,
      label: getRoleLabel(r.role_key),
    })),
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
      key: "role_key",
      label: t("userRoles.currentRole"),
      sortable: true,
      filterKey: "role_key",
      mobilePriority: "primary",
      render: (row) => {
        // role_key es la autoridad del motor; sin él el usuario no tiene acceso.
        const key = row.role_key;
        return (
          <Badge
            variant="outline"
            className={(key && roleColors[key]) || DEFAULT_ROLE_COLOR}
          >
            {(key && roleIcons[key]) || DEFAULT_ROLE_ICON}
            <span className="ml-1">{getRoleLabel(key)}</span>
          </Badge>
        );
      },
    },
    {
      key: "change_role",
      label: t("userRoles.changeRole"),
      mobilePriority: "secondary",
      render: (row) => {
        const isSelf = user?.id === row.user_id;
        if (!canChangeRoles) {
          return (
            <span className="text-xs text-muted-foreground italic">
              {t("userRoles.noPermissionToChangeRoles")}
            </span>
          );
        }
        return isSelf ? (
          <span className="text-xs text-muted-foreground italic">
            {t("userRoles.cannotChangeSelf")}
          </span>
        ) : (
          <Select
            value={row.role_key ?? undefined}
            onValueChange={(value: string) => handleRoleChange(row.user_id, value)}
            disabled={updateRoleMutation.isPending || isLoadingRoles}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={t("userRoles.noRoleAssigned")} />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((r) => (
                <SelectItem key={r.role_key} value={r.role_key}>
                  {getRoleLabel(r.role_key)}
                </SelectItem>
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
