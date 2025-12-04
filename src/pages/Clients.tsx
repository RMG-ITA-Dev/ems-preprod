import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Building2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Mock data
const mockClients = [
  { id: 1, name: "Minera San Cristóbal S.A.", nit: "1234567890", industry: "Mining", engagements: 3, status: "active" },
  { id: 2, name: "Banco Nacional de Bolivia", nit: "9876543210", industry: "Banking", engagements: 5, status: "active" },
  { id: 3, name: "YPFB Corporación", nit: "5555555555", industry: "Oil & Gas", engagements: 2, status: "active" },
  { id: 4, name: "Cementos Viacha S.A.", nit: "1111111111", industry: "Manufacturing", engagements: 1, status: "inactive" },
];

const Clients = () => {
  return (
    <AppLayout title="Clients">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search clients..." className="pl-9" />
          </div>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>

        {/* Clients Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Client Name</TableHead>
                <TableHead className="font-semibold">NIT</TableHead>
                <TableHead className="font-semibold">Industry</TableHead>
                <TableHead className="font-semibold text-center">Engagements</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockClients.map((client) => (
                <TableRow key={client.id} className="hover:bg-muted/30 cursor-pointer">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-medium">{client.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{client.nit}</TableCell>
                  <TableCell>{client.industry}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{client.engagements}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={client.status === "active" 
                        ? "bg-success/10 text-success border-success/20" 
                        : "bg-muted text-muted-foreground"
                      }
                    >
                      {client.status === "active" ? "Active" : "Inactive"}
                    </Badge>
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

export default Clients;
