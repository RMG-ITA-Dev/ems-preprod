import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Receipt } from "lucide-react";
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
const mockExpenses = [
  { id: 1, date: "2024-12-03", engagement: "Minera San Cristóbal - 2024 Audit", type: "Transportation", amount: 150, currency: "BOB", description: "Taxi to client site" },
  { id: 2, date: "2024-12-02", engagement: "Banco Nacional - Q4 Tax Review", type: "Meals", amount: 85, currency: "BOB", description: "Working lunch" },
  { id: 3, date: "2024-12-01", engagement: "Minera San Cristóbal - 2024 Audit", type: "Printing", amount: 45, currency: "BOB", description: "Financial statements" },
  { id: 4, date: "2024-11-29", engagement: "YPFB - Internal Controls", type: "Lodging", amount: 120, currency: "USD", description: "Hotel stay - Santa Cruz" },
];

const Expenses = () => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "BOB") {
      return `Bs ${amount.toLocaleString("es-BO")}`;
    }
    return `$${amount.toLocaleString("en-US")}`;
  };

  return (
    <AppLayout title="Expenses">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search expenses..." className="pl-9" />
          </div>
          <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="h-4 w-4 mr-2" />
            Log Expense
          </Button>
        </div>

        {/* Expenses Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Engagement</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Description</TableHead>
                <TableHead className="font-semibold text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockExpenses.map((expense) => (
                <TableRow key={expense.id} className="hover:bg-muted/30 cursor-pointer">
                  <TableCell className="text-muted-foreground">{formatDate(expense.date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{expense.engagement}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{expense.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{expense.description}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(expense.amount, expense.currency)}
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

export default Expenses;
