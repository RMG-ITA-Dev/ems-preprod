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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, User, Eye, Lock, Crown, Briefcase, Users, Star, StarHalf, ShieldCheck, Monitor, Calculator } from "lucide-react";
import { useAllUserRoles, useUpdateUserRole, UserRoleData } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { Database } from "@/integrations/supabase/types";

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
  partner: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  director: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  manager: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  senior: "bg-green-500/10 text-green-600 border-green-500/20",
  semisenior: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  staff: "bg-primary/10 text-primary border-primary/20",
  viewer: "bg-muted text-muted-foreground border-muted",
  sqr: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  specialist_it: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  specialist_tax: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
};

export function UserRolesManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: userRoles, isLoading } = useAllUserRoles();
  const updateRoleMutation = useUpdateUserRole();

  const handleRoleChange = (userId: string, newRole: AppRole) => {
    updateRoleMutation.mutate({ userId, newRole });
  };

  const getRoleLabel = (role: AppRole) => {
    return t(`userRoles.roles.${role}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

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
        {!userRoles || userRoles.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("userRoles.noUsers")}</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("userRoles.email")}</TableHead>
                  <TableHead>{t("userRoles.staffName")}</TableHead>
                  <TableHead>{t("userRoles.currentRole")}</TableHead>
                  <TableHead className="w-[150px]">{t("userRoles.changeRole")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRoles.map((userRole: UserRoleData) => {
                  const isSelf = user?.id === userRole.user_id;
                  
                  return (
                    <TableRow key={userRole.role_id}>
                      <TableCell className="font-mono text-sm">
                        {userRole.email}
                      </TableCell>
                      <TableCell>
                        {userRole.staff_name || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={roleColors[userRole.role]}>
                          {roleIcons[userRole.role]}
                          <span className="ml-1">{getRoleLabel(userRole.role)}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isSelf ? (
                          <span className="text-xs text-muted-foreground italic">
                            {t("userRoles.cannotChangeSelf")}
                          </span>
                        ) : (
                          <Select
                            value={userRole.role}
                            onValueChange={(value: AppRole) => handleRoleChange(userRole.user_id, value)}
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">{getRoleLabel("admin")}</SelectItem>
                              <SelectItem value="partner">{getRoleLabel("partner")}</SelectItem>
                              <SelectItem value="director">{getRoleLabel("director")}</SelectItem>
                              <SelectItem value="manager">{getRoleLabel("manager")}</SelectItem>
                              <SelectItem value="senior">{getRoleLabel("senior")}</SelectItem>
                              <SelectItem value="semisenior">{getRoleLabel("semisenior")}</SelectItem>
                              <SelectItem value="staff">{getRoleLabel("staff")}</SelectItem>
                              <SelectItem value="viewer">{getRoleLabel("viewer")}</SelectItem>
                              <SelectItem value="sqr">{getRoleLabel("sqr")}</SelectItem>
                              <SelectItem value="specialist_it">{getRoleLabel("specialist_it")}</SelectItem>
                              <SelectItem value="specialist_tax">{getRoleLabel("specialist_tax")}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
