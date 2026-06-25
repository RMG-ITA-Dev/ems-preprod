import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import {
  FundRequestForm,
  type FundRequestFormValues,
} from "@/components/fund-requests/FundRequestForm";
import { useCreateFundRequest } from "@/hooks/mutations/useFundRequestMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useSelectableWorkOrders } from "@/hooks/useFundRequests";
import { toast } from "sonner";

const emptyValues: FundRequestFormValues = {
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
  const { data: workOrders } = useSelectableWorkOrders();
  const createFr = useCreateFundRequest();

  const [values, setValues] = useState<FundRequestFormValues>(emptyValues);

  // Prerequisito: deben existir OTs aprobadas CON gerente para poder asignarlas.
  const usableWoCount = useMemo(
    () =>
      (workOrders ?? []).filter(
        (wo) => wo.approval_status === "Approved" && !!wo.engagement?.manager_id,
      ).length,
    [workOrders],
  );
  const hasBlockingIssue = !!staffRecord && usableWoCount === 0;

  const isDirty =
    values.total_requested_amount > 0 ||
    values.purpose !== "" ||
    values.allocations.length > 0;

  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const handleChange = (patch: Partial<FundRequestFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  };

  const validate = (): string | null => {
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
        total_requested_amount: values.total_requested_amount,
        currency: values.currency,
        purpose: values.purpose || null,
        due_back_date: values.due_back_date || null,
        allocations: values.allocations,
      });
      allowNextNavigation();
      navigate(`/fund-requests/${created.fund_request_id}`, { replace: true });
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
        {/* Acciones arriba para que el toast no las tape */}
        <div className="flex justify-end gap-2">
          <Button
            variant="cancel"
            onClick={() => {
              allowNextNavigation();
              navigate(-1);
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSaveDraft} disabled={createFr.isPending || hasBlockingIssue}>
            {createFr.isPending ? t("common.saving") : t("fundRequest.actions.saveDraft")}
          </Button>
        </div>

        {hasBlockingIssue && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{t("fundRequest.prereq.title")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>{t("fundRequest.prereq.noUsableWos")}</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <FundRequestForm values={values} onChange={handleChange} />
      </div>
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default FundRequestNew;
