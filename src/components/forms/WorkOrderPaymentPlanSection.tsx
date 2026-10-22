import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Plus, Minus, CalendarClock, Check, X, MessageSquare, Percent, History } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { rpcUntyped } from "@/lib/rpcUntyped";
import {
  useUpdateInstallmentStatus,
  useUpdateCollectionDate,
  useUpdateInstallmentExchangeRate,
  useRescheduleInstallment,
  useRecordInstallmentConfirmation,
  useCreateExpenseReimbursementRow,
  useSetExpenseReimbursementAmount,
  useAddInstallmentAdjustment,
  useDeleteInstallmentAdjustment,
  useSetInstallmentCurrency,
} from "@/hooks/mutations";
import { useBillableExpenses, totalBillable } from "@/hooks/useBillableExpenses";
import {
  useInstallmentAdjustments,
  adjustmentsForInstallment,
  adjustmentsTotal,
} from "@/hooks/useInstallmentAdjustments";
import { useInstallmentEvents, eventsForInstallment, type InstallmentEvent } from "@/hooks/useInstallmentEvents";
import { fetchSuggestedExchangeDifference } from "@/hooks/mutations/useWorkOrderPaymentPlanMutations";
import { useLatestExchangeRate } from "@/hooks/useExchangeRate";
import { useInstallmentNotes, notesForInstallment, planLevelNotes } from "@/hooks/useInstallmentNotes";
import { useWorkOrderClientContacts } from "@/hooks/useClientContacts";
import { InstallmentNotesThread } from "./InstallmentNotesThread";
import {
  distributePercentages,
  computeAmount,
  computeAmountInCurrency,
  convertAmount,
  computePaymentDate,
  isAlertDue,
  getInstallmentDisplay,
  currentDueDate,
  currentInvoiceDate,
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
  // Decision del operador 2026-09-10 (ampliada el mismo dia): solo el gerente del
  // encargo (o un admin) puede editar el plan de pagos -- TC inicial, toggle
  // Fijo/Variable, dias habiles, cuotas y sus fechas/porcentajes. Un socio (partner_id),
  // pese a seguir siendo team member para el resto de la OT, ya NO puede escribir nada
  // de esta seccion -- reemplaza la primera version de esta decision, que dejaba
  // payment_days/cuotas/fechas abiertos a todo el equipo bajo isEditable solo. Reflejado
  // tambien en la policy RLS "Manager can manage payment plans/installments"
  // (20260908150000_0722-156b_plan_insert_guard.sql).
  canEditPaymentPlan: boolean;
  /**
   * Cobranzas Fase 2 (decisión del operador Q19): Contabilidad SÍ puede abrir una OT que
   * todavía no está aprobada, pero no puede cobrar sobre ella. En vez de dejar los
   * controles apagados sin explicación, se avisa por qué. El bloqueo real lo aplica el
   * servidor (wo_payment_installments_guard_exchange_rate y las RPC de cobranza); esto solo
   * lo cuenta.
   */
  collectionsApprovalStatus?: "Draft" | "Pending_Approval" | "Approved" | "Rejected" | null;
  /**
   * Cobranzas Fase 4 (decisión Q16): quién participa del hilo de notas — gerente y socio del
   * encargo, Contabilidad y admin. Es un conjunto más amplio que `canEditPaymentPlan`: el
   * SOCIO escribe notas aunque siga sin poder tocar el plan, y esa es justamente la vía que la
   * Fase 4 le da para dejar constancia.
   */
  canWriteNotes?: boolean;
  /**
   * Cobranzas Fase 7: las filas con las que Contabilidad le cobra al cliente los gastos ya
   * ejecutados. Llegan aparte de `installments` porque NO reparten el honorario: no entran en
   * la suma del 100%, no se redistribuyen y la pantalla no las manda al guardar el plan.
   */
  expenseRows?: PaymentInstallmentInput[];
  /** Cobranzas Fase 7 (decisión Q24): sólo Contabilidad factura los gastos ejecutados. */
  canBillExpenses?: boolean;
  /**
   * La alícuota de la OT, para mostrar cuánto del monto facturado es impuesto. Sale de la orden
   * y no de un 0,13 escrito acá: si alguna vez cambia, cambia en un solo lugar.
   */
  taxRate?: number;
  /** staff_id de quien mira: decide qué notas puede editar o borrar (sólo las propias, Q51). */
  currentStaffId?: string | null;
  isAdminViewer?: boolean;
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

// Transiciones legales, siempre sobre el estado PERSISTIDO. Cobranzas Fase 1: antes se
// consultaba con el estado "efectivo" (una cuota Pendiente con su fecha de facturación
// pasada se leía como "Overdue"), que daba la misma lista por casualidad —
// STATUS_TRANSITIONS.Pending y .Overdue son ambos ["Invoiced"]— pero hacía creer que una
// cuota sin facturar estaba en mora. La condición de calendario ya no se mezcla con la
// etapa: va en su propia insignia.
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
  canEditPaymentPlan,
  collectionsApprovalStatus = null,
  canWriteNotes = false,
  expenseRows = [],
  canBillExpenses = false,
  taxRate = 0.13,
  currentStaffId = null,
  isAdminViewer = false,
  isPaymentPlanDirty = false,
  onPlanChange,
  onInstallmentsChange,
}: WorkOrderPaymentPlanSectionProps) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const updateStatus = useUpdateInstallmentStatus();
  const updateCollectionDate = useUpdateCollectionDate();
  // Cobranzas Fase 3: confirmación con el cliente y reprogramación. Las dos son del gerente
  // del encargo o un admin (decisiones Q11 y Q42); el servidor lo verifica.
  // Confirmar y reprogramar las hace el gerente del encargo o un admin: el mismo predicado
  // que `canEditPaymentPlan`. Se le da nombre propio porque el permiso es sobre el CONTRATO
  // de la cuota (su fecha pactada), no sobre editar el plan mientras la OT está en Draft —
  // de hecho el caso normal es con la OT ya aprobada.
  const canManageSchedule = canEditPaymentPlan;
  // Cobranzas Fase 4: el hilo entero de la OT en UNA consulta — el banner del plan, los
  // contadores por fila y el bloque de los diálogos salen todos de acá (decisión Q6/Q34).
  const { data: notes } = useInstallmentNotes(woId || undefined);
  // Cobranzas Fase 5 (decisión Q57): los contactos del cliente se ven DENTRO del plan. Van por
  // RPC y no por la tabla porque el Gerente de Contabilidad no tiene `client.read`, y la
  // decisión fue mostrárselos acá en vez de abrirle la ficha entera del cliente.
  const { data: clientContacts } = useWorkOrderClientContacts(woId || undefined);
  const planNotes = planLevelNotes(notes);
  const [notesDialog, setNotesDialog] = useState<{ idx: number } | null>(null);
  const rescheduleInstallment = useRescheduleInstallment();
  const recordConfirmation = useRecordInstallmentConfirmation();
  // `notConfirmed` abre el mismo diálogo que `reschedule` pero además registra que el
  // cliente dijo que no: es el flujo de un solo paso que pidió el operador (Q11).
  const [scheduleDialog, setScheduleDialog] = useState<
    { idx: number; mode: "reschedule" | "notConfirmed" } | null
  >(null);
  const [scheduleDate, setScheduleDate] = useState("");
  // Cobranzas Fase 6 (decisión Q49): al facturar, el TC se autocompleta según el modo del
  // plan, pero se puede corregir — a mano, o eligiendo una fecha y trayendo el TC de ese día.
  // `invoiceRateDate` vacío significa "escrito a mano", y así se guarda.
  const [invoiceRate, setInvoiceRate] = useState<number | null>(null);
  const [invoiceRateDate, setInvoiceRateDate] = useState("");
  const [scheduleReason, setScheduleReason] = useState("");
  const updateInstallmentExchangeRate = useUpdateInstallmentExchangeRate();
  const latestRate = useLatestExchangeRate();
  const latestBuyRate = latestRate.data?.compra ?? null;

  // Cobranzas Fase 6: el TC de una fecha concreta, para el calendario del diálogo de facturar.
  // Va por RPC porque la regla —si esa fecha no tiene cotización, vale la última anterior— vive
  // en la base (exchange_rate_on), y repetirla acá sería un segundo criterio.
  const fetchRateOn = async (date: string): Promise<number | null> => {
    const { data, error } = await rpcUntyped<number | null>("exchange_rate_on", { p_date: date });
    if (error) return null;
    return data == null ? null : Number(data);
  };
  const [pendingChange, setPendingChange] = useState<{
    row: PaymentInstallmentInput;
    newStatus: "Invoiced" | "Completed" | "Overdue";
  } | null>(null);
  const [pendingCollectionDate, setPendingCollectionDate] = useState<{
    installmentId: string;
    newDate: string;
  } | null>(null);
  // Iteración 18 #2: el TC de creación no persiste NULL sobre un valor ya real
  // (Iteración 17 #3), pero eso dejaba el campo re-mostrando el valor viejo de
  // inmediato al borrarlo -- la tecla siguiente se insertaba sobre ese valor en vez
  // de reemplazarlo. Este flag deja el input visualmente vacío mientras el usuario
  // escribe el valor nuevo, sin tocar el modelo real hasta que entra un número > 0;
  // si el usuario sale del campo sin terminar de escribir, vuelve a mostrar el
  // valor real (ver onBlur del input).
  const [rateInputBlank, setRateInputBlank] = useState(false);

  // Cobranzas Fase 7: los gastos de la OT que todavía se le pueden facturar al cliente. Sólo
  // se consulta si quien mira puede facturarlos — para el resto, el bloque es de lectura.
  const { data: billableExpenses } = useBillableExpenses(woId || undefined, canBillExpenses);
  const pendingBillable = totalBillable(billableExpenses);
  const createExpenseRow = useCreateExpenseReimbursementRow();
  const setExpenseAmount = useSetExpenseReimbursementAmount();
  const setInstallmentCurrency = useSetInstallmentCurrency();
  // El monto se escribe en el input y se manda al salir del campo: mandarlo en cada tecla
  // dispararía un aviso al gerente por cada dígito.
  const [expenseAmountDraft, setExpenseAmountDraft] = useState<{ id: string; value: number } | null>(null);

  // Cobranzas Fase 9: los ajustes de todas las cuotas de la OT, en UNA consulta — el total por
  // fila y el dialogo salen del mismo arreglo.
  const { data: adjustments } = useInstallmentAdjustments(woId || undefined);
  // La bitácora de todas las cuotas de la OT, en UNA consulta.
  const { data: events } = useInstallmentEvents(woId || undefined);
  const [historyDialog, setHistoryDialog] = useState<{ idx: number } | null>(null);
  const addAdjustment = useAddInstallmentAdjustment();
  const deleteAdjustment = useDeleteInstallmentAdjustment();
  const [adjustmentsDialog, setAdjustmentsDialog] = useState<{ installmentId: string } | null>(null);

  // El formulario se limpia al ABRIR, no sólo al cerrar. Limpiar sólo al cerrar dejaba los
  // valores de una cuota cargados en el diálogo de la siguiente: el botón "Cerrar" pone el
  // estado en null por su cuenta y Radix no dispara `onOpenChange`, así que ese camino nunca
  // limpiaba. Abrir es el único momento que garantiza empezar en blanco.
  const resetAdjustmentForm = () => {
    setAdjustmentType("descuento");
    setAdjustmentAmount(0);
    setAdjustmentReason("");
    setSuggestedDifference(null);
  };

  const openAdjustments = (installmentId: string) => {
    if (blockIfPlanDirty()) return;
    resetAdjustmentForm();
    setAdjustmentsDialog({ installmentId });
  };

  const closeAdjustments = () => {
    setAdjustmentsDialog(null);
    resetAdjustmentForm();
  };
  const [adjustmentType, setAdjustmentType] = useState<"descuento" | "diferencia_cambio">("descuento");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  // El numero que la base propone para una diferencia de cambio; null = no hay cuenta que
  // hacer (la cuota no esta cobrada, va en Bs, o le falta alguno de los dos TC).
  const [suggestedDifference, setSuggestedDifference] = useState<number | null>(null);
  const dialogAdjustments = adjustmentsForInstallment(adjustments, adjustmentsDialog?.installmentId);
  const historyEvents = eventsForInstallment(
    events,
    historyDialog !== null ? installments[historyDialog.idx]?.installment_id : undefined,
  );

  /**
   * Una línea por evento, en el idioma del negocio. La tabla guarda el QUÉ en bruto
   * (`action` más las columnas que ese tipo usa); traducirlo acá, y no al escribirlo, deja la
   * bitácora intacta si mañana cambia la redacción.
   */
  const describeEvent = (ev: InstallmentEvent): string => {
    switch (ev.action) {
      case "status_change":
        return t("workOrders.paymentPlan.historyStatusChange", {
          from: ev.from_status ? t(`workOrders.paymentPlan.status${ev.from_status}`) : "—",
          to: ev.to_status ? t(`workOrders.paymentPlan.status${ev.to_status}`) : "—",
        });
      case "rescheduled":
        return t("workOrders.paymentPlan.historyRescheduled", {
          from: fmtDate(ev.old_date),
          to: fmtDate(ev.new_date),
        });
      case "confirmation":
        // La confirmación lleva la fecha en `new_date`; el rechazo, la fecha que se rechazó en
        // `old_date`. Es lo que distingue "confirmó para el X" de "no confirmó el X".
        return ev.new_date
          ? t("workOrders.paymentPlan.historyConfirmed", { date: fmtDate(ev.new_date) })
          : t("workOrders.paymentPlan.historyNotConfirmed", { date: fmtDate(ev.old_date) });
      case "adjustment":
        return t("workOrders.paymentPlan.historyAdjustment", {
          amount: `${ev.currency ?? ""} ${formatAmount(ev.amount ?? 0, ev.currency ?? currency)}`.trim(),
        });
      case "payment_date_corrected":
        return t("workOrders.paymentPlan.historyPaymentDateCorrected", {
          from: fmtDate(ev.old_date),
          to: fmtDate(ev.new_date),
        });
      case "reimbursement_amount_changed":
        return t("workOrders.paymentPlan.historyReimbursementAmount", {
          amount: `${ev.currency ?? ""} ${formatAmount(ev.amount ?? 0, ev.currency ?? "BOB")}`.trim(),
        });
      default:
        return ev.action;
    }
  };


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

  const installmentCurrency = (inst: PaymentInstallmentInput) => inst.currency ?? currency;

  // El monto de una cuota EN SU MONEDA. Una cuota en otra moneda cobra el MISMO valor
  // convertido con el TC del plan (decisión del operador 2026-10-20), no un monto distinto:
  // así el porcentaje sigue significando lo que dice y el plan sigue repartiendo el 100% del
  // honorario.
  const amountFor = (inst: PaymentInstallmentInput, pct = inst.percentage) =>
    computeAmountInCurrency(pct, feeWithTax, installmentCurrency(inst), currency, currentPlan.exchange_rate);

  const formatRate = (rate: number) =>
    Number(rate).toLocaleString(numericLocale === "es" ? "es-BO" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });


  const hasAlert = installments.some((inst) => isAlertDue(inst));

  const percentageSum = installments.reduce((s, i) => s + i.percentage, 0);
  const percentageSumDisplay = parseFloat(percentageSum.toFixed(2));
  const percentageValid = Math.abs(percentageSum - 100) <= 0.01;

  // Iteración 18 #3: debe sumar exactamente lo que se ve en cada fila (línea ~751)
  // -- una cuota isLocked muestra su inst.amount congelado, no el recálculo con el
  // fee actual; antes de este fix el total del footer sí lo recalculaba para TODAS
  // las cuotas, divergiendo del monto real si el fee cambiaba tras facturar.
  const totalAmount = installments.reduce((s, i) => {
    return s + (isLocked(i) ? (i.amount ?? 0) : amountFor(i));
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

  // Iteración 17/18 (decisión del operador 2026-09-10): NULL sigue siendo un valor
  // válido solo mientras el plan NUNCA tuvo un TC real (exchange_rate_history vacía,
  // Decisión #7 de plan_v2.md) -- pero una vez que el campo tiene un valor real, no se
  // permite borrarlo a NULL (para corregirlo se tipea el número nuevo encima). Sin
  // esto, un plan con cuotas ya sincronizadas a un TC podía quedar en NULL mientras las
  // cuotas se quedaban con el TC viejo -- ver review.md, hallazgo cerrado reemplazando
  // el fix original (propagar NULL en el trigger de re-sync) por esta prevención en el
  // origen, replicada también en la base de datos (wo_payment_plan_guard_exchange_rate).
  const handleExchangeRateChange = (val: number) => {
    if (val <= 0 && currentPlan.exchange_rate != null) {
      setRateInputBlank(true);
      return;
    }
    setRateInputBlank(false);
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
  //
  // MUST FIX review iteracion 21 #2 (codex): mismo bug que la iteracion 20 #2 (el
  // efecto de "resolucion tardia" del TC), pero en este otro code path -- cambiar
  // el modo a Variable rellenaba invoice_exchange_rate de una cuota YA guardada
  // (installment_id real) con TC null, y el trigger rechaza (EXCHANGE_RATE_LOCKED)
  // ese cambio mientras la OT no este Aprobada, bloqueando el guardado del cambio
  // de modo. Mismo guard: solo filas todavia sin persistir se autocompletan.
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
            !inst.installment_id && isInvoiceRateEditable(inst.status) && inst.invoice_exchange_rate == null
              ? latestBuyRate
              : inst.invoice_exchange_rate,
          payment_exchange_rate:
            !inst.installment_id && isPaymentRateCaptureEditable(inst.status) && inst.payment_exchange_rate == null
              ? latestBuyRate
              : inst.payment_exchange_rate,
        })),
      );
    }
  };

  // Auto-initialize to 1 installment only for brand-new WOs (woId is empty string).
  // For existing WOs (woId is a UUID), data comes from DB hydration — don't override.
  useEffect(() => {
    if (!woId && installments.length === 0 && isEditable && canEditPaymentPlan) {
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
  //
  // Decision del operador 2026-09-10: mismo riesgo con canEditPaymentPlan -- si un
  // socio (no gerente del encargo) abre la OT, este efecto no debe autocompletar un
  // valor que ese usuario no podria guardar (el trigger lo rechazaria con
  // EXCHANGE_RATE_FORBIDDEN, y ahora ademas la RLS "Manager can manage payment plans"
  // rechazaria el UPDATE completo), dejando la pagina "sucia" sin que haya tocado nada.
  useEffect(() => {
    if (currency === "BOB") return;
    if (currentPlan.exchange_rate != null) return;
    if (!isEditable || !canEditPaymentPlan || latestBuyRate == null || installments.length === 0) return;
    onPlanChange({ ...currentPlan, exchange_rate: latestBuyRate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, currentPlan.exchange_rate, isEditable, canEditPaymentPlan, latestBuyRate, installments.length]);

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
  //
  // Decision del operador 2026-09-10: mismo gate de canEditPaymentPlan que el efecto
  // de arriba -- sin esto, un socio que solo puede VER una OT Draft ajena (via "Team
  // can view payment plans", que si lo sigue permitiendo) veria el plan marcarse
  // "sucio" apenas resuelve el TC de compra, sin poder ni guardarlo ni descartarlo.
  useEffect(() => {
    if (currency === "BOB") return;
    if (latestBuyRate == null || !isEditable || !canEditPaymentPlan || installments.length === 0) return;
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
      // MUST FIX review iteracion 20 #2 (codex): en modo Variable, el TC por cuota
      // es una captura independiente que el trigger (Iteracion 13) solo acepta con
      // la OT Aprobada -- una cuota que YA se guardo (tiene installment_id real)
      // con este campo en null (porque exchange_rate_history estaba vacia al
      // crearla) no debe autocompletarse mas tarde solo porque latestBuyRate
      // resolvio: si la OT sigue Draft/en revision, sync_wo_payment_installments
      // reenvia TODAS las cuotas en cada guardado, y el trigger rechaza (
      // EXCHANGE_RATE_LOCKED) ese cambio -- bloqueando CUALQUIER guardado
      // posterior del plan, no solo el de esta cuota. Decision del operador: una
      // vez guardada/enviada, se muestra el valor que ya tiene (aunque sea null),
      // nunca uno autocompletado nuevo. Este autocompletado solo debe alcanzar a
      // filas todavia sin persistir (installment_id ausente -- mismo criterio ya
      // usado por handleNumInstallmentsChange al crearlas, y por PEM17 para
      // "no persiste al hacer blur en una fila nueva").
      const needsInit = installments.some(
        (inst) =>
          (!inst.installment_id && isInvoiceRateEditable(inst.status) && inst.invoice_exchange_rate == null) ||
          (!inst.installment_id && isPaymentRateCaptureEditable(inst.status) && inst.payment_exchange_rate == null),
      );
      if (needsInit) {
        onInstallmentsChange(
          installments.map((inst) => ({
            ...inst,
            invoice_exchange_rate:
              !inst.installment_id && isInvoiceRateEditable(inst.status) && inst.invoice_exchange_rate == null
                ? latestBuyRate
                : inst.invoice_exchange_rate,
            payment_exchange_rate:
              !inst.installment_id && isPaymentRateCaptureEditable(inst.status) && inst.payment_exchange_rate == null
                ? latestBuyRate
                : inst.payment_exchange_rate,
          })),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, latestBuyRate, isEditable, canEditPaymentPlan, currentPlan.exchange_rate_mode, currentPlan.exchange_rate, installments.length]);

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
        isLocked(inst) ? inst : { ...inst, amount: amountFor(inst) },
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
      return { ...inst, percentage: pct, amount: amountFor(inst, pct) };
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
          // Una cuota recien creada va SIEMPRE en la moneda de la OT (currency null), asi que
          // no hay nada que convertir: se cambia despues, con el selector de la fila.
          amount: computeAmount(pct, feeWithTax),
          status: "Pending" as PaymentInstallmentStatus,
          invoice_exchange_rate: initialRate,
          // MUST FIX review iteracion 21 #1 (codex): en modo Variable,
          // payment_exchange_rate nunca deberia tener valor mientras la cuota
          // sigue Pending -- isPaymentRateCaptureEditable la excluye a proposito
          // (es una captura independiente de contabilidad que arranca recien al
          // facturar, Decision #4). En Fijo si debe reflejar el TC del plan
          // desde la creacion, igual que invoice_exchange_rate -- ahi ambos son
          // siempre un espejo del mismo TC, nunca una captura independiente.
          payment_exchange_rate: currentPlan.exchange_rate_mode === "fijo" ? initialRate : null,
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
          ? { ...inst, percentage: val, amount: amountFor(inst, val) }
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

  // Cobranzas Fase 7: recibe la FILA, no su posición. Las filas de gastos ejecutados viven
  // fuera de `installments` —no reparten el honorario— pero se facturan y se cobran con este
  // mismo flujo, que es justamente el punto: para Contabilidad son plata a cobrar como
  // cualquier cuota.
  const handleStatusChange = (
    inst: PaymentInstallmentInput,
    newStatus: PaymentInstallmentStatus,
    // Cobranzas Fase 6: el TC que la persona confirmó en el diálogo de facturar, y de qué
    // fecha salió (null = lo escribió a mano).
    rateOverride?: { invoiceRate: number | null; invoiceRateDate: string | null },
  ) => {
    const updates: Partial<PaymentInstallmentInput> = { status: newStatus };
    // El TC del diálogo sólo vale para una cuota que NO va en Bs: en una cuota en bolivianos no
    // hay nada que convertir, y aplicarlo igual le escribía un TC sin sentido —a veces uno
    // heredado de otro diálogo— que en modo fijo hacía rebotar el cobro.
    const rate = installmentCurrency(inst) !== "BOB" ? rateOverride?.invoiceRate ?? null : null;

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
      // El TC con el que se cobró, confirmado en el diálogo. Sin esto, se cobraba con lo que
      // hubiera quedado en la columna y después ya no se podía corregir.
      if (rate != null) {
        updates.payment_exchange_rate = rate;
      }
    }
    // Overdue (manual from Invoiced): keep existing collection dates, just change status

    // Sólo el plan de honorarios vive en el estado de la página. Una fila de gastos se
    // refresca sola cuando la mutación invalida la OT.
    if (inst.installment_type !== "expense_reimbursement") {
      onInstallmentsChange(
        installments.map((r) => (r.installment_id === inst.installment_id ? { ...r, ...updates } : r)),
      );
    }

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
        invoiceExchangeRate:
          newStatus === "Invoiced"
            ? rate ?? inst.invoice_exchange_rate
            : undefined,
        invoiceExchangeRateDate:
          newStatus === "Invoiced" && rate != null ? rateOverride?.invoiceRateDate ?? null : undefined,
        paymentExchangeRate:
          newStatus === "Completed"
            ? rate ?? inst.payment_exchange_rate
            : undefined,
      });
    }
  };

  // Las acciones de fila guardan por su cuenta y después refrescan la OT, y ese refresco
  // rehidrata TODO el plan desde la base: si había cambios sin guardar —porcentajes, fechas—
  // se perdían sin aviso. Es el mismo chequeo que ya tenía el selector de estado.
  const blockIfPlanDirty = (): boolean => {
    if (!isPaymentPlanDirty) return false;
    toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
    return true;
  };

  const openScheduleDialog = (idx: number, mode: "reschedule" | "notConfirmed") => {
    if (blockIfPlanDirty()) return;
    setScheduleDate("");
    setScheduleReason("");
    setScheduleDialog({ idx, mode });
  };

  const handleScheduleSubmit = () => {
    if (!scheduleDialog) return;
    const inst = installments[scheduleDialog.idx];
    if (!inst?.installment_id) return;
    // La fecha vigente que la pantalla tenía al abrir: viaja como control de concurrencia.
    const expected = currentInvoiceDate(inst);

    if (scheduleDialog.mode === "notConfirmed") {
      recordConfirmation.mutate({
        installmentId: inst.installment_id,
        confirmed: false,
        expectedInvoiceDate: expected,
        note: scheduleReason,
        newInvoiceDate: scheduleDate,
        paymentDays: currentPlan.payment_days,
        woId,
      });
    } else {
      rescheduleInstallment.mutate({
        installmentId: inst.installment_id,
        newInvoiceDate: scheduleDate,
        reason: scheduleReason,
        expectedInvoiceDate: expected,
        paymentDays: currentPlan.payment_days,
        woId,
      });
    }
    setScheduleDialog(null);
  };

  const handleConfirmClient = (idx: number) => {
    if (blockIfPlanDirty()) return;
    const inst = installments[idx];
    if (!inst?.installment_id) return;
    recordConfirmation.mutate({
      installmentId: inst.installment_id,
      confirmed: true,
      expectedInvoiceDate: currentInvoiceDate(inst),
      paymentDays: currentPlan.payment_days,
      woId,
    });
  };

  /**
   * Cobranzas Fase 6 (decisión Q29, resuelta el 2026-10-20): cambiar la moneda de una cuota
   * CONVIERTE su monto con el tipo de cambio del plan. El cliente paga el mismo valor en otra
   * moneda, no un monto distinto, así que el porcentaje sigue significando lo que dice y el
   * plan sigue repartiendo el 100% del honorario.
   *
   * No se guarda directo: queda en el estado de la página y viaja con el "Guardar" del plan,
   * igual que el porcentaje y las fechas acordadas. Son todas partes del mismo contrato.
   */
  const handleInstallmentCurrencyChange = (idx: number, next: "BOB" | "USD" | "USDT") => {
    onInstallmentsChange(
      installments.map((inst, i) => {
        if (i !== idx) return inst;
        // NULL = la moneda de la OT, que es el caso normal y lo que la base espera.
        const value = next === currency ? null : next;
        const updated = { ...inst, currency: value as PaymentInstallmentInput["currency"] };
        return { ...updated, amount: amountFor(updated) };
      }),
    );
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
        return { ...inst, percentage: pct, amount: amountFor(inst, pct) };
      }),
    );
  };

  // ----- Formatting -----

  // Cobranzas Fase 6 (decisión Q29): una cuota puede ir en otra moneda que la OT. NULL = la de
  // la OT, que es el caso normal.

  const formatAmount = (amount: number, amountCurrency: string = currency) => {
    const amountLocale = amountCurrency === "BOB" ? "es-BO" : "en-US";
    return Number(amount).toLocaleString(amountLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  // Totales POR MONEDA. Nunca se suman montos nativos de monedas distintas: un total que mezcla
  // Bs y USD no significa nada. Si todas las cuotas van en la moneda de la OT —el caso normal—
  // esto da un solo subtotal y se ve igual que antes.
  const totalsByCurrency = installments.reduce<Record<string, number>>((acc, i) => {
    const cur = installmentCurrency(i);
    const amount = isLocked(i) ? (i.amount ?? 0) : amountFor(i);
    acc[cur] = (acc[cur] ?? 0) + amount;
    return acc;
  }, {});

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
          {/* Cobranzas Fase 2 (Q19): la OT todavía no está aprobada, así que las acciones de
              cobranza están apagadas. Se dice por qué en vez de dejar los controles muertos. */}
          {collectionsApprovalStatus && collectionsApprovalStatus !== "Approved" && (
            <Alert className="py-2 px-3 w-auto border-info/50 bg-info/10 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-info shrink-0" />
              <AlertDescription className="text-info text-sm">
                {t("workOrders.paymentPlan.collectionsNotApprovedBanner", {
                  status: t(`workOrders.paymentPlan.approvalStatus${collectionsApprovalStatus}`),
                })}
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
              <Label>
                {t("workOrders.paymentPlan.exchangeRate")}
                {/* dash_socio (decisiones.md §4.1): campo requerido en cuanto existe
                    al menos una cuota -- espejo visual del NOT NULL/CHECK de
                    wo_payment_plan.exchange_rate. */}
                {installments.length > 0 && (
                  <span className="text-destructive ml-1" aria-hidden>*</span>
                )}
              </Label>
              <NumericInput
                decimals={6}
                locale={numericLocale}
                min={0}
                // Decision del operador 2026-10-20: el campo arranca con el TC de hoy a la
                // vista y editable, no con un 0 y la cotizacion abajo como texto -- un 0 no es
                // un tipo de cambio valido, y obligaba a copiar a mano un numero que la pagina
                // ya tenia. Es solo lo que se MUESTRA: el valor no se escribe en el plan hasta
                // que el usuario toca algo, para que abrir la pestana no deje la pagina
                // "sin guardar" sin haber hecho nada. En cuanto hay una cuota, el efecto de
                // autocompletado de mas arriba lo persiste.
                value={rateInputBlank ? "" : (currentPlan.exchange_rate ?? latestBuyRate ?? 0)}
                onChange={handleExchangeRateChange}
                onBlur={() => setRateInputBlank(false)}
                disabled={!isEditable || planLocked || !canEditPaymentPlan}
                className="w-full"
                data-testid="payment-plan-exchange-rate"
              />
              {latestBuyRate != null && (
                <p className="text-xs text-muted-foreground">
                  {t("workOrders.paymentPlan.currentBuyRateReference", { value: formatRate(latestBuyRate) })}
                </p>
              )}
              {currentPlan.exchange_rate == null && installments.length > 0 && (
                <p className="text-xs text-destructive">
                  {t("workOrders.paymentPlan.exchangeRateRequiredHint")}
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
                  disabled={!isEditable || planLocked || !canEditPaymentPlan}
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
                  disabled={!isEditable || planLocked || !canEditPaymentPlan}
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
              disabled={!isEditable || !canEditPaymentPlan}
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
                disabled={!isEditable || !canEditPaymentPlan || numInstallments <= 0}
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
                disabled={!isEditable || !canEditPaymentPlan || numInstallments >= 24}
                data-testid="payment-plan-installments-plus"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Cobranzas Fase 5: a quién se le cobra. Es lo primero que Cobranzas necesita y
            antes había que salir del plan a buscarlo en la ficha del cliente. */}
        {clientContacts && clientContacts.length > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/10 p-3">
            <div className="mb-2 text-sm font-medium">{t("workOrders.paymentPlan.contactsTitle")}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {clientContacts.map((c) => (
                <div key={c.contact_id} className="text-sm">
                  <div className="text-xs text-muted-foreground">
                    {c.contact_type === "cobranza"
                      ? t("workOrders.paymentPlan.contactCobranza")
                      : t("workOrders.paymentPlan.contactGeneral")}
                  </div>
                  <div className="font-medium">{c.full_name}</div>
                  {c.email && <div className="font-mono text-xs">{c.email}</div>}
                  {c.phone && <div className="font-mono text-xs">{c.phone}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cobranzas Fase 4 (issue #352): notas del PLAN entero. Van arriba y siempre
            visibles — son las que hablan del encargo, no de una cuota ("este cliente paga
            siempre a 60 días"), y el operador pidió que fueran notorias (Q34). */}
        {(planNotes.length > 0 || canWriteNotes) && (
          <div data-testid="plan-notes" className="rounded-md border border-border/60 bg-muted/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              {t("workOrders.paymentPlan.notesPlanTitle")}
              {/* El conteo acá y el de cada fila hacen visible que son DOS lugares distintos.
                  Sin esto, este bloque decía "Sin notas" mientras una cuota mostraba "2 notas",
                  y quien escribía acá creía estar escribiendo en la cuota. */}
              {planNotes.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {planNotes.length}
                </span>
              )}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              {t("workOrders.paymentPlan.notesPlanHelp")}
            </p>
            <InstallmentNotesThread
              woId={woId}
              installmentId={null}
              notes={planNotes}
              currentStaffId={currentStaffId}
              canWrite={canWriteNotes}
              isAdmin={isAdminViewer}
            />
          </div>
        )}

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
                    {/* Ya no dice "(USD)" fijo: con una cuota en otra moneda, el encabezado
                        estaria mintiendo sobre media columna. La moneda va por fila. */}
                    {t("workOrders.paymentPlan.amount")}
                  </th>
                  {/* Cobranzas Fase 6 (decisión Q29): la cuota puede cobrarse en Bs aunque la
                      OT sea en otra moneda. Solo tiene sentido ofrecerlo cuando hay dos
                      monedas en juego; en una OT en Bs no hay nada que elegir, y una OT en
                      USDT no mezcla. */}
                  {currency !== "BOB" && currency !== "USDT" && (
                    <th rowSpan={2} className="text-left py-3 px-3 font-medium w-24 align-bottom border-b">
                      {t("workOrders.paymentPlan.expenseRowsCurrency")}
                    </th>
                  )}
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
                  const instAmount = isLocked(inst) ? inst.amount : amountFor(inst);
                  // isAdminDateEditable es un bypass aparte (admin corrigiendo fuera de
                  // Draft) -- no lo toca la decision 2026-09-10, que solo restringe
                  // QUIEN puede editar el tramo normal (isEditable) del plan.
                  const dateEditable = (isEditable && canEditPaymentPlan) || isAdminDateEditable;
                  // Etapa persistida (lo que decide qué transiciones existen) y condición
                  // de calendario (lo que decide qué insignia se muestra), por separado.
                  const display = getInstallmentDisplay(inst);
                  const stage = display.stage;
                  const availableOptions = STATUS_TRANSITIONS[stage];
                  const rowNotes = notesForInstallment(notes, inst.installment_id);
                  const rowEvents = eventsForInstallment(events, inst.installment_id);
                  // Cobranzas Fase 9: los ajustes vigentes de esta fila, en SU moneda. Un
                  // descuento va en la moneda de la cuota; una diferencia de cambio va en Bs y
                  // por eso no entra en esta suma.
                  const rowAdjustmentRows = adjustmentsForInstallment(adjustments, inst.installment_id);
                  const rowAdjustments = adjustmentsTotal(
                    adjustments, inst.installment_id, installmentCurrency(inst),
                  );
                  const calendarBadge =
                    display.isOverdue && stage !== "Overdue"
                      ? {
                          label: t("workOrders.paymentPlan.statusOverdue"),
                          title: t("workOrders.paymentPlan.statusOverduePaymentTooltip", { date: fmtDate(currentDueDate(inst)) }),
                          className: "bg-destructive/15 text-destructive",
                        }
                      : display.calendar === "billing_late"
                        ? {
                            label: t("workOrders.paymentPlan.statusBillingLate"),
                            title: t("workOrders.paymentPlan.statusBillingLateTooltip", { date: fmtDate(currentInvoiceDate(inst)) }),
                            className: "bg-warning/15 text-warning",
                          }
                        : null;

                  return (
                    <tr key={inst.installment_id ?? inst.installment_number} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3 text-muted-foreground font-medium border-b border-border/50">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 border-b border-border/50 align-top">
                        <Input
                          type="date"
                          lang="es-BO"
                          value={inst.agreed_invoice_date ?? ""}
                          onChange={(e) => handleInvoiceDateChange(idx, e.target.value)}
                          disabled={!dateEditable}
                          className="h-8 text-sm"
                        />
                        {/* Cobranzas Fase 3 (issue #352). La fecha de arriba es la ACORDADA y
                            no se toca nunca: es el contrato. Lo que se mueve al reprogramar es
                            la fecha VIGENTE, que se muestra acá debajo junto con la gestión de
                            la confirmación con el cliente. */}
                        {inst.current_invoice_date && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium">{t("workOrders.paymentPlan.currentInvoiceDateLabel")}</span>{" "}
                            <span className="font-mono">{fmtDate(inst.current_invoice_date)}</span>
                          </div>
                        )}
                        {canManageSchedule && stage === "Pending" && inst.installment_id && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {/* El check sólo aparece cuando la fecha está encima (≤7 días) o
                                ya pasó: antes de eso preguntarle al cliente no tiene sentido. */}
                            {(display.calendar === "billing_due_soon" || display.calendar === "billing_late") &&
                              inst.confirmation_status !== "confirmada" && (
                                <>
                                  <span className="text-xs text-muted-foreground">
                                    {t("workOrders.paymentPlan.confirmCheckLabel")}
                                  </span>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => handleConfirmClient(idx)}
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    {t("workOrders.paymentPlan.confirmYes")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => openScheduleDialog(idx, "notConfirmed")}
                                  >
                                    <X className="h-3 w-3 mr-1" />
                                    {t("workOrders.paymentPlan.confirmNo")}
                                  </Button>
                                </>
                              )}
                            {inst.confirmation_status === "confirmada" && (
                              <>
                                <span
                                  title={t("workOrders.paymentPlan.confirmedTooltip", {
                                    date: fmtDate(inst.confirmed_for_date ?? null),
                                    by: "",
                                  })}
                                  className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  {t("workOrders.paymentPlan.confirmationConfirmed")}
                                </span>
                                {/* Una confirmación se puede dar vuelta: el cliente confirma y
                                    después llama para decir que no, y hasta acá eso no tenía
                                    salida por pantalla. Sirve también para el clic errado. No
                                    hay un "deshacer" a secas a propósito: cambiar un hecho ya
                                    registrado exige motivo y fecha nueva, que es justo lo que
                                    pide este camino. */}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => openScheduleDialog(idx, "notConfirmed")}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  {t("workOrders.paymentPlan.confirmNo")}
                                </Button>
                              </>
                            )}
                            {inst.confirmation_status === "no_confirmada" && (
                              // Dice "la fecha ANTERIOR" a propósito: este estado sólo existe
                              // justo después de una reprogramación, así que el chip habla de
                              // la fecha rechazada mientras los botones de al lado preguntan
                              // por la nueva. Sin esa palabra, las dos cosas se leían como si
                              // hablaran de la misma fecha. Cuál era queda en el historial:
                              // el RPC borra `confirmed_for_date` al rechazar.
                              <span
                                title={t("workOrders.paymentPlan.confirmationNotConfirmedTooltip")}
                                className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
                              >
                                {t("workOrders.paymentPlan.confirmationNotConfirmed")}
                              </span>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => openScheduleDialog(idx, "reschedule")}
                            >
                              <CalendarClock className="h-3 w-3 mr-1" />
                              {t("workOrders.paymentPlan.rescheduleAction")}
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground font-mono text-xs border-b border-border/50">
                        {fmtDate(inst.agreed_payment_date)}
                      </td>
                      <td className="py-3 px-3 border-b border-border/50">
                        <NumericInput
                          locale={numericLocale}
                          value={inst.percentage}
                          onChange={(val) => handlePercentageChange(idx, val)}
                          disabled={!isEditable || !canEditPaymentPlan}
                          min={0}
                          max={100}
                          className="w-full h-8"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono border-b border-border/50">
                        {formatAmount(instAmount, installmentCurrency(inst))}
                        {inst.currency && inst.currency !== currency && (
                          <span className="ml-1 text-xs text-muted-foreground">{inst.currency}</span>
                        )}
                        {/* Cobranzas Fase 9: el monto de arriba es el CONTRATO. Si hay ajustes
                            vigentes, debajo va lo que queda por cobrar — los dos números, porque
                            la diferencia entre ellos es justamente lo que hay que explicar. */}
                        {rowAdjustments !== 0 && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {t("workOrders.paymentPlan.adjustedToCollect", {
                              amount: formatAmount(instAmount + rowAdjustments, installmentCurrency(inst)),
                            })}
                          </div>
                        )}
                        {(canBillExpenses || rowAdjustmentRows.length > 0) && inst.installment_id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-0.5 h-6 px-2 text-xs font-normal"
                            onClick={() => openAdjustments(inst.installment_id!)}
                          >
                            <Percent className="mr-1 h-3 w-3" />
                            {rowAdjustmentRows.length > 0
                              ? t("workOrders.paymentPlan.adjustmentsCount", { count: rowAdjustmentRows.length })
                              : t("workOrders.paymentPlan.adjustmentsAdd")}
                          </Button>
                        )}
                      </td>
                      {currency !== "BOB" && currency !== "USDT" && (
                        <td className="py-3 px-3 border-b border-border/50">
                          {/* Una vez facturada, la moneda queda congelada junto con el monto y
                              el TC: cambiarla despues reescribiria lo que ya se le facturo al
                              cliente. El guard de la base aplica la misma regla. */}
                          {/* Con un ajuste vigente la moneda no se cambia: el descuento vive en
                              la moneda de cuando se cargó y dejaría de restar en silencio. El
                              servidor lo rechaza igual (INSTALLMENT_CURRENCY_HAS_ADJUSTMENTS);
                              acá se avisa antes. */}
                          {!isLocked(inst) && dateEditable &&
                            rowAdjustmentRows.some((a) => a.deleted_at === null) ? (
                            <span
                              className="font-mono text-xs text-muted-foreground"
                              title={t("workOrders.paymentPlan.currencyLockedByAdjustments")}
                            >
                              {installmentCurrency(inst)}
                            </span>
                          ) : !isLocked(inst) && dateEditable ? (
                            <Select
                              value={installmentCurrency(inst)}
                              onValueChange={(v) => handleInstallmentCurrencyChange(idx, v as "BOB" | "USD" | "USDT")}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={currency}>{currency}</SelectItem>
                                <SelectItem value="BOB">BOB</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">
                              {installmentCurrency(inst)}
                            </span>
                          )}
                        </td>
                      )}
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
                                    const value = pending?.invoice !== undefined ? pending.invoice : inst.invoice_exchange_rate;
                                    // MUST FIX review iteracion 12 #3: pendingRateEditsRef nunca se
                                    // limpiaba -- un blur sin edicion nueva (ej. foco+blur accidental)
                                    // sobre una fila cuyo prop se refresco con un valor mas reciente
                                    // (otra pestana ya guardo uno distinto) volvia a leer el valor
                                    // viejo del ref y lo repersistia, pisando el mas nuevo en
                                    // silencio. Se borra la entrada apenas se lee, para que un blur
                                    // posterior sin edicion caiga al valor fresco de inst.*.
                                    if (pending) delete pending.invoice;
                                    updateInstallmentExchangeRate.mutate({
                                      installmentId: inst.installment_id,
                                      field: "invoice_exchange_rate",
                                      value,
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
                                    const value = pending?.payment !== undefined ? pending.payment : inst.payment_exchange_rate;
                                    // MUST FIX review iteracion 12 #3: ver el mismo fix en el onBlur
                                    // del TC de facturacion, arriba.
                                    if (pending) delete pending.payment;
                                    updateInstallmentExchangeRate.mutate({
                                      installmentId: inst.installment_id,
                                      field: "payment_exchange_rate",
                                      value,
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
                      {/* Reportado 2026-09-09 como bug ("sigue editable en Completado") y
                         corregido con !isLocked(inst) -- REVERTIDO el mismo dia tras
                         verificar que esto es intencional, no un descuido: preexistente a
                         0722-156b (commit 0253f93e, "agregar la funcionalidad de
                         actualizacion de la fecha de cobro", 2026-06-29), con su propio
                         dialogo de CORRECCION (no de captura -- ver el Dialog de
                         pendingCollectionDate mas abajo, "admin direct-save") y su propia
                         mutacion dedicada (useUpdateCollectionDate). A diferencia de
                         percentage/amount/installment_number/TC (congelados desde la
                         Iteracion 2), el trigger de la base de datos NUNCA bloquea
                         collection_invoice_date/collection_payment_date por status --
                         confirmado leyendo wo_payment_installments_guard_exchange_rate
                         completo. Es decir, la base de datos permite a proposito corregir
                         esta fecha en cualquier momento (la fecha registrada al marcar
                         "Facturado" es cuando alguien toco el boton, no necesariamente la
                         fecha real de emision de Contabilidad) -- decision confirmada por
                         el operador de mantener este comportamiento tal como estaba. */}
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
                        <div className="flex flex-wrap items-center gap-1.5">
                        {isStatusEditable && availableOptions.length > 0 ? (
                          <Select
                            value={stage}
                            onValueChange={(val) => {
                              const s = val as PaymentInstallmentStatus;
                              if (isPaymentPlanDirty && inst.installment_id) {
                                toast.error(t("workOrders.paymentPlan.validationSavePlanFirst"));
                                return;
                              }
                              if (s === "Invoiced" || s === "Completed" || s === "Overdue") {
                                if (s === "Invoiced") {
                                  // El modo decide el VALOR POR DEFECTO, no si se puede tocar:
                                  // fijo trae el TC del plan, variable el del día (Q49).
                                  setInvoiceRate(
                                    currentPlan.exchange_rate_mode === "fijo"
                                      ? currentPlan.exchange_rate
                                      : latestBuyRate ?? currentPlan.exchange_rate,
                                  );
                                  setInvoiceRateDate("");
                                }
                                if (s === "Completed") {
                                  // Al cobrar, el TC por defecto es el del día: es el día en
                                  // que el dinero entró. Lo que ya tenga la cuota se respeta
                                  // si alguien lo capturó antes desde la columna.
                                  setInvoiceRate(inst.payment_exchange_rate ?? latestBuyRate ?? currentPlan.exchange_rate);
                                  setInvoiceRateDate("");
                                }
                                setPendingChange({ row: inst, newStatus: s });
                              } else {
                                handleStatusChange(inst, s);
                              }
                            }}
                          >
                            <SelectTrigger className={cn("h-8 text-sm", STATUS_COLORS[stage])}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Current state shown as disabled so SelectValue has text to display */}
                              <SelectItem value={stage} disabled className={cn("opacity-50", STATUS_COLORS[stage])}>
                                {t(`workOrders.paymentPlan.status${stage}`)}
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
                          // Solo lectura: UN chip principal (decisión del operador Q2,
                          // priorizar la claridad). Si hay mora dice "En mora" venga de
                          // donde venga, y el tooltip aclara si fue a mano o por fecha.
                          <span
                            title={
                              display.overdueKind === "manual"
                                ? t("workOrders.paymentPlan.statusOverdueManualTooltip")
                                : display.overdueKind === "payment"
                                  ? t("workOrders.paymentPlan.statusOverduePaymentTooltip", { date: fmtDate(currentDueDate(inst)) })
                                  : undefined
                            }
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              display.isOverdue ? STATUS_CHIP_CLASSES.Overdue : STATUS_CHIP_CLASSES[stage],
                            )}
                          >
                            {display.isOverdue
                              ? t("workOrders.paymentPlan.statusOverdue")
                              : t(`workOrders.paymentPlan.status${stage}`)}
                          </span>
                        )}
                        {/* La condición de calendario que la etapa no muestra: "facturación
                            atrasada" (todavía sin facturar) o "en mora" junto al selector. */}
                        {calendarBadge && (!display.isOverdue || isStatusEditable) && (
                          <span
                            title={calendarBadge.title}
                            className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", calendarBadge.className)}
                          >
                            {calendarBadge.label}
                          </span>
                        )}
                        {/* Cobranzas Fase 4: contador de notas de la fila. En color de
                            advertencia y no neutro porque el operador pidió que fueran
                            NOTORIAS (Q34): sin acuse de lectura, lo único que empuja a abrirlas
                            es que se vean. */}
                        {(rowNotes.length > 0 || canWriteNotes) && inst.installment_id && (
                          <button
                            type="button"
                            onClick={() => setNotesDialog({ idx })}
                            aria-label={t("workOrders.paymentPlan.notesDialogTitle", { number: idx + 1 })}
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              rowNotes.length > 0
                                ? "bg-warning/15 text-warning"
                                : "bg-muted/60 text-muted-foreground",
                            )}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" />
                            {rowNotes.length > 0
                              ? t("workOrders.paymentPlan.notesCount", { count: rowNotes.length })
                              : t("workOrders.paymentPlan.notesAdd")}
                          </button>
                        )}
                        {/* La bitácora. Se escribe sola desde la Fase 1 y nadie la puede
                            editar, pero hasta ahora no se veía en ninguna pantalla: el rastro
                            existía sólo en la base. Sin esto, cambiar un hecho ya registrado
                            —desconfirmar, reprogramar, corregir una fecha de cobro— no dejaba
                            nada visible, y es lo que hace que esos cambios sean defendibles. */}
                        {rowEvents.length > 0 && inst.installment_id && (
                          <button
                            type="button"
                            onClick={() => setHistoryDialog({ idx })}
                            className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                          >
                            <History className="mr-1 h-3 w-3" />
                            {t("workOrders.paymentPlan.historyCount", { count: rowEvents.length })}
                          </button>
                        )}
                        </div>
                      </td>
                      <td className="py-3 px-1 border-b border-border/50">
                        {isEditable && canEditPaymentPlan && installments.length > 1 && !isLocked(inst) && (
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
                    {/* Cobranzas Fase 6: con cuotas en monedas distintas (decisión Q29), un
                        total único no significaría nada — se muestra un subtotal POR MONEDA.
                        Con todas las cuotas en la moneda de la OT, que es el caso normal, hay
                        un solo subtotal y se ve igual que antes. */}
                    {Object.keys(totalsByCurrency).length > 1 ? (
                      <div className="space-y-0.5" data-testid="totals-by-currency">
                        {Object.entries(totalsByCurrency).map(([cur, amount]) => (
                          <div key={cur}>
                            {formatAmount(amount, cur)}{" "}
                            <span className="text-xs text-muted-foreground">{cur}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      formatAmount(totalAmount)
                    )}
                  </td>
                  <td colSpan={currency !== "BOB" && currency !== "USDT" ? 7 : currency !== "BOB" ? 6 : 4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Cobranzas Fase 7: los gastos ejecutados que se le cobran al cliente ──────────
            Van en su propio bloque, no entre las cuotas, porque no son parte del mismo trato:
            las cuotas reparten el honorario pactado antes de empezar, y esto es lo que se
            gastó haciendo el trabajo. Mezclarlos haría que el total de la tabla dejara de
            cuadrar con el 100% del honorario. */}
        {(canBillExpenses || expenseRows.length > 0) && (
          <div className="mt-6 rounded-lg border border-border/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">
                  {t("workOrders.paymentPlan.expenseRowsTitle")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("workOrders.paymentPlan.expenseRowsHelp")}
                </p>
              </div>
              {canBillExpenses && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendingBillable <= 0 || createExpenseRow.isPending}
                  onClick={() => createExpenseRow.mutate({ woId })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {pendingBillable > 0
                    ? t("workOrders.paymentPlan.expenseRowsBill", {
                        amount: formatAmount(pendingBillable, "BOB"),
                      })
                    : t("workOrders.paymentPlan.expenseRowsNothingToBill")}
                </Button>
              )}
            </div>

            {expenseRows.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("workOrders.paymentPlan.expenseRowsEmpty")}
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 px-3 text-left">{t("workOrders.paymentPlan.expenseRowsSpent")}</th>
                      <th className="py-2 px-3 text-left">{t("workOrders.paymentPlan.expenseRowsBilledAmount")}</th>
                      <th className="py-2 px-3 text-left">{t("workOrders.paymentPlan.expenseRowsCurrency")}</th>
                      <th className="py-2 px-3 text-left">{t("workOrders.paymentPlan.collectionInvoiceDate")}</th>
                      <th className="py-2 px-3 text-left">{t("workOrders.paymentPlan.collectionPaymentDate")}</th>
                      <th className="py-2 px-3 text-left">{t("workOrders.paymentPlan.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseRows.map((row) => {
                      const display = getInstallmentDisplay(row);
                      const stage = display.stage;
                      const availableOptions = STATUS_TRANSITIONS[stage];
                      // El monto sólo se corrige mientras la fila no se facturó: después, lo
                      // que el cliente recibió ya está emitido.
                      const amountEditable = canBillExpenses && row.status === "Pending";
                      return (
                        <tr key={row.installment_id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground border-b border-border/50">
                            {formatAmount(row.net_amount ?? 0, "BOB")} <span className="text-[10px]">BOB</span>
                          </td>
                          <td className="py-2 px-3 border-b border-border/50">
                            {amountEditable ? (
                              <NumericInput
                                locale={numericLocale}
                                value={
                                  expenseAmountDraft?.id === row.installment_id
                                    ? expenseAmountDraft.value
                                    : row.amount ?? 0
                                }
                                decimals={2}
                                min={0}
                                className="h-8 w-32 text-sm"
                                onChange={(v) =>
                                  setExpenseAmountDraft({ id: row.installment_id!, value: v })
                                }
                                onBlur={() => {
                                  const draft = expenseAmountDraft;
                                  setExpenseAmountDraft(null);
                                  // Se manda sólo si de verdad cambió: así salir del campo sin
                                  // tocar nada no genera un aviso al gerente por un cambio que
                                  // no hubo.
                                  if (!draft || draft.id !== row.installment_id) return;
                                  if (draft.value <= 0 || draft.value === (row.amount ?? 0)) return;
                                  setExpenseAmount.mutate({
                                    installmentId: row.installment_id!,
                                    amount: draft.value,
                                    woId,
                                  });
                                }}
                              />
                            ) : (
                              <span className="font-mono text-xs">
                                {formatAmount(row.amount ?? 0, row.currency ?? "BOB")}
                              </span>
                            )}
                            {/* Cuánto de ese monto es impuesto. Sin esto, "gastado 500 / a
                                facturar 574,71" se lee como si se le estuviera cobrando de más
                                al cliente; con el IVA a la vista se entiende que la firma
                                termina recuperando exactamente lo que gastó. */}
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {t("workOrders.paymentPlan.expenseRowsVat", {
                                rate: (taxRate * 100).toFixed(0),
                                amount: formatAmount((row.amount ?? 0) * taxRate, row.currency ?? "BOB"),
                              })}
                            </p>
                          </td>
                          <td className="py-2 px-3 border-b border-border/50">
                            {/* Decisión del operador 2026-10-20: la fila nace en Bs, que es la
                                moneda en la que los gastos se rinden, pero se puede cobrar en
                                otra. Al facturarla, el diálogo de la Fase 6 ya deja elegir el TC
                                por fecha. Después de facturar la moneda queda congelada junto
                                con el monto. USDT no se mezcla: sólo en una OT en USDT. */}
                            {amountEditable ? (
                              <Select
                                value={row.currency ?? "BOB"}
                                onValueChange={(v) => {
                                  const from = row.currency ?? "BOB";
                                  if (!row.installment_id || v === from) return;
                                  // Se convierte con el TC del plan, igual que una cuota de
                                  // honorarios: el cliente paga el mismo valor en otra moneda.
                                  const converted = convertAmount(row.amount ?? 0, from, v, currentPlan.exchange_rate);
                                  if (converted === null) {
                                    toast.error(t("workOrders.paymentPlan.errorCurrencyNoRate"));
                                    return;
                                  }
                                  setInstallmentCurrency.mutate({
                                    installmentId: row.installment_id,
                                    currency: v as "BOB" | "USD" | "USDT",
                                    amount: converted,
                                    woId,
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="BOB">BOB</SelectItem>
                                  {currency === "USDT" ? (
                                    <SelectItem value="USDT">USDT</SelectItem>
                                  ) : (
                                    <SelectItem value="USD">USD</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="font-mono text-xs">{row.currency ?? "BOB"}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground border-b border-border/50">
                            {fmtDate(row.collection_invoice_date)}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground border-b border-border/50">
                            {fmtDate(row.collection_payment_date)}
                          </td>
                          <td className="py-2 px-3 border-b border-border/50">
                            {isStatusEditable && availableOptions.length > 0 ? (
                              <Select
                                value={stage}
                                onValueChange={(val) => {
                                  const s = val as PaymentInstallmentStatus;
                                  if (s === "Invoiced" || s === "Completed" || s === "Overdue") {
                                    // Se reinicia al facturar Y al cobrar: el estado del TC es
                                    // compartido con el diálogo de las cuotas, y sin esto una
                                    // fila de gastos heredaba el último TC que alguien tecleó.
                                    // En Bs no hay TC; si la fila se pasó a otra moneda, arranca
                                    // con el del día, igual que una cuota.
                                    setInvoiceRate(
                                      (row.currency ?? "BOB") === "BOB"
                                        ? null
                                        : latestBuyRate ?? currentPlan.exchange_rate,
                                    );
                                    setInvoiceRateDate("");
                                    setPendingChange({ row, newStatus: s });
                                  } else {
                                    handleStatusChange(row, s);
                                  }
                                }}
                              >
                                <SelectTrigger className={cn("h-8 w-36 text-sm", STATUS_COLORS[stage])}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={stage} disabled className={cn("opacity-50", STATUS_COLORS[stage])}>
                                    {t(`workOrders.paymentPlan.status${stage}`)}
                                  </SelectItem>
                                  {availableOptions.map((val) => (
                                    <SelectItem key={val} value={val} className={STATUS_COLORS[val]}>
                                      {t(`workOrders.paymentPlan.status${val}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                  STATUS_CHIP_CLASSES[stage],
                                )}
                              >
                                {t(`workOrders.paymentPlan.status${stage}`)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Confirmation dialog for status changes that record a date */}
    {/* Cobranzas Fase 4: al facturar o al cobrar es cuando las notas pesan (decisión Q6), así
        que el diálogo las muestra. No se marcan como leídas (Q34): se muestran y ya. */}
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
              {pendingChange?.newStatus === "Invoiced" && t("workOrders.paymentPlan.confirmInvoicedDesc", { date: fmtDate(today) })}
              {pendingChange?.newStatus === "Completed" && t("workOrders.paymentPlan.confirmCompletedDesc", { date: fmtDate(today) })}
              {pendingChange?.newStatus === "Overdue" && t("workOrders.paymentPlan.confirmOverdueDesc")}
            </span>
            {pendingChange?.newStatus !== "Overdue" && (
              <span className="block text-destructive/80 text-xs font-medium">
                {t("workOrders.paymentPlan.confirmIrreversible")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Las notas de la cuota, acá y no en un enlace: es el momento en que pesan. */}
        {pendingChange && notesForInstallment(notes, pendingChange.row.installment_id).length > 0 && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" />
              {t("workOrders.paymentPlan.notesOnInvoiceWarning")}
            </div>
            <InstallmentNotesThread
              woId={woId}
              installmentId={pendingChange.row.installment_id ?? null}
              notes={notesForInstallment(notes, pendingChange.row.installment_id)}
              currentStaffId={currentStaffId}
              canWrite={false}
              isAdmin={isAdminViewer}
            />
          </div>
        )}
        {/* Cobranzas Fase 6 (decisión Q49): el TC con el que se factura. Se autocompleta según
            el modo del plan y se puede corregir — a mano, o eligiendo una fecha y trayendo el
            TC de ese día. Sólo aparece cuando hay conversión que hacer.
            2026-10-21: el mismo bloque sale al COBRAR. Antes el TC de pago era una columna
            suelta que había que acordarse de editar ANTES de cambiar el estado, y si se
            olvidaba quedaba congelado — isPaymentRateCaptureEditable sólo lo deja tocar
            mientras la cuota sigue Facturada o En mora—, con la diferencia de cambio de la
            Fase 9 calculada sobre un número viejo. Misma decisión, mismo gesto. */}
        {(pendingChange?.newStatus === "Invoiced" || pendingChange?.newStatus === "Completed") &&
          installmentCurrency(pendingChange.row) !== "BOB" && (
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
              <Label className="text-xs">
                {pendingChange.newStatus === "Invoiced"
                  ? t("workOrders.paymentPlan.invoiceExchangeRate")
                  : t("workOrders.paymentPlan.paymentExchangeRate")}
              </Label>
              <div className="flex flex-wrap items-end gap-2">
                <NumericInput
                  locale={numericLocale}
                  value={invoiceRate ?? 0}
                  onChange={(v) => {
                    setInvoiceRate(v);
                    // Tecleado a mano: deja de venir de una fecha.
                    setInvoiceRateDate("");
                  }}
                  decimals={6}
                  min={0}
                  className="h-8 w-32"
                  data-testid="invoice-rate-input"
                />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("workOrders.paymentPlan.invoiceRateFromDate")}
                  </span>
                  <Input
                    type="date"
                    lang="es-BO"
                    className="h-8 w-40 text-sm"
                    value={invoiceRateDate}
                    max={today}
                    onChange={async (e) => {
                      const d = e.target.value;
                      setInvoiceRateDate(d);
                      if (!d) return;
                      const rate = await fetchRateOn(d);
                      // Sin cotización para esa fecha ni ninguna anterior: se deja lo que haya
                      // y la persona lo carga a mano, en vez de pisarlo con un cero.
                      if (rate != null) setInvoiceRate(rate);
                      else toast.error(t("workOrders.paymentPlan.invoiceRateNotFound"));
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingChange(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={pendingChange?.newStatus === "Overdue" ? "destructive" : "default"}
            onClick={() => {
              if (pendingChange) {
                handleStatusChange(pendingChange.row, pendingChange.newStatus, {
                  invoiceRate,
                  invoiceRateDate: invoiceRateDate || null,
                });
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

    {/* Cobranzas Fase 3 (issue #352): reprogramar, y el caso "el cliente no confirma", que es
        el mismo formulario más el registro de que dijo que no. Un solo diálogo porque el
        operador pidió que fuera un solo paso (Q11): nota y fecha nueva juntas. */}
    <Dialog open={!!scheduleDialog} onOpenChange={(open) => { if (!open) setScheduleDialog(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {scheduleDialog?.mode === "notConfirmed"
              ? t("workOrders.paymentPlan.notConfirmedTitle")
              : t("workOrders.paymentPlan.rescheduleTitle")}
          </DialogTitle>
          <DialogDescription>
            {scheduleDialog?.mode === "notConfirmed"
              ? t("workOrders.paymentPlan.notConfirmedDesc")
              : t("workOrders.paymentPlan.rescheduleDesc", {
                  agreed: fmtDate(
                    scheduleDialog ? installments[scheduleDialog.idx]?.agreed_invoice_date ?? null : null,
                  ),
                })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-date">{t("workOrders.paymentPlan.rescheduleNewDate")}</Label>
            <Input
              id="reschedule-date"
              type="date"
              lang="es-BO"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-reason">{t("workOrders.paymentPlan.rescheduleReason")}</Label>
            <Textarea
              id="reschedule-reason"
              value={scheduleReason}
              onChange={(e) => setScheduleReason(e.target.value)}
              placeholder={t("workOrders.paymentPlan.rescheduleReasonPlaceholder")}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="cancel" onClick={() => setScheduleDialog(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            /* Motivo y fecha son obligatorios: sin ellos la cuota quedaría marcada como
               problemática sin decir qué pasa ni para cuándo, que es justo el vacío que
               describe el issue. El servidor los exige igual. */
            disabled={!scheduleDate || !scheduleReason.trim()}
            onClick={handleScheduleSubmit}
          >
            {t("workOrders.paymentPlan.rescheduleAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Cobranzas Fase 4: el hilo de UNA cuota. Se abre desde el contador de la fila. */}
    <Dialog open={!!notesDialog} onOpenChange={(open) => { if (!open) setNotesDialog(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("workOrders.paymentPlan.notesDialogTitle", { number: (notesDialog?.idx ?? 0) + 1 })}
          </DialogTitle>
          <DialogDescription>{t("workOrders.paymentPlan.notesTitle")}</DialogDescription>
        </DialogHeader>
        {notesDialog && (
          <InstallmentNotesThread
            woId={woId}
            installmentId={installments[notesDialog.idx]?.installment_id ?? null}
            notes={notesForInstallment(notes, installments[notesDialog.idx]?.installment_id)}
            currentStaffId={currentStaffId}
            canWrite={canWriteNotes}
            isAdmin={isAdminViewer}
          />
        )}
        <DialogFooter>
          <Button variant="cancel" onClick={() => setNotesDialog(null)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Cobranzas Fase 9: los ajustes de una cuota.
        Un ajuste no pisa el monto: se lista aparte, y lo que queda por cobrar es el monto más
        la suma de los vigentes. Los retirados se muestran tachados, porque un descuento que
        estuvo vigente explica por qué la cuota cambió de monto a cobrar entre dos momentos. */}
    <Dialog
      open={!!adjustmentsDialog}
      onOpenChange={(open) => { if (!open) closeAdjustments(); }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("workOrders.paymentPlan.adjustmentsTitle")}</DialogTitle>
          <DialogDescription>{t("workOrders.paymentPlan.adjustmentsDesc")}</DialogDescription>
        </DialogHeader>

        {dialogAdjustments.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-border/60 p-3">
            {dialogAdjustments.map((adj) => (
              <div
                key={adj.adjustment_id}
                className={cn(
                  "flex items-start justify-between gap-2 text-sm",
                  adj.deleted_at && "text-muted-foreground line-through",
                )}
              >
                <div className="min-w-0">
                  <span className="font-medium">
                    {t(`workOrders.paymentPlan.adjustmentType_${adj.adjustment_type}`)}
                  </span>
                  <span className="ml-2 font-mono">
                    {adj.currency} {formatAmount(adj.amount, adj.currency)}
                  </span>
                  <p className="truncate text-xs">{adj.reason}</p>
                </div>
                {!adj.deleted_at && canBillExpenses && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={() =>
                      deleteAdjustment.mutate({ adjustmentId: adj.adjustment_id, woId })
                    }
                  >
                    {t("workOrders.paymentPlan.adjustmentRemove")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {canBillExpenses && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("workOrders.paymentPlan.adjustmentTypeLabel")}</Label>
              <Select
                value={adjustmentType}
                onValueChange={(v) => {
                  const next = v as "descuento" | "diferencia_cambio";
                  setAdjustmentType(next);
                  // La diferencia de cambio se sugiere sola: el sistema ya guarda los dos TC,
                  // así que hacer la cuenta a mano sería pedirle a alguien que repita algo que
                  // la base ya sabe. Confirmarla sigue siendo una decisión.
                  if (next === "diferencia_cambio" && adjustmentsDialog) {
                    void fetchSuggestedExchangeDifference(adjustmentsDialog.installmentId).then((value) => {
                      setSuggestedDifference(value);
                      if (value !== null) setAdjustmentAmount(value);
                    });
                  } else {
                    setSuggestedDifference(null);
                    setAdjustmentAmount(0);
                  }
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="descuento">
                    {t("workOrders.paymentPlan.adjustmentType_descuento")}
                  </SelectItem>
                  <SelectItem value="diferencia_cambio">
                    {t("workOrders.paymentPlan.adjustmentType_diferencia_cambio")}
                  </SelectItem>
                </SelectContent>
              </Select>
              {/* Qué es cada tipo, dicho donde se elige. "Ajuste" no le dice nada a nadie, y
                  los dos tipos no son variantes de lo mismo: uno es una decisión comercial y
                  el otro es un hecho contable que ya ocurrió. */}
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`workOrders.paymentPlan.adjustmentTypeHint_${adjustmentType}`)}
              </p>
            </div>

            <div>
              <Label className="text-xs">
                {adjustmentType === "descuento"
                  ? t("workOrders.paymentPlan.adjustmentDiscountAmount")
                  : t("workOrders.paymentPlan.adjustmentDifferenceAmount")}
              </Label>
              <NumericInput
                locale={numericLocale}
                decimals={2}
                value={adjustmentAmount}
                onChange={setAdjustmentAmount}
                className="h-9"
              />
              {adjustmentType === "diferencia_cambio" && suggestedDifference !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("workOrders.paymentPlan.adjustmentSuggested", {
                    amount: formatAmount(suggestedDifference, "BOB"),
                  })}
                </p>
              )}
              {adjustmentType === "descuento" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("workOrders.paymentPlan.adjustmentDiscountHint")}
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">{t("workOrders.paymentPlan.adjustmentReason")}</Label>
              <Textarea
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                rows={2}
                placeholder={t("workOrders.paymentPlan.adjustmentReasonPlaceholder")}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeAdjustments}>
            {t("common.close")}
          </Button>
          {canBillExpenses && (
            <Button
              type="button"
              disabled={
                !adjustmentReason.trim() ||
                adjustmentAmount === 0 ||
                addAdjustment.isPending
              }
              onClick={() => {
                if (!adjustmentsDialog) return;
                addAdjustment.mutate(
                  {
                    installmentId: adjustmentsDialog.installmentId,
                    type: adjustmentType,
                    // Un descuento SIEMPRE resta: el signo lo fija el tipo, no quien carga, así
                    // que la pantalla pide el monto en positivo y lo manda negativo.
                    amount: adjustmentType === "descuento"
                      ? -Math.abs(adjustmentAmount)
                      : adjustmentAmount,
                    reason: adjustmentReason.trim(),
                    woId,
                  },
                  // Queda listo para cargar otro sobre la misma cuota, en blanco.
                  { onSuccess: resetAdjustmentForm },
                );
              }}
            >
              {t("workOrders.paymentPlan.adjustmentAdd")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* La bitácora de una cuota. Es de SOLO lectura y no tiene acciones a propósito: su valor
        está en que nadie la pueda tocar, ni siquiera quien la generó. */}
    <Dialog open={!!historyDialog} onOpenChange={(open) => { if (!open) setHistoryDialog(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("workOrders.paymentPlan.historyTitle", { number: (historyDialog?.idx ?? 0) + 1 })}
          </DialogTitle>
          <DialogDescription>{t("workOrders.paymentPlan.historyDesc")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {historyEvents.map((ev) => (
            <div key={ev.event_id} className="rounded-md border border-border/60 p-2.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{describeEvent(ev)}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(ev.created_at).toLocaleString("es-BO", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
              {ev.reason && <p className="mt-1 text-xs text-muted-foreground">{ev.reason}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {[ev.actor?.first_name, ev.actor?.last_name].filter(Boolean).join(" ") ||
                  t("workOrders.paymentPlan.historyUnknownActor")}
              </p>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="cancel" onClick={() => setHistoryDialog(null)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </>
  );
}
