import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import {
  FundRequestForm,
  type FundRequestFormValues,
} from "@/components/fund-requests/FundRequestForm";
import { useCreateFundRequest } from "@/hooks/mutations/useFundRequestMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { toast } from "sonner";

const emptyValues: FundRequestFormValues = {
  approver_manager_staff_id: "",
  total_requested_amount: 0,
  currency: "BOB",
  purpose: "",
  due_back_date: "",
  allocations: [],
};

const FundRequestNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const createFr = useCreateFundRequest();

  const [values, setValues] = useState<FundRequestFormValues>(emptyValues);

  const isDirty =
    values.approver_manager_staff_id !== "" ||
    values.total_requested_amount > 0 ||
    values.purpose !== "" ||
    values.allocations.length > 0;

  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const handleChange = (patch: Partial<FundRequestFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  };

  const validate = (): string | null => {
    if (!values.approver_manager_staff_id) return t("fundRequest.errors.approverRequired");
    if (!values.total_requested_amount || values.total_requested_amount <= 0)
      return t("fundRequest.errors.amountRequired");
    if (values.allocations.length === 0) return t("fundRequest.errors.allocationsRequired");
    if (values.allocations.some((a) => !a.wo_id || a.allocated_amount <= 0))
      return t("fundRequest.errors.allocationIncomplete");

    const totalAlloc = values.allocations.reduce(
      (s, a) => s + Number(a.allocated_amount || 0),
      0,
    );
    if (Math.abs(totalAlloc - values.total_requested_amount) > 0.01)
      return t("fundRequest.errors.allocationMismatch");

    return null;
  };

  const handleSaveDraft = async () => {
    if (!staffRecord) {
      toast.error(t("fundRequest.errors.staffNotLinked"));
      return;
    }
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    try {
      const created = await createFr.mutateAsync({
        requester_staff_id: staffRecord.staff_id,
        approver_manager_staff_id: values.approver_manager_staff_id,
        total_requested_amount: values.total_requested_amount,
        currency: values.currency,
        purpose: values.purpose || null,
        due_back_date: values.due_back_date || null,
        allocations: values.allocations,
      });
      allowNextNavigation();
      navigate(`/fund-requests/${created.fund_request_id}`);
    } catch {
      // toast handled by mutation
    }
  };

  if (staffLoading) {
    return (
      <AppLayout title={t("fundRequest.newRequest")} focusMode>
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </AppLayout>
    );
  }

  if (!staffRecord) {
    return (
      <AppLayout title={t("fundRequest.newRequest")} focusMode>
        <Alert variant="destructive">
          <AlertDescription>{t("fundRequest.errors.staffNotLinked")}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("fundRequest.newRequest")} focusMode>
      <div className="space-y-6">
        <FundRequestForm values={values} onChange={handleChange} />

        <div className="flex justify-end gap-2">
          <Button
            variant="cancel"
            onClick={() => {
              allowNextNavigation();
              navigate("/fund-requests");
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSaveDraft} disabled={createFr.isPending}>
            {createFr.isPending ? t("common.saving") : t("fundRequest.actions.saveDraft")}
          </Button>
        </div>
      </div>
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default FundRequestNew;
