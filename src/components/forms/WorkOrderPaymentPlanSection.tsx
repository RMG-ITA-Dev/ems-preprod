import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Plus, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NumericInput } from "@/components/ui/numeric-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUpdateInstallmentStatus, useUpdateCollectionDate, useUpdateInstallmentExchangeRate } from "@/hooks/mutations";
import { useLatestExchangeRate } from "@/hooks/useExchangeRate";
import {
  distributePercentages,
  computeAmount,
  computePaymentDate,
  isAlertDue,
  getEffectiveInstallmentStatus,
  isInvoiceRateEditable,
  isPaymentRateEditable,
  isPaymentRateCaptureEditable,
  computeConvertedAmount,
  applyExchangeRateMode,
} from "@/lib/workOrderPaymentPlan";
import type {
  PaymentPlanInput,
  PaymentInstallmentInput,
  PaymentInstallmentStatus,
  ExchangeRateMode,
} from "@/types/workOrderPaymentPlan";

interface WorkOrderPaymentPlanSectionProps {
  woId: string;
  currency: "BOB" | "USD" | "USDT";
  feeWithTax: number;
  plan: PaymentPlanInput | null;
  installments: PaymentInstallmentInput[];
  isEditable: boolean;
  isStatusEditable: boolean;
  isAdminDateEditable: boolean;
  isPaymentPlanDirty?: boolean;
  onPlanChange: (plan: PaymentPlanInput) => void;
  onInstallmentsChange: (rows: PaymentInstallmentInput[]) => void;
}

const STATUS_COLORS: Record<PaymentInstallmentStatus, string> = {
  Pending:   "text-muted-foreground",
  Invoiced:  "text-info",
  Completed: "text-success",
  Overdue:   "text-destructive",
};

const STATUS_CHIP_CLASSES: Record<PaymentInstallmentStatus, string> = {
  Pending:   "bg-muted/60 text-muted-foreground",
  Invoiced:  "bg-info/15 text-info",
  Completed: "bg-success/15 text-success",
  Overdue:   "bg-destructive/15 text-destructive",
};

// Options available per effective status (state machine)
const STATUS_TRANSITIONS: Record<PaymentInstallmentStatus, PaymentInstallmentStatus[]> = {
  Pending:   ["Invoiced"],
  Overdue:   ["Invoiced"],
  Invoiced:  ["Completed", "Overdue"],
  Completed: [],
};

const fmtDate = (d: string | null): string => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export function WorkOrderPaymentPlanSection({
  woId,
  currency,
  feeWithTax,
  plan,
  installments,
  isEditable,
  isStatusEditable,
  isAdminDateEditable,
  isPaymentPlanDirty = false,
  onPlanChange,
  onInstallmentsChange,
}: WorkOrderPaymentPlanSectionProps) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const updateStatus = useUpdateInstallmentStatus();
  const updateCollectionDate = useUpdateCollectionDate();
  const updateInstallmentExchangeRate = useUpdateInstallmentExchangeRate();
  const latestRate = useLatestExchangeRate();
  const latestBuyRate = latestRate.data?.compra ?? null;
  const [pendingChange, setPendingChange] = useState<{
    idx: number;
    newStatus: "Invoiced" | "Completed" | "Overdue";
  } | null>(null);
  const [pendingCollectionDate, setPendingCollectionDate] = useState<{
    installmentId: string;
    newDate: string;
  } | null>(null);

  const currentPlan = plan ?? { wo_id: woId, exchange_rate: null, payment_days: 30, exchange_rate_mode: "fijo" as ExchangeRateMode };
  const numInstallments = installments.length;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());

  // MUST FIX review iteracion 2 #1/#3 (decision del operador 2026-09-07: "si una cuota
  // ya esta facturada, no se puede modificar o eliminar de ninguna manera"): una cuota
  // con status <> 'Pending' nunca participa de la redistribucion de porcentaje/monto,
  // nunca se renumera, y nunca puede quedar excluida al reducir la cantidad de cuotas.
  // Declarado antes del efecto de feeWithTax (0722-156b review iteracion 4 #4) porque
  // ese efecto tambien necesita excluir estas cuotas del recalculo de amount.
  const isLocked = (inst: PaymentInstallmentInput) => inst.status !== "Pending";

  const formatRate = (rate: number) =>
    Number(rate).toLocaleString(numericLocale === "es" ? "es-BO" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });

  const getEffectiveStatus = getEffectiveInstallmentStatus;

  const hasAlert = installments.some((inst) => isAlertDue(inst));

  const percentageSum = installments.reduce((s, i) => s + i.percentage, 0);
  const percentageSumDisplay = parseFloat(percentageSum.toFixed(2));
  const percentageValid = Math.abs(percentageSum - 100) <= 0.01;

  const totalAmount = installments.reduce((s, i) => {
    return s + computeAmount(i.percentage, feeWithTax);
  }, 0);

  // ----- Plan header handlers -----

  const handlePaymentDaysChange = (val: number) => {
    const updated = { ...currentPlan, payment_days: val };
    onPlanChange(updated);
    // Recalculate agreed_payment_date for any row that has agreed_invoice_date
    onInstallmentsChange(
      installments.map((inst) =>
        inst.agreed_invoice_date
          ? { ...inst, agreed_payment_date: computePaymentDate(inst.agreed_invoice_date, val) }
          : inst,
      ),
    );
  };

  const handleExchangeRateChange = (val: number) => {
    const updatedPlan = { ...currentPlan, exchange_rate: val > 0 ? val : null };
    onPlanChange(updatedPlan);
    // Modo Fijo: el TC de creacion se re-sincroniza a las 2 columnas de TC de toda
    // cuota aun editable (una ya congelada conserva su valor guardado sin cambios).
    if (updatedPlan.exchange_rate_mode === "fijo") {
      onInstallmentsChange(applyExchangeRateMode("fijo", updatedPlan.exchange_rate, installments));
    }
  };

  // 0722-156b: cambiar de modo re-sincroniza (Fijo) o inicializa los campos aun sin
  // valor (Variable, con el ultimo TC de compra conocido — nunca pisa un valor ya
  // capturado por el usuario o ya congelado).
  const handleModeChange = (mode: ExchangeRateMode) => {
    const updatedPlan = { ...currentPlan, exchange_rate_mode: mode };
    onPlanChange(updatedPlan);
    if (mode === "fijo") {
      onInstallmentsChange(applyExchangeRateMode("fijo", updatedPlan.exchange_rate, installments));
    } else {
      onInstallmentsChange(
        installments.map((inst) => ({
          ...inst,
          invoice_exchange_rate:
            isInvoiceRateEditable(inst.status) && inst.invoice_exchange_rate == null
              ? latestBuyRate
              : inst.invoice_exchange_rate,
          payment_exchange_rate:
            isPaymentRateCaptureEditable(inst.status) && inst.payment_exchange_rate == null
              ? latestBuyRate
              : inst.payment_exchange_rate,
        })),
      );
    }
  };

  // Auto-initialize to 1 installment only for brand-new WOs (woId is empty string).
  // For existing WOs (woId is a UUID), data comes from DB hydration — don't override.
  useEffect(() => {
    if (!woId && installments.length === 0 && isEditable) {
      handleNumInstallmentsChange(1);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Autocompleta el TC de creacion con el ultimo TC de compra conocido mientras este
  // vacio y editable. Sin ref de "una sola vez": ese candado permanente se quedaba
  // trabado si corria antes de que useLatestExchangeRate resolviera, o si una
  // rehidratacion posterior del work order (useWorkOrderById) volvia a pisar el plan
  // local con el valor null que todavia esta en la DB (BUG reportado 2026-09-05: la
  // caja de creacion se quedaba en 0 pese a que la referencia ya mostraba el TC
  // vigente). El propio chequeo `exchange_rate != null` ya evita reintentos una vez
  // que hay un valor (autocompletado o tecleado por el usuario).
  //
  // MUST FIX 0722-156b review iteracion 4 #5: este efecto no chequeaba
  // installments.length -- en una OT existente en Draft (USD/USDT) que todavia no
  // tiene NINGUN plan de pagos configurado, currentPlan es el objeto de fallback
  // (plan == null); apenas resolvia el TC de compra, este efecto llamaba a
  // onPlanChange y volvia "sucia" la pagina (WorkOrderEdit.tsx compara paymentPlan
  // contra originalPaymentPlan) sin que el usuario hubiera tocado nada -- y como
  // persistNonRiskChanges solo actua con installments.length > 0 o con un plan_id ya
  // existente, ese plan sintetico no se podia ni guardar ni descartar. Exigir al
  // menos 1 cuota antes de autocompletar evita crear un plan "fantasma".
  //
  // MUST FIX 0722-156b review iteracion 10 #5: tampoco chequeaba currency !== "BOB"
  // -- el TC (Decision #8 de plan_v2.md) solo aplica a USD/USDT, nunca a BOB, pero
  // useLatestExchangeRate() no esta filtrado por moneda de la OT, asi que este efecto
  // igual autocompletaba exchange_rate en una OT en BOB con al menos 1 cuota. Como
  // WorkOrderEdit.tsx compara paymentPlan contra originalPaymentPlan con un
  // JSON.stringify crudo (no el mas cuidadoso isPaymentPlanRestDirty), esto marcaba
  // "sin guardar" a CUALQUIER OT en BOB abierta para editar, sin que el usuario
  // tocara nada.
  useEffect(() => {
    if (currency === "BOB") return;
    if (currentPlan.exchange_rate != null) return;
    if (!isEditable || latestBuyRate == null || installments.length === 0) return;
    onPlanChange({ ...currentPlan, exchange_rate: latestBuyRate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, currentPlan.exchange_rate, isEditable, latestBuyRate, installments.length]);

  // MUST FIX 0722-156b review iteracion 1 #2: el efecto de arriba solo autocompleta
  // plan.exchange_rate — nunca re-sincronizaba las cuotas ya creadas cuando
  // useLatestExchangeRate resuelve DESPUES de que las filas ya existian con TC null
  // (ej. el plan se crea con handleNumInstallmentsChange antes de que la query
  // resuelva). Sin esto, esas cuotas se quedaban mostrando "—" para siempre. En Fijo,
  // re-sincroniza con applyExchangeRateMode en cuanto haya TC de creacion; en
  // Variable, rellena solo los campos aun editables que sigan en null, igual que
  // handleModeChange ya hace al cambiar de modo.
  //
  // MUST FIX 0722-156b review iteracion 10 #5: mismo gate de currency !== "BOB" que
  // el efecto de arriba -- ver ese comentario.
  useEffect(() => {
    if (currency === "BOB") return;
    if (latestBuyRate == null || !isEditable || installments.length === 0) return;
    if (currentPlan.exchange_rate_mode === "fijo") {
      if (currentPlan.exchange_rate == null) return;
      const needsSync = installments.some(
        (inst) =>
          (isInvoiceRateEditable(inst.status) && inst.invoice_exchange_rate == null) ||
          (isPaymentRateEditable(inst.status) && inst.payment_exchange_rate == null),
      );
      if (needsSync) {
        onInstallmentsChange(applyExchangeRateMode("fijo", currentPlan.exchange_rate, installments));
      }
    } else {
      const needsInit = installments.some(
        (inst) =>
          (isInvoiceRateEditable(inst.status) && inst.invoice_exchange_rate == null) ||
          (isPaymentRateCaptureEditable(inst.status) && inst.payment_exchange_rate == null),
      );
      if (needsInit) {
        onInstallmentsChange(
          installments.map((inst) => ({
            ...inst,
            invoice_exchange_rate:
              isInvoiceRateEditable(inst.status) && inst.invoice_exchange_rate == null
                ? latestBuyRate
                : inst.invoice_exchange_rate,
            payment_exchange_rate:
              isPaymentRateCaptureEditable(inst.status) && inst.payment_exchange_rate == null
                ? latestBuyRate
                : inst.payment_exchange_rate,
          })),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, latestBuyRate, isEditable, currentPlan.exchange_rate_mode, currentPlan.exchange_rate, installments.length]);

  // When feeWithTax changes (e.g. adjustment edited), recompute stored amounts so
  // the saved value matches what the table displays. Guard via ref to avoid loops.
  //
  // MUST FIX 0722-156b review iteracion 4 #4: este recalculo tocaba `amount` de TODAS
  // las cuotas sin filtrar por status -- el trigger de freeze (INSTALLMENT_LOCKED)
  // rechaza cualquier cambio de amount en una cuota no-Pending, asi que revertir una
  // OT aprobada con una cuota ya facturada y corregir el ajuste/presupuesto despues
  // hacia fallar el guardado completo del plan. Las cuotas bloqueadas (isLocked)
  // conservan su amount ya congelado, igual que ya hace el guard de DB.
  const prevFeeWithTax = useRef(feeWithTax);
  useEffect(() => {
    if (prevFeeWithTax.current === feeWithTax || installments.length === 0) {
      prevFeeWithTax.current = feeWithTax;
      return;
    }
    prevFeeWithTax.current = feeWithTax;
    onInstallmentsChange(
      installments.map((inst) =>
        isLocked(inst) ? inst : { ...inst, amount: computeAmount(inst.percentage, feeWithTax) },
      ),
    );
  }, [feeWithTax]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Installment count handler -----

  // MUST FIX review iteracion 2 #4 (decision del operador: bloquear): si ya existe
  // alguna cuota facturada, el TC/modo del plan tampoco se puede tocar, aunque la OT
  // haya vuelto a Draft (revertir aprobacion + cambiar de modo dejaria el TC "oficial"
  // del plan desalineado del TC realmente aplicado a esa cuota). El trigger de DB
  // (wo_payment_plan_guard_exchange_rate) es la garantia real; esto es solo UX.
  const planLocked = installments.some(isLocked);

  const handleNumInstallmentsChange = (count: number) => {
    if (count < 0 || count > 24) return;
    const current = installments.length;
    if (count === current) return;

    const lockedCount = installments.filter(isLocked).length;
    if (count < lockedCount) {
      toast.error(t("workOrders.paymentPlan.validationCannotRemoveInvoiced"));
      return;
    }

    const lockedPercentageSum = installments
      .filter(isLocked)
      .reduce((s, i) => s + i.percentage, 0);
    const unlockedTargetCount = count - lockedCount;
    const unlockedPercentages = distributePercentages(unlockedTargetCount, 100 - lockedPercentageSum);

    let unlockedIdx = 0;
    const redistribute = (inst: PaymentInstallmentInput): PaymentInstallmentInput => {
      if (isLocked(inst)) return inst;
      const pct = unlockedPercentages[unlockedIdx++];
      return { ...inst, percentage: pct, amount: computeAmount(pct, feeWithTax) };
    };

    if (count > current) {
      const addedCount = count - current;
      const initialRate = currentPlan.exchange_rate_mode === "fijo" ? currentPlan.exchange_rate : latestBuyRate;
      const nextNumber = Math.max(0, ...installments.map((i) => i.installment_number)) + 1;
      const redistributed = installments.map(redistribute);
      const added: PaymentInstallmentInput[] = Array.from({ length: addedCount }, (_, i) => {
        const pct = unlockedPercentages[unlockedIdx++];
        return {
          wo_id: woId,
          plan_id: plan?.plan_id,
          installment_number: nextNumber + i,
          agreed_invoice_date: null,
          agreed_payment_date: null,
          collection_invoice_date: null,
          collection_payment_date: null,
          payment_date_actual: null,
          percentage: pct,
          amount: computeAmount(pct, feeWithTax),
          status: "Pending" as PaymentInstallmentStatus,
          invoice_exchange_rate: initialRate,
          payment_exchange_rate: initialRate,
        };
      });
      onInstallmentsChange([...redistributed, ...added]);
    } else {
      // Reducing: drop Pending rows starting from the END of the array (matches the
      // prior tail-drop behavior when nothing is locked); a locked row is never a
      // candidate for dropping — already guaranteed by the lockedCount guard above.
      let pendingToDrop = current - count;
      const dropAt = new Set<number>();
      for (let i = installments.length - 1; i >= 0 && pendingToDrop > 0; i--) {
        if (!isLocked(installments[i])) {
          dropAt.add(i);
          pendingToDrop--;
        }
      }
      onInstallmentsChange(
        installments.filter((_, i) => !dropAt.has(i)).map(redistribute),
      );
    }
  };

  // ----- Row handlers -----

  const handleInvoiceDateChange = (idx: number, value: string) => {
    const updated = installments.map((inst, i) => {
      if (i !== idx) return inst;
      const newPaymentDate = value
        ? computePaymentDate(value, currentPlan.payment_days)
        : null;
      return { ...inst, agreed_invoice_date: value || null, agreed_payment_date: newPaymentDate };
    });
    onInstallmentsChange(updated);
  };

  const handlePercentageChange = (idx: number, val: number) => {
    onInstallmentsChange(
      installments.map((inst, i) =>
        i === idx
          ? { ...inst, percentage: val, amount: computeAmount(val, feeWithTax) }
          : inst,
      ),
    );
  };

  // MUST FIX review iteracion 6 #3: onChange (via onInstallmentsChange, que vive en el
  // padre) actualiza el estado de forma asincrona; el onBlur de mas abajo, que persiste
  // el valor con updateInstallmentExchangeRate.mutate(...), corre en el MISMO tick que
  // un onChange de normalizacion disparado por numeric-input.tsx al perder foco (ej.
  // limpiar un separador decimal colgado como "7,") -- si el onBlur lee `inst.*` del
  // closure del ultimo render, todavia no ve ese valor recien normalizado y persiste el
  // anterior. Este ref se actualiza de forma sincrona en el mismo evento, asi que el
  // onBlur siempre puede leer el valor mas reciente sin depender de que el re-render ya
  // haya ocurrido.
  const pendingRateEditsRef = useRef<Record<string, { invoice?: number | null; payment?: number | null }>>({});

  // 0722-156b: solo relevantes en modo Variable (en Fijo la celda es de solo lectura,
  // reflejando el TC de creacion) — el freeze real lo aplica el trigger de DB sobre
  // la columna status persistida, `disabled` aca es solo UX.
  const handleInvoiceRateChange = (idx: number, val: number) => {
    const inst = installments[idx];
    const normalized = val > 0 ? val : null;
    const key = inst.installment_id ?? String(idx);
    pendingRateEditsRef.current[key] = { ...pendingRateEditsRef.current[key], invoice: normalized };
    onInstallmentsChange(
      installments.map((i, idx2) => (idx2 === idx ? { ...i, invoice_exchange_rate: normalized } : i)),
    );
  };

  const handlePaymentRateChange = (idx: number, val: number) => {
    const inst = installments[idx];
    const normalized = val > 0 ? val : null;
    const key = inst.installment_id ?? String(idx);
    pendingRateEditsRef.current[key] = { ...pendingRateEditsRef.current[key], payment: normalized };
    onInstallmentsChange(
      installments.map((i, idx2) => (idx2 === idx ? { ...i, payment_exchange_rate: normalized } : i)),
    );
  };

  const handleCollectionInvoiceDateChange = (idx: number, value: string) => {
    onInstallmentsChange(
      installments.map((inst, i) => {
        if (i !== idx) return inst;
        const newPaymentDate = value
          ? computePaymentDate(value, currentPlan.payment_days)
          : null;
        return { ...inst, collection_invoice_date: value || null, collection_payment_date: newPaymentDate };
      }),
    );
  };

  const handleStatusChange = (idx: number, newStatus: PaymentInstallmentStatus) => {
    const inst = installments[idx];
    const updates: Partial<PaymentInstallmentInput> = { status: newStatus };

    if (newStatus === "Invoiced") {
      if (inst.status !== "Overdue") {
        // First invoice (Pending / auto-Overdue→Invoiced): set collection dates
        updates.collection_invoice_date = today;
        updates.collection_payment_date = computePaymentDate(today, currentPlan.payment_days);
      }
      // Manual Overdue→Invoiced revert: keep existing collection dates
      updates.payment_date_actual = null;
    }
    if (newStatus === "Completed") {
      updates.payment_date_actual = today;
    }
    // Overdue (manual from Invoiced): keep existing collection dates, just change status

    const updated = installments.map((r, i) => (i === idx ? { ...r, ...updates } : r));
    onInstallmentsChange(updated);

    if (inst.installment_id) {
      updateStatus.mutate({
        installmentId: inst.installment_id,
        newStatus,
        prevStatus: inst.status as PaymentInstallmentStatus,
        woId,
        paymentDays: currentPlan.payment_days,
        // 0722-156b: snapshot atomico del TC vigente en el local state al momento
        // de confirmar la transicion — el trigger de freeze evalua OLD.status, asi
        // que esto sigue permitido en la MISMA transicion que congela la cuota.
        invoiceExchangeRate: newStatus === "Invoiced" ? inst.invoice_exchange_rate : undefined,
        paymentExchangeRate: newStatus === "Completed" ? inst.payment_exchange_rate : undefined,
      });
    }
  };

  const handleDeleteRow = (idx: number) => {
    // MUST FIX review iteracion 2 #1 (decision del operador): una cuota ya facturada no
    // se puede eliminar de ninguna manera — el trigger BEFORE DELETE de la migracion es
    // la garantia real; esto evita el viaje redondo innecesario al servidor.
    if (isLocked(installments[idx])) {
      toast.error(t("workOrders.paymentPlan.validationCannotRemoveInvoiced"));
      return;
    }
    const remaining = installments.filter((_, i) => i !== idx);
    if (remaining.length === 0) {
      onInstallmentsChange([]);
      return;
    }
    const lockedPercentageSum = remaining.filter(isLocked).reduce((s, i) => s + i.percentage, 0);
    const unlockedCount = remaining.filter((inst) => !isLocked(inst)).length;
    const unlockedPercentages = distributePercentages(unlockedCount, 100 - lockedPercentageSum);
    let unlockedIdx = 0;
    // installment_number deliberately left untouched (including for surviving unlocked
    // rows) — the visible "N°" column already uses array position, not this field, and
    // leaving it alone avoids ever touching a locked row's data.
    onInstallmentsChange(
      remaining.map((inst) => {
        if (isLocked(inst)) return inst;
        const pct = unlockedPercentages[unlockedIdx++];
        return { ...inst, percentage: pct, amount: computeAmount(pct, feeWithTax) };
      }),
    );
  };

  // ----- Formatting -----

  const formatAmount = (amount: number) => {
    const amountLocale = currency === "BOB" ? "es-BO" : "en-US";
    return Number(amount).toLocaleString(amountLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  // Los importes derivados de facturacion/pago SIEMPRE estan en Bs (el TC convierte a
  // Bs sin importar la moneda de la OT) — formato es-BO fijo, no el locale de `currency`.
  const formatBob = (amount: number) =>
    Number(amount).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <>
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">
            {t("workOrders.paymentPlan.title")}
          </CardTitle>
          {hasAlert && (
            <Alert className="py-2 px-3 w-auto border-warning/50 bg-warning/10 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <AlertDescription className="text-warning text-sm">
                {t("workOrders.paymentPlan.alertBanner")}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Header fields */}
        <div className="flex flex-wrap gap-4">
          {/* Tipo de Cambio (creacion) — only for non-BOB currencies */}
          {currency !== "BOB" && (
            <div className="flex flex-col gap-1 min-w-[150px]">
              <Label>{t("workOrders.paymentPlan.exchangeRate")}</Label>
              <NumericInput
                decimals={6}
                locale={numericLocale}
                min={0}
                value={currentPlan.exchange_rate ?? 0}
                onChange={handleExchangeRateChange}
                disabled={!isEditable || planLocked}
                className="w-full"
                data-testid="payment-plan-exchange-rate"
              />
              {latestBuyRate != null && (
                <p className="text-xs text-muted-foreground">
                  {t("workOrders.paymentPlan.currentBuyRateReference", { value: formatRate(latestBuyRate) })}
                </p>
              )}
            </div>
          )}

          {/* Modo TC (Fijo/Variable) — only for non-BOB currencies */}
          {currency !== "BOB" && (
            <div className="flex flex-col gap-1 min-w-[220px]">
              <Label>{t("workOrders.paymentPlan.exchangeRateMode")}</Label>
              <div role="group" aria-label={t("workOrders.paymentPlan.exchangeRateMode")} className="flex gap-2">
                <Button
                  type="button"
                  variant={currentPlan.exchange_rate_mode === "fijo" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleModeChange("fijo")}
                  disabled={!isEditable || planLocked}
                  data-testid="payment-plan-exchange-rate-mode-fijo"
                  aria-pressed={currentPlan.exchange_rate_mode === "fijo"}
                >
                  {t("workOrders.paymentPlan.exchangeRateModeFijo")}
                </Button>
                <Button
                  type="button"
                  variant={currentPlan.exchange_rate_mode === "variable" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleModeChange("variable")}
                  disabled={!isEditable || planLocked}
                  data-testid="payment-plan-exchange-rate-mode-variable"
                  aria-pressed={currentPlan.exchange_rate_mode === "variable"}
                >
                  {t("workOrders.paymentPlan.exchangeRateModeVariable")}
                </Button>
              </div>
            </div>
          )}

          {/* Días Hábiles */}
          <div className="flex flex-col gap-1 min-w-[150px]">
            <Label>{t("workOrders.paymentPlan.paymentDays")}</Label>
            <NumericInput
              value={currentPlan.payment_days}
              onChange={handlePaymentDaysChange}
              disabled={!isEditable}
              decimals={0}
              min={1}
              className="w-full"
            />
          </div>

          {/* Número de Cuotas */}
          <div className="flex flex-col gap-1">
            <Label>{t("workOrders.paymentPlan.numInstallments")}</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => handleNumInstallmentsChange(numInstallments - 1)}
                disabled={!isEditable || numInstallments <= 0}
                data-testid="payment-plan-installments-minus"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center font-semibold text-base tabular-nums">
                {numInstallments}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => handleNumInstallmentsChange(numInstallments + 1)}
                disabled={!isEditable || numInstallments >= 24}
                data-testid="payment-plan-installments-plus"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Installments table */}
        {installments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-muted-foreground">
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium w-10 align-bottom border-b">
                    {t("workOrders.paymentPlan.installmentNumber")}
                  </th>
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium min-w-[150px] align-bottom border-b">
                    {t("workOrders.paymentPlan.agreedInvoiceDate")}
                  </th>
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium min-w-[115px] align-bottom border-b">
                    {t("workOrders.paymentPlan.agreedPaymentDate")}
                  </th>
                  <th rowSpan={2} className="text-left py-3 px-3 font-medium w-28 align-bottom border-b">
                    {t("workOrders.paymentPlan.percentage")}
                  </th>
                  <th rowSpan={2} className="text-right py-3 px-3 font-medium min-w-[115px] align-bottom border-b">
                    {t("workOrders.paymentPlan.amount")} ({currency})
                  </th>
                  {currency !== "BOB" && (
                    <th colSpan={2} className="text-center py-2 px-3 font-medium border-b border-l border-r border-border/50 bg-muted/20 text-muted-foreground text-xs uppercase tracking-wide">
                      {t("workOrders.paymentPlan.exchangeRate")}
                    </th>
                  )}
                  <th colSpan={3} className="text-center py-2 px-3 font-medium border-b border-l border-r border-border/50 bg-muted/20 text-muted-foreground text-xs uppercase tracking-wide">
                    {t("workOrders.paymentPlan.collectionTitle")}
                  </th>
                  <th rowSpan={2} className="w-8 border-b" />
                </tr>
                <tr className="text-muted-foreground">
                  {currency !== "BOB" && (
                    <>
                      <th className="text-left py-2 px-3 font-medium text-xs min-w-[130px] border-b border-l border-border/50 bg-muted/10">
                        {t("workOrders.paymentPlan.invoiceExchangeRate")}
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-xs min-w-[130px] border-b border-r border-border/50 bg-muted/10">
                        {t("workOrders.paymentPlan.paymentExchangeRate")}
                      </th>
                    </>
                  )}
                  <th className="text-left py-2 px-3 font-medium text-xs min-w-[120px] border-b border-l border-border/50 bg-muted/10">
                    {t("workOrders.paymentPlan.collectionInvoiceDate")}
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs min-w-[115px] border-b border-border/50 bg-muted/10">
                    {t("workOrders.paymentPlan.collectionPaymentDate")}
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs min-w-[135px] border-b border-r border-border/50 bg-muted/10">
                    {t("workOrders.paymentPlan.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst, idx) => {
                  // MUST FIX review iteracion 6 #5: una cuota bloqueada conserva su
                  // `amount` congelado (ver el efecto de feeWithTax mas arriba) -- pero
                  // este monto de pantalla se recalculaba igual desde el fee ACTUAL,
                  // asi que la conversion a Bs (y la columna de monto) de una cuota ya
                  // facturada podia divergir del monto realmente congelado tras un
                  // cambio de fee tardio.
                  const instAmount = isLocked(inst) ? inst.amount : computeAmount(inst.percentage, feeWithTax);
                  const dateEditable = isEditable || isAdminDateEditable;
                  const effectiveStatus = getEffectiveStatus(inst);
                  const availableOptions = STATUS_TRANSITIONS[effectiveStatus];

                  return (
                    <tr key={inst.installment_id ?? inst.installment_number} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3 text-muted-foreground font-medium border-b border-border/50">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 border-b border-border/50">
                        <Input
                          type="date"
                          lang="es-BO"
                          value={inst.agreed_invoice_date ?? ""}
                          onChange={(e) => handleInvoiceDateChange(idx, e.target.value)}
                          disabled={!dateEditable}
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="py-3 px-3 text-muted-foreground font-mono text-xs border-b border-border/50">
                        {fmtDate(inst.agreed_payment_date)}
                      </td>
                      <td className="py-3 px-3 border-b border-border/50">
                        <NumericInput
                          locale={numericLocale}
                          value={inst.percentage}
                          onChange={(val) => handlePercentageChange(idx, val)}
                          disabled={!isEditable}
                          min={0}
                          max={100}
                          className="w-full h-8"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono border-b border-border/50">
                        {formatAmount(instAmount)}
                      </td>
                      {/* Tipo de Cambio group — only for non-BOB currencies */}
                      {currency !== "BOB" && (
                        <>
                          <td className="py-3 px-3 border-b border-l border-border/50 bg-muted/10">
                            {currentPlan.exchange_rate_mode === "fijo" ? (
                              <span className="text-muted-foreground font-mono text-xs" data-testid="installment-invoice-rate-readonly">
                                {inst.invoice_exchange_rate != null ? formatRate(inst.invoice_exchange_rate) : "—"}
                              </span>
                            ) : (
                              <NumericInput
                                decimals={6}
                                locale={numericLocale}
                                min={0}
                                value={inst.invoice_exchange_rate ?? 0}
                                onChange={(val) => handleInvoiceRateChange(idx, val)}
                                onBlur={() => {
                                  // Guardado directo e inmediato (0722-156b Amendment 2026-09-07):
                                  // este campo solo se habilita con la OT ya Aprobada, momento en el
                                  // que WorkOrderForm ya no ofrece un boton "Guardar" de pagina --
                                  // sin esto el valor quedaba atrapado en memoria para siempre.
                                  // MUST FIX review iteracion 2 #13: mismo guard que ya usa la fecha
                                  // de cobro -- no guardar directo si el resto del plan tiene cambios
                                  // sin guardar todavia (evita que el batch-save posterior pise esto).
                                  if (inst.installment_id) {
                                    if (isPaymentPlanDirty) {
                                      toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
                                      return;
                                    }
                                    const pending = pendingRateEditsRef.current[inst.installment_id];
                                    updateInstallmentExchangeRate.mutate({
                                      installmentId: inst.installment_id,
                                      field: "invoice_exchange_rate",
                                      value: pending?.invoice !== undefined ? pending.invoice : inst.invoice_exchange_rate,
                                      woId,
                                    });
                                  }
                                }}
                                disabled={!isStatusEditable || !isInvoiceRateEditable(inst.status)}
                                className="w-full h-8"
                                data-testid="installment-invoice-rate"
                              />
                            )}
                            {latestBuyRate != null && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {t("workOrders.paymentPlan.currentBuyRateShort", { value: formatRate(latestBuyRate) })}
                              </p>
                            )}
                            {inst.invoice_exchange_rate != null && (
                              <p className="text-[10px] text-muted-foreground">
                                {t("workOrders.paymentPlan.invoiceAmountBob", {
                                  value: formatBob(computeConvertedAmount(instAmount, inst.invoice_exchange_rate) ?? 0),
                                })}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 border-b border-r border-border/50 bg-muted/10">
                            {currentPlan.exchange_rate_mode === "fijo" ? (
                              <span className="text-muted-foreground font-mono text-xs" data-testid="installment-payment-rate-readonly">
                                {inst.payment_exchange_rate != null ? formatRate(inst.payment_exchange_rate) : "—"}
                              </span>
                            ) : (
                              <NumericInput
                                decimals={6}
                                locale={numericLocale}
                                min={0}
                                value={inst.payment_exchange_rate ?? 0}
                                onChange={(val) => handlePaymentRateChange(idx, val)}
                                onBlur={() => {
                                  if (inst.installment_id) {
                                    if (isPaymentPlanDirty) {
                                      toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
                                      return;
                                    }
                                    const pending = pendingRateEditsRef.current[inst.installment_id];
                                    updateInstallmentExchangeRate.mutate({
                                      installmentId: inst.installment_id,
                                      field: "payment_exchange_rate",
                                      value: pending?.payment !== undefined ? pending.payment : inst.payment_exchange_rate,
                                      woId,
                                    });
                                  }
                                }}
                                disabled={!isStatusEditable || !isPaymentRateCaptureEditable(inst.status)}
                                className="w-full h-8"
                                data-testid="installment-payment-rate"
                              />
                            )}
                            {latestBuyRate != null && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {t("workOrders.paymentPlan.currentBuyRateShort", { value: formatRate(latestBuyRate) })}
                              </p>
                            )}
                            {inst.payment_exchange_rate != null && (
                              <p className="text-[10px] text-muted-foreground">
                                {t("workOrders.paymentPlan.paymentAmountBob", {
                                  value: formatBob(computeConvertedAmount(instAmount, inst.payment_exchange_rate) ?? 0),
                                })}
                              </p>
                            )}
                          </td>
                        </>
                      )}
                      {/* Cobranza group */}
                      <td className="py-3 px-3 border-b border-l border-border/50 bg-muted/10">
                        {isStatusEditable ? (
                          <Input
                            type="date"
                            lang="es-BO"
                            value={inst.collection_invoice_date ?? ""}
                            onChange={(e) => {
                              if (inst.installment_id && e.target.value) {
                                if (isPaymentPlanDirty) {
                                  toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
                                  return;
                                }
                                setPendingCollectionDate({ installmentId: inst.installment_id, newDate: e.target.value });
                              } else {
                                handleCollectionInvoiceDateChange(idx, e.target.value);
                              }
                            }}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-muted-foreground font-mono text-xs">
                            {fmtDate(inst.collection_invoice_date)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground font-mono text-xs border-b border-border/50 bg-muted/10">
                        {fmtDate(inst.collection_payment_date)}
                      </td>
                      <td className="py-3 px-3 border-b border-r border-border/50 bg-muted/10">
                        {isStatusEditable && availableOptions.length > 0 ? (
                          <Select
                            value={effectiveStatus}
                            onValueChange={(val) => {
                              const s = val as PaymentInstallmentStatus;
                              if (isPaymentPlanDirty && inst.installment_id) {
                                toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
                                return;
                              }
                              if (s === "Invoiced" || s === "Completed" || s === "Overdue") {
                                setPendingChange({ idx, newStatus: s });
                              } else {
                                handleStatusChange(idx, s);
                              }
                            }}
                          >
                            <SelectTrigger className={cn("h-8 text-sm", STATUS_COLORS[effectiveStatus])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Current state shown as disabled so SelectValue has text to display */}
                              <SelectItem value={effectiveStatus} disabled className={cn("opacity-50", STATUS_COLORS[effectiveStatus])}>
                                {t(`workOrders.paymentPlan.status${effectiveStatus}`)}
                              </SelectItem>
                              {availableOptions.map((val) => (
                                <SelectItem
                                  key={val}
                                  value={val}
                                  className={STATUS_COLORS[val]}
                                >
                                  {t(`workOrders.paymentPlan.status${val}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            title={effectiveStatus === "Overdue" ? t("workOrders.paymentPlan.statusOverdueLong") : undefined}
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              STATUS_CHIP_CLASSES[effectiveStatus],
                            )}
                          >
                            {t(`workOrders.paymentPlan.status${effectiveStatus}`)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-1 border-b border-border/50">
                        {isEditable && installments.length > 1 && !isLocked(inst) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRow(idx)}
                            type="button"
                            data-testid={`installment-delete-${idx}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-3 px-3 text-muted-foreground uppercase text-xs tracking-wide" colSpan={3}>
                    {t("workOrders.paymentPlan.total")}
                  </td>
                  <td className="py-3 px-3">
                    <span className={cn(!percentageValid && "text-destructive font-bold")}>
                      {percentageSumDisplay}%
                    </span>
                    {!percentageValid && (
                      <p className="text-xs text-destructive mt-0.5">
                        {t("workOrders.paymentPlan.validationPercentageSum")}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatAmount(totalAmount)}
                  </td>
                  <td colSpan={currency !== "BOB" ? 6 : 4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Confirmation dialog for status changes that record a date */}
    <Dialog open={!!pendingChange} onOpenChange={(open) => { if (!open) setPendingChange(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pendingChange?.newStatus === "Invoiced" && t("workOrders.paymentPlan.confirmInvoicedTitle")}
            {pendingChange?.newStatus === "Completed" && t("workOrders.paymentPlan.confirmCompletedTitle")}
            {pendingChange?.newStatus === "Overdue" && t("workOrders.paymentPlan.confirmOverdueTitle")}
          </DialogTitle>
          <DialogDescription className="pt-2 space-y-2">
            <span className="block">
              {pendingChange?.newStatus === "Invoiced" && t("workOrders.paymentPlan.confirmInvoicedDesc", { date: today })}
              {pendingChange?.newStatus === "Completed" && t("workOrders.paymentPlan.confirmCompletedDesc", { date: today })}
              {pendingChange?.newStatus === "Overdue" && t("workOrders.paymentPlan.confirmOverdueDesc")}
            </span>
            {pendingChange?.newStatus !== "Overdue" && (
              <span className="block text-destructive/80 text-xs font-medium">
                {t("workOrders.paymentPlan.confirmIrreversible")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingChange(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={pendingChange?.newStatus === "Overdue" ? "destructive" : "default"}
            onClick={() => {
              if (pendingChange) {
                handleStatusChange(pendingChange.idx, pendingChange.newStatus);
                setPendingChange(null);
              }
            }}
          >
            {pendingChange?.newStatus === "Invoiced" && t("workOrders.paymentPlan.confirmInvoicedAction")}
            {pendingChange?.newStatus === "Completed" && t("workOrders.paymentPlan.confirmCompletedAction")}
            {pendingChange?.newStatus === "Overdue" && t("workOrders.paymentPlan.confirmOverdueAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Collection invoice date correction dialog (admin direct-save) */}
    <Dialog open={!!pendingCollectionDate} onOpenChange={(open) => { if (!open) setPendingCollectionDate(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workOrders.paymentPlan.confirmCollectionDateTitle")}</DialogTitle>
          <DialogDescription>
            {t("workOrders.paymentPlan.confirmCollectionDateDesc", { date: fmtDate(pendingCollectionDate?.newDate ?? null) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingCollectionDate(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={async () => {
              if (pendingCollectionDate) {
                await updateCollectionDate.mutateAsync({
                  installmentId: pendingCollectionDate.installmentId,
                  collectionInvoiceDate: pendingCollectionDate.newDate,
                  paymentDays: currentPlan.payment_days,
                  woId,
                });
                setPendingCollectionDate(null);
              }
            }}
          >
            {t("workOrders.paymentPlan.confirmCollectionDateAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
