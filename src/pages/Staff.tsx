import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, User } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useStaff, useEngagements } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";

const categoryColors: Record<string, string> = {
  Partner: "bg-accent/10 text-accent border-accent/20",
  Manager: "bg-success/10 text-success border-success/20",
  Senior: "bg-info/10 text-info border-info/20",
  Staff: "bg-warning/10 text-warning border-warning/20",
  Junior: "bg-muted text-muted-foreground border-border",
};

const Staff = () => {
  const { data: staff, isLoading } = useStaff();
  const { data: engagements } = useEngagements();

  const getInitials = (firstName: string, lastName: string) => 
    `${firstName[0]}${lastName[0]}`.toUpperCase();

  const getEngagementCount = (staffId: string) => {
    return engagements?.filter(e => e.partner_id === staffId || e.manager_id === staffId).length || 0;
  };

  return (
    <AppLayout title="Staff">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search staff..." className="pl-9" />
          </div>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Add Staff
          </Button>
        </div>

        {/* Staff Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Category</TableHead>
                <TableHead className="font-semibold text-center">Active Engagements</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-9 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                  </TableRow>
                ))
              ) : staff?.map((member) => (
                <TableRow key={member.staff_id} className="hover:bg-muted/30 cursor-pointer">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                          {getInitials(member.first_name, member.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{member.first_name} {member.last_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email || '-'}</TableCell>
                  <TableCell>
                    {member.category && (
                      <Badge variant="outline" className={categoryColors[member.category.category_name] || ''}>
                        {member.category.category_name}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{getEngagementCount(member.staff_id)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
};

export default Staff;
