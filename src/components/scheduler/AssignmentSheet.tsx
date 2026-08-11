// Fase 5 — Sheet de detalle de un segmento en Scheduler L2 (bugs/scheduler/fase_5/plan_v2.md §4).
//
// Reutiliza el helper puro y el wrapper de la RPC compartidos con StaffAssignmentsCard. Las
// categorías llegan resueltas por props desde SchedulerL2 (una sola resolución service-scoped,
// sin queries globales repetidas). `Cmd/Ctrl+S` guarda; cerrar con cambios pendientes pide
// confirmación (discard); eliminar pide confirmación (destructivo, sin restauración).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type Category,
  type Engagement,
  type EngagementAssignmentRow,
  type StaffWithSkills,
} from "@/hooks/useEmsData";
import { useSaveEngagementAssignments, type AssignmentDraft } from "@/hooks/mutations";
import {
  ALLOCATION_PERCENT_MAX,
  findForeignCategoryKeys,
  findOutOfEngagementRangeKeys,
  findStaffSegmentOverlap,
  HOURS_PER_WEEK_MAX,
  rpcRowToDraft,
  validateAssignmentDrafts,
} from "@/lib/engagementAssignments";
import {
  rankCandidateForCategory,
  TIER_SORT_ORDER,
  type AggregatedRequirement,
  type ProficiencyLevel,
  type StaffCandidate,
} from "@/lib/staffingMatch";
import { MatchDot, TIER_DOT_CLASS } from "./MatchDot";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { cn } from "@/lib/utils";

const VALID_LEVELS = new Set<string>(["Beginner", "Intermediate", "Advanced"]);

function toCandidate(staff: StaffWithSkills): StaffCandidate {
  return {
    staff_id: staff.staff_id,
    category_id: staff.category_id,
    skills: (staff.staff_skills ?? [])
      .filter((ss) => VALID_LEVELS.has(ss.proficiency_level))
      .map((ss) => ({
        skill_id: ss.skill_id,
        level: ss.proficiency_level as ProficiencyLevel,
      })),
  };
}

const staffDisplayName = (s: { first_name: string; last_name: string }) =>
  `${s.first_name} ${s.last_name}`;

export interface AssignmentSheetProps {
  engagement: Engagement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fila persistida -> modo edición; null -> "+ Agregar staff" (I-6). */
  row: EngagementAssignmentRow | null;
  canWrite: boolean;
  requirements: AggregatedRequirement[];
  staffOptions: StaffWithSkills[];
  /** Categorías service-scoped del engagement, resueltas una vez por el padre (SchedulerL2). */
  categories: Category[];
  /** Snapshot COMPLETO de assignments (no la vista filtrada) — el diff/overlap se valida contra esto. */
  assignments: EngagementAssignmentRow[];
  onDirtyChange?: (dirty: boolean) => void;
  /** Se dispara tras un guardado/eliminación exitosos (el padre refresca L1/load keys). */
  onSaved?: () => void;
}

interface SheetDraftState {
  key: string;
  assignment_id?: string;
  staff_id: string;
  category_id: string;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  allocation_percent: number;
  notes: string;
}

function seedDraft(row: EngagementAssignmentRow | null, engagement: Engagement): SheetDraftState {
  if (row) {
    return {
      key: row.assignment_id,
      assignment_id: row.assignment_id,
      staff_id: row.staff_id,
      category_id: row.category_id,
      start_date: row.start_date,
      end_date: row.end_date,
      hours_per_week: Number(row.hours_per_week),
      allocation_percent: Number(row.allocation_percent),
      notes: row.notes ?? "",
    };
  }
  // I-6 prefill: fechas del engagement, 40 h, 100 %. `key` dobla como assignment_id de insert
  // idempotente (contrato Fase 5); status nunca se fija aquí.
  return {
    key: crypto.randomUUID(),
    staff_id: "",
    category_id: "",
    start_date: engagement.start_date ?? "",
    end_date: engagement.end_date ?? "",
    hours_per_week: 40,
    allocation_percent: 100,
    notes: "",
  };
}

function draftsEqual(a: SheetDraftState, b: SheetDraftState): boolean {
  return (
    a.staff_id === b.staff_id &&
    a.category_id === b.category_id &&
    a.start_date === b.start_date &&
    a.end_date === b.end_date &&
    Number(a.hours_per_week) === Number(b.hours_per_week) &&
    Number(a.allocation_percent) === Number(b.allocation_percent) &&
    (a.notes || "") === (b.notes || "")
  );
}

export function AssignmentSheet({
  engagement,
  open,
  onOpenChange,
  row,
  canWrite,
  requirements,
  staffOptions,
  categories,
  assignments,
  onDirtyChange,
  onSaved,
}: AssignmentSheetProps) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";
  const dateLocale = i18n.language?.startsWith("es") ? es : enUS;
  const { saveAssignments, isSaving } = useSaveEngagementAssignments();

  const [draft, setDraft] = useState<SheetDraftState>(() => seedDraft(row, engagement));
  const [baseline, setBaseline] = useState<SheetDraftState>(draft);
  const [errors, setErrors] = useState<{
    missing: boolean;
    dates: boolean;
    range: boolean;
    numbers: boolean;
    category: boolean;
    overlap: boolean;
  }>({
    missing: false,
    dates: false,
    range: false,
    numbers: false,
    category: false,
    overlap: false,
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seeded = seedDraft(row, engagement);
    setDraft(seeded);
    setBaseline(seeded);
    setErrors({ missing: false, dates: false, range: false, numbers: false, category: false, overlap: false });
    setDiscardConfirmOpen(false);
    setDeleteConfirmOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.assignment_id, engagement.engagement_id]);

  const dirty = open && !draftsEqual(draft, baseline);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && dirty && canWrite) {
      setDiscardConfirmOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const discardAndClose = () => {
    setDiscardConfirmOpen(false);
    setDraft(baseline);
    onOpenChange(false);
  };

  // I-6: solo staff activo y schedulable para una fila NUEVA (issue). Ordenado full -> partial ->
  // category_only -> none -> sin requisito, luego alfabético.
  const pickerOptions = useMemo(
    () =>
      staffOptions
        .filter((s) => s.is_schedulable !== false)
        .map((staff) => ({
          staff,
          pickerMatch: rankCandidateForCategory(toCandidate(staff), requirements, staff.category_id),
        }))
        .sort((a, b) => {
          const wa = a.pickerMatch ? TIER_SORT_ORDER[a.pickerMatch.tier] : 4;
          const wb = b.pickerMatch ? TIER_SORT_ORDER[b.pickerMatch.tier] : 4;
          if (wa !== wb) return wa - wb;
          return staffDisplayName(a.staff).localeCompare(staffDisplayName(b.staff));
        }),
    [staffOptions, requirements]
  );

  // Categorías service-scoped, ya resueltas por SchedulerL2 antes de que este Sheet exista en el
  // árbol (la página espera a que TODAS sus queries, incluida `categories`, carguen antes de
  // montar Sheet/Gantt) — por eso "resuelto" es incondicional acá, a diferencia de la Card que sí
  // corre mientras `services` puede seguir en vuelo (review de Fase 5 #3/#10).
  const validCategoryIds = useMemo(() => new Set(categories.map((c) => c.category_id)), [categories]);
  const staffById = useMemo(() => new Map(staffOptions.map((s) => [s.staff_id, s])), [staffOptions]);
  const selectedStaff = staffById.get(draft.staff_id);
  const liveMatch = selectedStaff
    ? rankCandidateForCategory(toCandidate(selectedStaff), requirements, draft.category_id || null)
    : null;
  const staffLabel = selectedStaff ? staffDisplayName(selectedStaff) : row?.staff ? staffDisplayName(row.staff) : undefined;

  const update = (patch: Partial<SheetDraftState>) => {
    setErrors({ missing: false, dates: false, range: false, numbers: false, category: false, overlap: false });
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    if (!canWrite || isSaving) return;
    const asDraft: AssignmentDraft = { ...draft };
    const result = validateAssignmentDrafts([asDraft]);
    if (!result.valid) {
      setErrors({
        missing: result.missing.size > 0,
        dates: result.badDates.size > 0,
        range: false,
        numbers: result.badNumbers.size > 0,
        category: false,
        overlap: false,
      });
      if (result.missing.size > 0) toast.error(t("engagement.assignments.errors.requiredFields"));
      else if (result.badDates.size > 0) toast.error(t("engagement.assignments.errors.dateRange"));
      else toast.error(t("engagement.assignments.errors.numericRange"));
      return;
    }
    // O4 — primera barrera de UX: el segmento debe caer dentro del rango del Engagement (la RPC
    // también lo valida como EAS_ENGAGEMENT_RANGE).
    if (findOutOfEngagementRangeKeys([asDraft], engagement.start_date, engagement.end_date).size > 0) {
      setErrors({ missing: false, dates: false, range: true, numbers: false, category: false, overlap: false });
      toast.error(t("engagement.assignments.errors.outOfEngagementRange"));
      return;
    }
    // Categoría histórica/seleccionada fuera del servicio del engagement (issue §6) — bloquea
    // igual que en StaffAssignmentsCard.
    if (findForeignCategoryKeys([asDraft], validCategoryIds, true).size > 0) {
      setErrors({ missing: false, dates: false, range: false, numbers: false, category: true, overlap: false });
      toast.error(t("engagement.assignments.errors.categoryForeignService"));
      return;
    }
    // Overlap contra el snapshot COMPLETO (no la vista filtrada) — issue/plan §9.
    if (findStaffSegmentOverlap(asDraft, assignments)) {
      setErrors({ missing: false, dates: false, range: false, numbers: false, category: false, overlap: true });
      toast.error(t("scheduler.errors.overlap"));
      return;
    }
    try {
      const rows = await saveAssignments({
        engagementId: engagement.engagement_id,
        current: [asDraft],
        original: assignments,
        deletedIds: [],
      });
      const saved = rows.find((r) => r.assignment_id === asDraft.key);
      const nextBaseline = saved ? { ...draft, ...rpcRowToDraft(saved) } : draft;
      setBaseline(nextBaseline);
      onOpenChange(false);
      onSaved?.();
    } catch {
      // El hook ya mostró su propio toast (mapeo EAS_* o el manejador centralizado) — dirty se
      // preserva.
    }
  };

  const handleDelete = async () => {
    if (!canWrite || !row || isSaving) return;
    setDeleteConfirmOpen(false);
    try {
      await saveAssignments({
        engagementId: engagement.engagement_id,
        current: [],
        original: assignments,
        deletedIds: [row.assignment_id],
      });
      onOpenChange(false);
      onSaved?.();
    } catch {
      toast.error(t("scheduler.errors.partialSave"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void handleSave();
    }
  };

  const dateField = (field: "start_date" | "end_date", label: string, minDate?: string) => {
    const value = draft[field];
    const selected = value ? parseDateLocal(value) : undefined;
    const min = minDate ? parseDateLocal(minDate) : undefined;
    const invalid = (errors.missing && !value) || (errors.dates && field === "end_date") || errors.range;
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label} *</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={!canWrite}
              className={cn(
                "w-full justify-between font-normal",
                !value && "text-muted-foreground",
                invalid && "ring-1 ring-destructive"
              )}
            >
              {value && selected ? format(selected, "dd/MM/yyyy") : t("common.pickDate")}
              <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={dateLocale}
              selected={selected}
              onSelect={(date) => date && update({ [field]: format(date, "yyyy-MM-dd") })}
              disabled={min ? (date) => date < min : undefined}
              defaultMonth={selected}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" onKeyDown={handleKeyDown}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {t("scheduler.assignmentSheet.title")}
            <MatchDot result={liveMatch} />
          </SheetTitle>
          <SheetDescription>{t("scheduler.assignmentSheet.description")}</SheetDescription>
          {!canWrite && <p className="text-xs text-muted-foreground">{t("scheduler.readOnly")}</p>}
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("engagement.assignments.staff")} *
            </label>
            {row ? (
              <p className="text-sm font-medium py-2">{staffLabel ?? "—"}</p>
            ) : (
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    disabled={!canWrite}
                    className={cn(
                      "w-full justify-between font-normal",
                      !staffLabel && "text-muted-foreground",
                      errors.missing && !draft.staff_id && "ring-1 ring-destructive"
                    )}
                  >
                    <span className="truncate">{staffLabel ?? t("engagement.assignments.selectStaff")}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="min-w-[--radix-popover-trigger-width] w-auto max-w-[420px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("engagement.assignments.searchStaff")} />
                    <CommandList>
                      <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                      <CommandGroup>
                        {pickerOptions.map(({ staff, pickerMatch }) => (
                          <CommandItem
                            key={staff.staff_id}
                            value={`${staff.first_name} ${staff.last_name} ${staff.short_name ?? ""}`}
                            onSelect={() => {
                              // Autoprefill de categoría SOLO si pertenece al servicio del engagement — igual
                              // que StaffAssignmentsCard.handleStaffPick (review de Fase 5 #3): nunca
                              // autocompleta una categoría de otro servicio.
                              const staffCategoryValid =
                                !!staff.category_id && validCategoryIds.has(staff.category_id);
                              update({
                                staff_id: staff.staff_id,
                                category_id: staffCategoryValid ? staff.category_id! : "",
                              });
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                draft.staff_id === staff.staff_id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span
                              role="img"
                              aria-label={
                                pickerMatch
                                  ? t(
                                      `engagement.assignments.match.${
                                        pickerMatch.tier === "category_only" ? "categoryOnly" : pickerMatch.tier
                                      }`
                                    )
                                  : t("engagement.assignments.match.noRequirement")
                              }
                              className={cn(
                                "mr-2 inline-block h-2 w-2 shrink-0 rounded-full",
                                pickerMatch ? TIER_DOT_CLASS[pickerMatch.tier] : "border border-border"
                              )}
                            />
                            <span className="truncate">{staffDisplayName(staff)}</span>
                            {staff.category?.category_name && (
                              <span className="ml-2 text-xs text-muted-foreground truncate">
                                {staff.category.category_name}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("engagement.assignments.category")} *
            </label>
            {/* value SIEMPRE string (nunca `undefined`) para no alternar entre no-controlado y
                controlado — ese cambio de modo es lo que React advertía (review de Fase 5 #S4). */}
            <Select value={draft.category_id} onValueChange={(v) => update({ category_id: v })} disabled={!canWrite}>
              <SelectTrigger
                className={cn(
                  ((errors.missing && !draft.category_id) || errors.category) && "ring-1 ring-destructive"
                )}
              >
                <SelectValue placeholder={t("engagement.assignments.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.category_id} value={c.category_id}>
                    {c.category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-xs text-destructive">{t("engagement.assignments.errors.categoryForeignService")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {dateField("start_date", t("engagement.assignments.startDate"))}
            {dateField("end_date", t("engagement.assignments.endDate"), draft.start_date || undefined)}
          </div>
          {errors.dates && <p className="text-xs text-destructive">{t("engagement.assignments.errors.dateRange")}</p>}
          {!errors.dates && errors.range && (
            <p className="text-xs text-destructive">{t("engagement.assignments.errors.outOfEngagementRange")}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.hoursPerWeek")}</label>
              <NumericInput
                decimals={1}
                locale={numericLocale}
                min={0.1}
                max={HOURS_PER_WEEK_MAX}
                value={draft.hours_per_week}
                onChange={(v) => update({ hours_per_week: v })}
                disabled={!canWrite}
                className={cn("text-right", errors.numbers && "ring-1 ring-destructive")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.allocationPct")}</label>
              <NumericInput
                decimals={1}
                locale={numericLocale}
                min={0.1}
                max={ALLOCATION_PERCENT_MAX}
                value={draft.allocation_percent}
                onChange={(v) => update({ allocation_percent: v })}
                disabled={!canWrite}
                className={cn("text-right", errors.numbers && "ring-1 ring-destructive")}
              />
            </div>
          </div>
          {errors.numbers && <p className="text-xs text-destructive">{t("engagement.assignments.errors.numericRange")}</p>}
          {errors.overlap && <p className="text-xs text-destructive">{t("scheduler.errors.overlap")}</p>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.notes")}</label>
            <Input value={draft.notes} onChange={(e) => update({ notes: e.target.value })} disabled={!canWrite} />
          </div>
        </div>

        {canWrite && (
          <SheetFooter className="gap-2 sm:justify-between">
            {row ? (
              <Button type="button" variant="destructive" onClick={() => setDeleteConfirmOpen(true)} disabled={isSaving}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t("scheduler.assignmentSheet.delete")}
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {t("scheduler.assignmentSheet.save")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.leavePageDirtyTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.leavePageDirtyBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={discardAndClose} className="bg-destructive/70 text-destructive-foreground hover:bg-destructive">
              {t("common.leaveAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("scheduler.assignmentSheet.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.confirmDelete", { name: staffLabel ?? "—" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive/70 text-destructive-foreground hover:bg-destructive">
              {t("scheduler.assignmentSheet.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
