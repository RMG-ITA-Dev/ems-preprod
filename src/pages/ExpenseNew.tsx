import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ExpenseLogForm } from "@/components/forms/ExpenseLogForm";
import { useCreateExpenseLog } from "@/hooks/useExpenseLogMutations";

const ExpenseNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createExpenseLog = useCreateExpenseLog();

  const handleSubmit = async (data: {
    engagement_id: string;
    expense_type_id: string;
    date_incurred: string;
    amount: number;
    currency: string;
    description: string | null;
    receipt_url: string | null;
  }) => {
    await createExpenseLog.mutateAsync(data);
    navigate("/expenses");
  };

  return (
    <AppLayout title={t("expenses.newExpense")}>
      <div className="max-w-2xl">
        <div className="bg-card rounded-xl border border-border p-6">
          <ExpenseLogForm
            onSubmit={handleSubmit}
            onCancel={() => navigate("/expenses")}
            isLoading={createExpenseLog.isPending}
          />
        </div>
      </div>
    </AppLayout>
  );
};

export default ExpenseNew;
