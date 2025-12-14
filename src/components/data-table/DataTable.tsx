import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Filter, ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  filterKey?: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  /** Mobile priority: 'primary' shows on card, 'secondary' in expandable, undefined hidden on mobile */
  mobilePriority?: 'primary' | 'secondary';
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
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [statusValue, setStatusValue] = useState("all");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  // Find filter config for a column
  const getFilterConfig = (filterKey?: string) => {
    if (!filterKey) return null;
    // Check in filters array
    const filter = filters.find(f => f.key === filterKey);
    if (filter) return filter;
    // Check if it's the status filter
    if (statusFilter && filterKey === statusFilter.key) {
      return { key: statusFilter.key, label: t("common.status"), options: statusFilter.options };
    }
    return null;
  };

  const isFilterActive = (filterKey?: string) => {
    if (!filterKey) return false;
    if (filterKey === statusFilter?.key) {
      return statusValue !== "all";
    }
    return filterValues[filterKey] && filterValues[filterKey] !== "all";
  };

  const getFilterValue = (filterKey?: string) => {
    if (!filterKey) return "all";
    if (filterKey === statusFilter?.key) {
      return statusValue;
    }
    return filterValues[filterKey] || "all";
  };

  const setFilterValue = (filterKey: string, value: string) => {
    if (filterKey === statusFilter?.key) {
      setStatusValue(value);
    } else {
      setFilterValues((prev) => ({ ...prev, [filterKey]: value }));
    }
    setOpenFilterKey(null);
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
  }, [data, searchTerm, searchKeys, sortColumn, sortDirection, statusFilter, statusValue, filters, filterValues]);

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

  // Helper to toggle row expansion
  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Get columns by mobile priority
  const primaryColumns = columns.filter(col => col.mobilePriority === 'primary');
  const secondaryColumns = columns.filter(col => col.mobilePriority === 'secondary');
  const hasSecondaryColumns = secondaryColumns.length > 0;

  // Mobile Card View
  const renderMobileCards = () => (
    <div className="space-y-3">
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        ))
      ) : paginatedData.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {t("common.noResults")}
        </Card>
      ) : (
        paginatedData.map((row) => {
          const rowId = getRowId(row);
          const isExpanded = expandedRows.has(rowId);
          
          return (
            <Card 
              key={rowId} 
              className={`${onRowClick ? "cursor-pointer active:bg-muted/50" : ""}`}
            >
              <CardContent className="p-3">
                {/* Primary columns - always visible */}
                <div 
                  className="space-y-2"
                  onClick={() => onRowClick?.(row)}
                >
                  {primaryColumns.length > 0 ? (
                    primaryColumns.map((col) => (
                      <div key={col.key} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{col.label}</span>
                        <div className="text-sm font-medium text-right flex-1 min-w-0">
                          {col.render ? col.render(row) : row[col.key]}
                        </div>
                      </div>
                    ))
                  ) : (
                    /* Fallback: show first 2 columns if no mobilePriority defined */
                    columns.slice(0, 2).map((col) => (
                      <div key={col.key} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{col.label}</span>
                        <div className="text-sm font-medium text-right flex-1 min-w-0">
                          {col.render ? col.render(row) : row[col.key]}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Secondary columns - expandable */}
                {(hasSecondaryColumns || primaryColumns.length === 0) && (
                  <Collapsible open={isExpanded} onOpenChange={() => toggleRowExpansion(rowId)}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full mt-2 h-8 text-xs text-muted-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isExpanded ? t("common.showLess") : t("common.showMore")}
                        <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-2 border-t border-border mt-2">
                      {(hasSecondaryColumns ? secondaryColumns : columns.slice(2)).map((col) => (
                        <div key={col.key} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{col.label}</span>
                          <div className="text-sm text-right flex-1 min-w-0">
                            {col.render ? col.render(row) : row[col.key]}
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );

  // Desktop Table View (UNCHANGED)
  const renderDesktopTable = () => (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map((col) => {
              const filterConfig = getFilterConfig(col.filterKey);
              const hasFilter = !!filterConfig;
              const filterActive = isFilterActive(col.filterKey);

              const isLast = columns.indexOf(col) === columns.length - 1;
              return (
                <TableHead
                  key={col.key}
                  className={`font-semibold text-sm text-center ${!isLast ? "border-r border-border" : ""} ${col.className || ""}`}
                >
                  <div className="flex items-center gap-1">
                    {col.sortable ? (
                      <span
                        className="cursor-pointer select-none hover:text-foreground flex items-center gap-1"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        {getSortIcon(col.key)}
                      </span>
                    ) : (
                      <span>{col.label}</span>
                    )}
                    {hasFilter && (
                      <Popover 
                        open={openFilterKey === col.filterKey} 
                        onOpenChange={(open) => setOpenFilterKey(open ? col.filterKey || null : null)}
                      >
                        <PopoverTrigger asChild>
                          <button className="p-0.5 hover:bg-muted rounded">
                            <Filter className={`h-3 w-3 ${filterActive ? "text-accent" : "opacity-50"}`} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start">
                          <Select 
                            value={getFilterValue(col.filterKey)} 
                            onValueChange={(val) => setFilterValue(col.filterKey!, val)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("common.all")}</SelectItem>
                              {filterConfig?.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {filterActive && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setFilterValue(col.filterKey!, "all")} 
                              className="w-full mt-2"
                            >
                              {t("common.clear")}
                            </Button>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </TableHead>
              );
            })}
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
                {columns.map((col, idx) => {
                  const isLast = idx === columns.length - 1;
                  return (
                    <TableCell key={col.key} className={`py-2 text-sm ${!isLast ? "border-r border-border" : ""} ${col.className || ""}`}>
                      {col.render ? col.render(row) : row[col.key]}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header Actions - Search + New Button only */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder || t("common.search")}
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {onNewClick && (
          <Button variant="default" onClick={onNewClick} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
            <Plus className="h-4 w-4 mr-2" />
            {newButtonLabel || t("common.new")}
          </Button>
        )}
      </div>

      {/* Conditional Table/Cards View */}
      {isMobile ? renderMobileCards() : renderDesktopTable()}

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          {/* Hide rows per page on mobile */}
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
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
                className="h-10 w-10 sm:h-8 sm:w-8"
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
                className="h-10 w-10 sm:h-8 sm:w-8"
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
