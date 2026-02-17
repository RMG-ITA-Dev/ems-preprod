import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ExpenseLogForm } from "@/components/forms/ExpenseLogForm";
import { useCreateExpenseLog } from "@/hooks/useExpenseLogMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const ExpenseNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createExpenseLog = useCreateExpenseLog();
  const { staffRecord } = useCurrentStaff();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const handleSubmit = async (data: {
    engagement_id: string;
    expense_type_id: string;
    date_incurred: string;
    amount: number;
    currency: string;
    description: string | null;
    receipt_url: string | null;
  }) => {
    await createExpenseLog.mutateAsync({
      ...data,
      created_by_staff_id: staffRecord?.staff_id ?? null,
    });
    allowNextNavigation();
    navigate("/expenses");
  };

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/expenses");
  };

  return (
    <AppLayout title={t("expenses.newExpense")} focusMode>
      <div className="max-w-2xl">
        <div className="bg-card rounded-xl border border-border p-6">
          <ExpenseLogForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={createExpenseLog.isPending}
            onDirtyChange={setIsDirty}
          />
        </div>
      </div>
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default ExpenseNew;
