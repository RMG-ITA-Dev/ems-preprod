import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ApprovalDecisionDialog,
  type DecisionMode,
} from "@/components/fund-requests/ApprovalDecisionDialog";
import { useDecideWorkOrder } from "@/hooks/mutations/useFundRequestMutations";
import type {
  FundRequest,
  FundRequestWorkOrder,
  FrWoApprovalStatus,
} from "@/hooks/useFundRequests";

const staffName = (s?: { first_name?: string; last_name?: string; short_name?: string | null }) =>
  s ? s.short_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "-";

const statusStyles: Record<FrWoApprovalStatus, string> = {
  pendiente: "bg-warning/15 text-warning border-warning/30",
  aprobado: "bg-success/15 text-success border-success/30",
  observado: "bg-warning/10 text-warning border-warning/40",
  rechazado: "bg-destructive/15 text-destructive border-destructive/30",
};

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    maximumFractionDigits: 2,
  });

const decisionToStatus: Record<DecisionMode, "aprobado" | "observado" | "rechazado"> = {
  approve: "aprobado",
  observe: "observado",
  reject: "rechazado",
};

interface Props {
  fr: FundRequest;
  /** staff_id del usuario actual */
  myStaffId?: string | null;
}

export function OtApprovalList({ fr, myStaffId }: Props) {
  const { t } = useTranslation();
  const decide = useDecideWorkOrder();
  const [target, setTarget] = useState<{ ot: FundRequestWorkOrder; mode: DecisionMode } | null>(
    null,
  );

  const ots = fr.fund_request_work_orders ?? [];
  if (ots.length === 0) return null;

  const isPending = fr.status === "pendiente_aprobacion";

  const handleConfirm = async (notes: string) => {
    if (!target) return;
    try {
      await decide.mutateAsync({
        frWoId: target.ot.fr_wo_id,
        fundRequestId: fr.fund_request_id,
        decision: decisionToStatus[target.mode],
        notes,
      });
      setTarget(null);
    } catch {
      /* toast por mutation */
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm font-medium">{t("fundRequest.otApproval.title")}</p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t("fundRequest.workOrder")}</th>
                <th className="text-left px-3 py-2 font-medium">{t("fundRequest.manager")}</th>
                <th className="text-right px-3 py-2 font-medium">
                  {t("fundRequest.amount")} ({fr.currency})
                </th>
                <th className="text-left px-3 py-2 font-medium">{t("common.status")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ots.map((ot) => {
                const isMine = !!myStaffId && ot.manager_staff_id === myStaffId;
                const canDecide = isPending && isMine && ot.approval_status === "pendiente";
                const note = ot.rejection_reason || ot.manager_notes;
                return (
                  <tr key={ot.fr_wo_id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">
                        {ot.work_order?.engagement?.engagement_code ?? "-"}
                      </div>
                      <div className="text-muted-foreground text-xs line-clamp-1">
                        {ot.work_order?.engagement?.engagement_name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{staffName(ot.manager)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatCurrency(Number(ot.allocated_amount), fr.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          statusStyles[ot.approval_status],
                        )}
                      >
                        {t(`fundRequest.otApproval.status.${ot.approval_status}`)}
                      </span>
                      {note && (
                        <p className="text-xs text-muted-foreground mt-1 max-w-[14rem]">{note}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canDecide && (
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setTarget({ ot, mode: "reject" })}
                            disabled={decide.isPending}
                          >
                            {t("fundRequest.actions.reject")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTarget({ ot, mode: "observe" })}
                            disabled={decide.isPending}
                          >
                            {t("fundRequest.actions.observe")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setTarget({ ot, mode: "approve" })}
                            disabled={decide.isPending}
                          >
                            {t("fundRequest.actions.approve")}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      <ApprovalDecisionDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        mode={target?.mode ?? "approve"}
        isSubmitting={decide.isPending}
        onConfirm={handleConfirm}
      />
    </Card>
  );
}
