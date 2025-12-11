import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Category, ActivityCode } from "@/hooks/useEmsData";
import { WorksheetCell } from "@/hooks/useWorksheetData";

interface WorksheetGridProps {
  categories: Category[];
  activities: ActivityCode[];
  cells: WorksheetCell[];
  onChange: (categoryId: string, activityId: string, hours: number) => void;
  readOnly?: boolean;
}

export function WorksheetGrid({
  categories,
  activities,
  cells,
  onChange,
  readOnly = false,
}: WorksheetGridProps) {
  const { t } = useTranslation();

  // Sort categories by display_order
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.display_order - b.display_order),
    [categories]
  );

  // Sort activities by activity_code
  const sortedActivities = useMemo(
    () => [...activities].sort((a, b) => a.activity_code.localeCompare(b.activity_code)),
    [activities]
  );

  // Create a map for quick cell lookup
  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    cells.forEach((cell) => {
      map.set(`${cell.category_id}-${cell.activity_id}`, cell.budget_hours);
    });
    return map;
  }, [cells]);

  // Local state for editing
  const [localValues, setLocalValues] = useState<Map<string, string>>(new Map());
  
  // Track if we've initialized to prevent resetting on re-renders
  const initializedRef = useRef(false);
  const cellsLengthRef = useRef(0);

  // Initialize local values from cells only once on first load
  useEffect(() => {
    // Only initialize if not yet initialized OR if cells changed from empty to populated
    if (!initializedRef.current || (cellsLengthRef.current === 0 && cells.length > 0)) {
      const newMap = new Map<string, string>();
      cells.forEach((cell) => {
        if (cell.budget_hours > 0) {
          newMap.set(`${cell.category_id}-${cell.activity_id}`, cell.budget_hours.toString());
        }
      });
      setLocalValues(newMap);
      initializedRef.current = true;
      cellsLengthRef.current = cells.length;
    }
  }, [cells]);

  const getCellKey = (categoryId: string, activityId: string) =>
    `${categoryId}-${activityId}`;

  const getValue = (categoryId: string, activityId: string): string => {
    const key = getCellKey(categoryId, activityId);
    if (localValues.has(key)) {
      return localValues.get(key) || "";
    }
    const hours = cellMap.get(key);
    return hours && hours > 0 ? hours.toString() : "";
  };

  const handleChange = (categoryId: string, activityId: string, value: string) => {
    const key = getCellKey(categoryId, activityId);
    setLocalValues((prev) => {
      const newMap = new Map(prev);
      newMap.set(key, value);
      return newMap;
    });
  };

  const handleBlur = (categoryId: string, activityId: string) => {
    const key = getCellKey(categoryId, activityId);
    const value = localValues.get(key) || "";
    const hours = parseFloat(value) || 0;
    onChange(categoryId, activityId, hours);
  };

  // Calculate row totals (per activity)
  const getRowTotal = (activityId: string): number => {
    return sortedCategories.reduce((sum, cat) => {
      const key = getCellKey(cat.category_id, activityId);
      const value = localValues.get(key);
      if (value !== undefined) {
        return sum + (parseFloat(value) || 0);
      }
      return sum + (cellMap.get(key) || 0);
    }, 0);
  };

  // Calculate column totals (per category)
  const getColumnTotal = (categoryId: string): number => {
    return sortedActivities.reduce((sum, act) => {
      const key = getCellKey(categoryId, act.activity_id);
      const value = localValues.get(key);
      if (value !== undefined) {
        return sum + (parseFloat(value) || 0);
      }
      return sum + (cellMap.get(key) || 0);
    }, 0);
  };

  // Grand total
  const grandTotal = sortedCategories.reduce((sum, cat) => sum + getColumnTotal(cat.category_id), 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="table-dense">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky left-0 bg-muted/50 z-10 min-w-[160px] text-xs py-1">
                {t("activity.code")}
              </TableHead>
              {sortedCategories.map((cat) => (
                <TableHead
                  key={cat.category_id}
                  className="text-center min-w-[55px] text-xs py-1 px-1"
                >
                  {cat.category_name}
                </TableHead>
              ))}
              <TableHead className="text-center min-w-[55px] bg-muted font-semibold text-xs py-1 px-1">
                {t("workOrders.total")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedActivities.map((activity) => {
              const rowTotal = getRowTotal(activity.activity_id);
              return (
                <TableRow key={activity.activity_id}>
                  <TableCell className="sticky left-0 bg-background z-10 py-0.5 px-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                        {activity.activity_code}
                      </span>
                      <span className="text-xs truncate max-w-[110px]">
                        {activity.description}
                      </span>
                    </div>
                  </TableCell>
                  {sortedCategories.map((cat) => (
                    <TableCell key={cat.category_id} className="p-0.5">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        className={cn(
                          "h-6 text-center font-mono text-xs hide-spinners",
                          "w-full min-w-[45px] px-1",
                          readOnly && "bg-muted cursor-not-allowed"
                        )}
                        value={getValue(cat.category_id, activity.activity_id)}
                        onChange={(e) =>
                          handleChange(cat.category_id, activity.activity_id, e.target.value)
                        }
                        onBlur={() => handleBlur(cat.category_id, activity.activity_id)}
                        disabled={readOnly}
                        placeholder="0"
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-center font-mono text-xs font-semibold bg-muted/30 py-0.5 px-1">
                    {rowTotal > 0 ? rowTotal.toFixed(1) : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Totals Row */}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell className="sticky left-0 bg-muted/50 z-10 text-xs py-1 px-2">
                {t("workOrders.total")}
              </TableCell>
              {sortedCategories.map((cat) => {
                const colTotal = getColumnTotal(cat.category_id);
                return (
                  <TableCell key={cat.category_id} className="text-center font-mono text-xs py-1 px-1">
                    {colTotal > 0 ? colTotal.toFixed(1) : "-"}
                  </TableCell>
                );
              })}
              <TableCell className="text-center font-mono text-xs font-bold bg-primary/10 py-1 px-1">
                {grandTotal > 0 ? grandTotal.toFixed(1) : "0"}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
