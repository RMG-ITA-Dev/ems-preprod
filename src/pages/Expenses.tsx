import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, ExternalLink } from "lucide-react";
import { useAllExpenseLogs, useExpenseTypes, useEngagements } from "@/hooks/useEmsData";
import { format } from "date-fns";

type SortDirection = "asc" | "desc" | null;

const Expenses = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: expenseLogs = [], isLoading } = useAllExpenseLogs();
  const { data: expenseTypes = [] } = useExpenseTypes();
  const { data: engagements = [] } = useEngagements();

  const [currency, setCurrency] = useState<"BOB" | "USD">("BOB");
  const [searchTerm, setSearchTerm] = useState("");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState("all");
  const [engagementFilter, setEngagementFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Filter by currency first
  const currencyFiltered = useMemo(() => {
    return expenseLogs.filter((log: any) => log.currency === currency);
  }, [expenseLogs, currency]);

  // Get unique engagement options from filtered data
  const engagementOptions = useMemo(() => {
    const unique = new Map<string, string>();
    currencyFiltered.forEach((log: any) => {
      if (log.engagement) {
        unique.set(log.engagement.engagement_id, log.engagement.engagement_name);
      }
    });
    return Array.from(unique.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [currencyFiltered]);

  // Apply search and filters
  const filteredData = useMemo(() => {
    let result = [...currencyFiltered];

    // Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((log: any) =>
        log.engagement?.engagement_name?.toLowerCase().includes(lower) ||
        log.description?.toLowerCase().includes(lower) ||
        log.expense_type?.expense_name?.toLowerCase().includes(lower)
      );
    }

    // Expense type filter
    if (expenseTypeFilter !== "all") {
      result = result.filter((log: any) => log.expense_type_id === expenseTypeFilter);
    }

    // Engagement filter
    if (engagementFilter !== "all") {
      result = result.filter((log: any) => log.engagement_id === engagementFilter);
    }

    // Sorting
    if (sortColumn && sortDirection) {
      result.sort((a: any, b: any) => {
        let aVal: any, bVal: any;
        
        if (sortColumn === "date_incurred") {
          aVal = a.date_incurred;
          bVal = b.date_incurred;
        } else if (sortColumn === "engagement") {
          aVal = a.engagement?.engagement_name || "";
          bVal = b.engagement?.engagement_name || "";
        } else if (sortColumn === "amount") {
          aVal = a.amount;
          bVal = b.amount;
        } else {
          aVal = a[sortColumn];
          bVal = b[sortColumn];
        }

        if (aVal == null) return sortDirection === "asc" ? 1 : -1;
        if (bVal == null) return sortDirection === "asc" ? -1 : 1;

        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    return result;
  }, [currencyFiltered, searchTerm, expenseTypeFilter, engagementFilter, sortColumn, sortDirection]);

  // Calculate total
  const total = useMemo(() => {
    return filteredData.reduce((sum: number, log: any) => sum + (log.amount || 0), 0);
  }, [filteredData]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortColumn(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="h-3 w-3 ml-1 text-accent" />;
    }
    if (sortDirection === "desc") {
      return <ArrowDown className="h-3 w-3 ml-1 text-accent" />;
    }
    return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
  };

  const getFilterIcon = (filterValue: string) => {
    const isActive = filterValue !== "all";
    return <Filter className={`h-3 w-3 ml-1 ${isActive ? "text-accent" : "opacity-50"}`} />;
  };

  const formatCurrency = (amount: number) => {
    if (currency === "BOB") {
      return `Bs ${amount.toLocaleString("es-BO", { minimumFractionDigits: 2 })}`;
    }
    return `$ ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    return format(date, "dd/MM/yyyy");
  };

  return (
    <AppLayout title={t("expenses.title")}>
      <div className="space-y-4">
        {/* Currency Tabs + New Button */}
        <div className="flex items-center justify-between">
          <Tabs value={currency} onValueChange={(val) => setCurrency(val as "BOB" | "USD")}>
            <TabsList>
              <TabsTrigger value="BOB">BOB</TabsTrigger>
              <TabsTrigger value="USD">USD</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            onClick={() => navigate("/expenses/new")}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("expenses.newExpense")}
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("expenses.searchPlaceholder")}
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={expenseTypeFilter} onValueChange={setExpenseTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("adminExpenseLogs.filterByExpenseType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminExpenseLogs.allTypes")}</SelectItem>
              {expenseTypes.map((type) => (
                <SelectItem key={type.expense_type_id} value={type.expense_type_id}>
                  {type.expense_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={engagementFilter} onValueChange={setEngagementFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("adminTimeEntries.filterByEngagement")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminTimeEntries.allEngagements")}</SelectItem>
              {engagementOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead
                  className="font-semibold text-sm cursor-pointer select-none hover:bg-muted/70"
                  onClick={() => handleSort("date_incurred")}
                >
                  <div className="flex items-center">
                    {t("expenses.date")}
                    {getSortIcon("date_incurred")}
                  </div>
                </TableHead>
                <TableHead
                  className="font-semibold text-sm cursor-pointer select-none hover:bg-muted/70"
                  onClick={() => handleSort("engagement")}
                >
                  <div className="flex items-center">
                    {t("engagement.name")}
                    {getSortIcon("engagement")}
                    {getFilterIcon(engagementFilter)}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-sm">
                  <div className="flex items-center">
                    {t("expenses.type")}
                    {getFilterIcon(expenseTypeFilter)}
                  </div>
                </TableHead>
                <TableHead
                  className="font-semibold text-sm text-right cursor-pointer select-none hover:bg-muted/70"
                  onClick={() => handleSort("amount")}
                >
                  <div className="flex items-center justify-end">
                    {t("expenses.amount")}
                    {getSortIcon("amount")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-sm">{t("expenses.description")}</TableHead>
                <TableHead className="font-semibold text-sm w-20">{t("adminExpenseLogs.receipt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-5 w-full max-w-[120px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {t("common.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filteredData.map((log: any) => (
                    <TableRow
                      key={log.expense_log_id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/expenses/${log.expense_log_id}`)}
                    >
                      <TableCell className="py-2 text-sm text-muted-foreground">
                        {formatDate(log.date_incurred)}
                      </TableCell>
                      <TableCell className="py-2 text-sm font-medium">
                        {log.engagement?.engagement_name || "-"}
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {log.expense_type?.expense_name || "-"}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-right font-mono font-semibold">
                        {formatCurrency(log.amount)}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground truncate max-w-[200px]">
                        {log.description || "-"}
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {log.receipt_url ? (
                          <a
                            href={log.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-accent hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t("adminExpenseLogs.viewReceipt")}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Footer Total Row */}
                  <TableRow className="bg-muted/30 border-t-2 border-border">
                    <TableCell colSpan={3} className="py-3 text-sm font-bold text-right">
                      {t("expenses.total")}
                    </TableCell>
                    <TableCell className="py-3 text-sm text-right font-mono font-bold">
                      {formatCurrency(total)}
                    </TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
};

export default Expenses;
