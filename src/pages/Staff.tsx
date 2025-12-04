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

// Mock data
const mockStaff = [
  { id: 1, firstName: "Carlos", lastName: "Mendoza", category: "Partner", email: "cmendoza@firm.com", engagements: 5 },
  { id: 2, firstName: "María", lastName: "Torres", category: "Partner", email: "mtorres@firm.com", engagements: 4 },
  { id: 3, firstName: "Ana", lastName: "Gutiérrez", category: "Manager", email: "agutierrez@firm.com", engagements: 3 },
  { id: 4, firstName: "Roberto", lastName: "Silva", category: "Manager", email: "rsilva@firm.com", engagements: 4 },
  { id: 5, firstName: "Luis", lastName: "Vargas", category: "Senior", email: "lvargas@firm.com", engagements: 2 },
  { id: 6, firstName: "Carmen", lastName: "Rojas", category: "Staff", email: "crojas@firm.com", engagements: 2 },
  { id: 7, firstName: "Diego", lastName: "Flores", category: "Junior", email: "dflores@firm.com", engagements: 1 },
];

const categoryColors: Record<string, string> = {
  Partner: "bg-accent/10 text-accent border-accent/20",
  Manager: "bg-success/10 text-success border-success/20",
  Senior: "bg-info/10 text-info border-info/20",
  Staff: "bg-warning/10 text-warning border-warning/20",
  Junior: "bg-muted text-muted-foreground border-border",
};

const Staff = () => {
  const getInitials = (firstName: string, lastName: string) => 
    `${firstName[0]}${lastName[0]}`.toUpperCase();

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
              {mockStaff.map((staff) => (
                <TableRow key={staff.id} className="hover:bg-muted/30 cursor-pointer">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                          {getInitials(staff.firstName, staff.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{staff.firstName} {staff.lastName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{staff.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={categoryColors[staff.category]}>
                      {staff.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{staff.engagements}</Badge>
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
