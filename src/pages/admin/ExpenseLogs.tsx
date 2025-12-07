import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUserRole } from "@/hooks/useUserRole";
import { useAllExpenseLogs, useExpenseTypes } from "@/hooks/useEmsData";
import { useUpdateExpenseLog } from "@/hooks/useEmsMutations";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";

interface ExpenseLogRow {
  expense_log_id: string;
  date_incurred: string;
  amount: number;
  currency: string;
  description: string | null;
  receipt_url: string | null;
  engagement: { engagement_id: string; engagement_name: string; engagement_code: string | null } | null;
  expense_type: { expense_type_id: string; expense_name: string } | null;
}

export default function AdminExpenseLogs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const { data: expenseLogs, isLoading } = useAllExpenseLogs();
  const { data: expenseTypes } = useExpenseTypes();
  const updateExpenseLog = useUpdateExpenseLog();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [editEntry, setEditEntry] = useState<ExpenseLogRow | null>(null);
  const [editForm, setEditForm] = useState({
    date_incurred: "",
    amount: 0,
    currency: "BOB",
    description: "",
    receipt_url: "",
  });

  const filteredData = useMemo(() => {
    if (!expenseLogs) return [];
    return (expenseLogs as ExpenseLogRow[]).filter((entry) => {
      const searchLower = search.toLowerCase();
      const engName = entry.engagement?.engagement_name?.toLowerCase() || "";
      const typeName = entry.expense_type?.expense_name?.toLowerCase() || "";
      const desc = entry.description?.toLowerCase() || "";

      const matchesSearch =
        !search ||
        engName.includes(searchLower) ||
        typeName.includes(searchLower) ||
        desc.includes(searchLower);

      const matchesType =
        typeFilter === "all" ||
        entry.expense_type?.expense_type_id === typeFilter;
      const matchesCurrency =
        currencyFilter === "all" || entry.currency === currencyFilter;

      return matchesSearch && matchesType && matchesCurrency;
    });
  }, [expenseLogs, search, typeFilter, currencyFilter]);

  // Redirect non-admins
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate("/");
    }
  }, [roleLoading, isAdmin, navigate]);

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const handleRowClick = (entry: ExpenseLogRow) => {
    setEditEntry(entry);
    setEditForm({
      date_incurred: entry.date_incurred,
      amount: entry.amount,
      currency: entry.currency,
      description: entry.description || "",
      receipt_url: entry.receipt_url || "",
    });
  };

  const handleSave = async () => {
    if (!editEntry) return;
    await updateExpenseLog.mutateAsync({
      expense_log_id: editEntry.expense_log_id,
      date_incurred: editForm.date_incurred,
      amount: editForm.amount,
      currency: editForm.currency,
      description: editForm.description || null,
      receipt_url: editForm.receipt_url || null,
    });
    setEditEntry(null);
  };

  const formatAmount = (amount: number, currency: string) => {
    return `${currency} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          {t("adminExpenseLogs.title")}
        </h1>

        <div className="flex flex-wrap gap-4">
          <Input
            placeholder={t("adminExpenseLogs.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("adminExpenseLogs.filterByExpenseType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminExpenseLogs.allTypes")}</SelectItem>
              {expenseTypes?.map((et) => (
                <SelectItem key={et.expense_type_id} value={et.expense_type_id}>
                  {et.expense_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("adminExpenseLogs.filterByCurrency")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("adminExpenseLogs.allCurrencies")}</SelectItem>
              <SelectItem value="BOB">BOB</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-28">{t("adminExpenseLogs.date")}</TableHead>
                <TableHead>{t("adminExpenseLogs.engagement")}</TableHead>
                <TableHead>{t("adminExpenseLogs.expenseType")}</TableHead>
                <TableHead className="text-right">{t("adminExpenseLogs.amount")}</TableHead>
                <TableHead className="max-w-xs">{t("adminExpenseLogs.description")}</TableHead>
                <TableHead className="w-24">{t("adminExpenseLogs.receipt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {t("common.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((entry) => (
                  <TableRow
                    key={entry.expense_log_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(entry)}
                  >
                    <TableCell className="font-mono text-sm">
                      {format(new Date(entry.date_incurred), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {entry.engagement?.engagement_code || "-"}
                      </span>{" "}
                      {entry.engagement?.engagement_name}
                    </TableCell>
                    <TableCell>{entry.expense_type?.expense_name || "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(entry.amount, entry.currency)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {entry.description || "-"}
                    </TableCell>
                    <TableCell>
                      {entry.receipt_url ? (
                        <a
                          href={entry.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                        >
                          {t("adminExpenseLogs.viewReceipt")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {t("adminExpenseLogs.noReceipt")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("adminExpenseLogs.editExpenseLog")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("adminExpenseLogs.engagement")}</Label>
              <Input
                value={editEntry?.engagement?.engagement_name || "-"}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminExpenseLogs.expenseType")}</Label>
              <Input
                value={editEntry?.expense_type?.expense_name || "-"}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("adminExpenseLogs.date")}</Label>
                <Input
                  type="date"
                  value={editForm.date_incurred}
                  onChange={(e) =>
                    setEditForm({ ...editForm, date_incurred: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("adminExpenseLogs.currency")}</Label>
                <Select
                  value={editForm.currency}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, currency: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOB">BOB</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("adminExpenseLogs.amount")}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editForm.amount}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminExpenseLogs.description")}</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("adminExpenseLogs.receipt")}</Label>
              <Input
                type="url"
                placeholder="https://..."
                value={editForm.receipt_url}
                onChange={(e) =>
                  setEditForm({ ...editForm, receipt_url: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={updateExpenseLog.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
