import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ExpenseLogForm } from "@/components/forms/ExpenseLogForm";
import { useExpenseLogById } from "@/hooks/useEmsData";
import { useUpdateExpenseLog } from "@/hooks/useEmsMutations";
import { Skeleton } from "@/components/ui/skeleton";

const ExpenseEdit = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: expenseLog, isLoading } = useExpenseLogById(id || "");
  const updateExpenseLog = useUpdateExpenseLog();

  const handleSubmit = async (data: {
    engagement_id: string;
    expense_type_id: string;
    date_incurred: string;
    amount: number;
    currency: string;
    description: string | null;
    receipt_url: string | null;
  }) => {
    if (!id) return;
    await updateExpenseLog.mutateAsync({
      expense_log_id: id,
      date_incurred: data.date_incurred,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      receipt_url: data.receipt_url,
    });
    navigate("/expenses");
  };

  if (isLoading) {
    return (
      <AppLayout title={t("expenses.editExpense")}>
        <div className="max-w-2xl space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="bg-card rounded-xl border border-border p-6">
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!expenseLog) {
    return (
      <AppLayout title={t("expenses.editExpense")}>
        <div className="max-w-2xl">
          <div className="bg-card rounded-xl border border-border p-6 text-center text-muted-foreground">
            {t("common.noResults")}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("expenses.editExpense")}>
      <div className="max-w-2xl">
        <div className="bg-card rounded-xl border border-border p-6">
          <ExpenseLogForm
            initialData={expenseLog}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/expenses")}
            isLoading={updateExpenseLog.isPending}
          />
        </div>
      </div>
    </AppLayout>
  );
};

export default ExpenseEdit;
