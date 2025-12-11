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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useAllExpenseLogs, useExpenseTypes } from "@/hooks/useEmsData";
import { format } from "date-fns";

type SortDirection = "asc" | "desc" | null;

const Expenses = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: expenseLogs = [], isLoading } = useAllExpenseLogs();
  const { data: expenseTypes = [] } = useExpenseTypes();

  const [currency, setCurrency] = useState<"BOB" | "USD">("BOB");
  const [searchTerm, setSearchTerm] = useState("");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState("all");
  const [engagementFilter, setEngagementFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Filter popover states
  const [expenseTypeFilterOpen, setExpenseTypeFilterOpen] = useState(false);
  const [engagementFilterOpen, setEngagementFilterOpen] = useState(false);

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
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="h-3 w-3 text-accent" />;
    }
    if (sortDirection === "desc") {
      return <ArrowDown className="h-3 w-3 text-accent" />;
    }
    return <ArrowUpDown className="h-3 w-3 opacity-50" />;
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
        {/* Currency Tabs + Search + New Button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Tabs value={currency} onValueChange={(val) => setCurrency(val as "BOB" | "USD")}>
              <TabsList>
                <TabsTrigger value="BOB">BOB</TabsTrigger>
                <TabsTrigger value="USD">USD</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("expenses.searchPlaceholder")}
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <Button
            variant="default"
            onClick={() => navigate("/expenses/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("expenses.newExpense")}
          </Button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold text-sm">
                  <span
                    className="cursor-pointer select-none hover:text-foreground flex items-center gap-1"
                    onClick={() => handleSort("date_incurred")}
                  >
                    {t("expenses.date")}
                    {getSortIcon("date_incurred")}
                  </span>
                </TableHead>
                <TableHead className="font-semibold text-sm">
                  <div className="flex items-center gap-1">
                    <span
                      className="cursor-pointer select-none hover:text-foreground flex items-center gap-1"
                      onClick={() => handleSort("engagement")}
                    >
                      {t("engagement.name")}
                      {getSortIcon("engagement")}
                    </span>
                    <Popover open={engagementFilterOpen} onOpenChange={setEngagementFilterOpen}>
                      <PopoverTrigger asChild>
                        <button className="p-0.5 hover:bg-muted rounded">
                          <Filter className={`h-3 w-3 ${engagementFilter !== "all" ? "text-accent" : "opacity-50"}`} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <Select value={engagementFilter} onValueChange={(val) => {
                          setEngagementFilter(val);
                          setEngagementFilterOpen(false);
                        }}>
                          <SelectTrigger>
                            <SelectValue />
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
                        {engagementFilter !== "all" && (
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEngagementFilter("all");
                            setEngagementFilterOpen(false);
                          }} className="w-full mt-2">
                            {t("common.clear")}
                          </Button>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-sm">
                  <div className="flex items-center gap-1">
                    {t("expenses.type")}
                    <Popover open={expenseTypeFilterOpen} onOpenChange={setExpenseTypeFilterOpen}>
                      <PopoverTrigger asChild>
                        <button className="p-0.5 hover:bg-muted rounded">
                          <Filter className={`h-3 w-3 ${expenseTypeFilter !== "all" ? "text-accent" : "opacity-50"}`} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start">
                        <Select value={expenseTypeFilter} onValueChange={(val) => {
                          setExpenseTypeFilter(val);
                          setExpenseTypeFilterOpen(false);
                        }}>
                          <SelectTrigger>
                            <SelectValue />
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
                        {expenseTypeFilter !== "all" && (
                          <Button variant="ghost" size="sm" onClick={() => {
                            setExpenseTypeFilter("all");
                            setExpenseTypeFilterOpen(false);
                          }} className="w-full mt-2">
                            {t("common.clear")}
                          </Button>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-sm text-right">
                  <span
                    className="cursor-pointer select-none hover:text-foreground flex items-center gap-1 justify-end"
                    onClick={() => handleSort("amount")}
                  >
                    {t("expenses.amount")}
                    {getSortIcon("amount")}
                  </span>
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
