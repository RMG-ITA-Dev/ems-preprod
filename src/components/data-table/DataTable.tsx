import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchKeys?: string[];
  onRowClick?: (row: T) => void;
  onNewClick?: () => void;
  newButtonLabel?: string;
  isLoading?: boolean;
  statusFilter?: {
    key: string;
    options: { value: string; label: string }[];
  };
  filters?: FilterConfig[];
  getRowId: (row: T) => string;
}

type SortDirection = "asc" | "desc" | null;

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchPlaceholder,
  searchKeys = [],
  onRowClick,
  onNewClick,
  newButtonLabel,
  isLoading = false,
  statusFilter,
  filters = [],
  getRowId,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [statusValue, setStatusValue] = useState("all");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortColumn(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (columnKey: string) => {
    if (sortColumn !== columnKey) {
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

  const filteredAndSortedData = useMemo(() => {
    let result = [...data];

    // Search filter
    if (searchTerm && searchKeys.length > 0) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((key) => {
          const value = key.split(".").reduce((obj, k) => obj?.[k], row as any);
          return String(value || "")
            .toLowerCase()
            .includes(lowerSearch);
        }),
      );
    }

    // Status filter
    if (statusFilter && statusValue !== "all") {
      result = result.filter((row) => {
        const value = row[statusFilter.key];
        if (typeof value === "boolean") {
          return statusValue === "active" ? value : !value;
        }
        return String(value).toLowerCase() === statusValue.toLowerCase();
      });
    }

    // Additional filters
    filters.forEach((filter) => {
      const filterValue = filterValues[filter.key];
      if (filterValue && filterValue !== "all") {
        result = result.filter((row) => {
          const value = filter.key.split(".").reduce((obj, k) => obj?.[k], row as any);
          if (typeof value === "boolean") {
            return filterValue === "true" ? value : !value;
          }
          return String(value || "").toLowerCase() === filterValue.toLowerCase();
        });
      }
    });

    // Sorting
    if (sortColumn && sortDirection) {
      result.sort((a, b) => {
        const aVal = sortColumn.split(".").reduce((obj, k) => obj?.[k], a as any);
        const bVal = sortColumn.split(".").reduce((obj, k) => obj?.[k], b as any);

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
  }, [data, searchTerm, searchKeys, sortColumn, sortDirection, statusFilter, statusValue]);

  // Pagination calculations
  const totalItems = filteredAndSortedData.length;
  const totalPages = Math.ceil(totalItems / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalItems);
  const paginatedData = filteredAndSortedData.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, statusValue, rowsPerPage, filterValues]);

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder || t("common.search")}
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={filterValues[filter.key] || "all"}
              onValueChange={(val) => setFilterValues((prev) => ({ ...prev, [filter.key]: val }))}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={`${t("common.all")} ${filter.label}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("common.all")} {filter.label}
                </SelectItem>
                {filter.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {statusFilter && (
            <Select value={statusValue} onValueChange={setStatusValue}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder={t("common.allStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allStatus")}</SelectItem>
                {statusFilter.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {onNewClick && (
          <Button onClick={onNewClick} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Plus className="h-4 w-4 mr-2" />
            {newButtonLabel || t("common.new")}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`font-semibold text-sm ${col.className || ""} ${
                    col.sortable ? "cursor-pointer select-none hover:bg-muted/70" : ""
                  }`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className="flex items-center">
                    {col.label}
                    {col.sortable && getSortIcon(col.key)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-5 w-full max-w-[150px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  className={`${onRowClick ? "cursor-pointer hover:bg-muted/30" : ""}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={`py-2 text-sm ${col.className || ""}`}>
                      {col.render ? col.render(row) : row[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("common.rowsPerPage")}</span>
            <Select value={String(rowsPerPage)} onValueChange={(val) => setRowsPerPage(Number(val))}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {t("common.showing", { start: startIndex + 1, end: endIndex, total: totalItems })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2 min-w-[80px] text-center">
                {t("common.page", { current: currentPage, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
