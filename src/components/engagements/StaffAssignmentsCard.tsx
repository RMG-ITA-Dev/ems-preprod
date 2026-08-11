import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  type Engagement,
  type EngagementAssignmentRow,
  type StaffWithSkills,
  useActiveStaffWithSkills,
  useCategories,
  useEngagementAggregatedRequirements,
  useEngagementAssignments,
  useServices,
} from "@/hooks/useEmsData";
import { useSaveEngagementAssignments, type AssignmentDraft } from "@/hooks/mutations";
import {
  ALLOCATION_PERCENT_MAX,
  AUDITORIA_SERVICE_CODE,
  findForeignCategoryKeys,
  findOutOfEngagementRangeKeys,
  findStaffSegmentOverlap,
  HOURS_PER_WEEK_MAX,
  resolveStaffLabel,
  rpcRowToDraft,
  validateAssignmentDrafts,
} from "@/lib/engagementAssignments";
import {
  rankCandidateForCategory,
  TIER_SORT_ORDER,
  type AggregatedRequirement,
  type MatchResult,
  type ProficiencyLevel,
  type StaffCandidate,
} from "@/lib/staffingMatch";
import { canWriteEngagementAssignments } from "@/lib/schedulerAssignmentAuthz";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { MatchDot, TIER_DOT_CLASS } from "@/components/scheduler/MatchDot";
import { cn } from "@/lib/utils";

// Fase 5 — Engagement Staff Assignments grid (bugs/scheduler/fase_5/plan_v2.md §3).
//
// Se renderiza SOLO para un Engagement ya persistido (el padre gatea en isEdit /
// engagement.engagement_id). Guardado propio: la card tiene sus botones "Guardar"/"Descartar"
// (ambos type="button") e invoca la RPC directamente — NUNCA expone un `save()` imperativo al
// submit del Engagement (anti-patrón prohibido por el issue). El dirty state se reporta al padre
// vía onDirtyChange para que participe del page-leave lock combinado.

export interface StaffAssignmentsCardProps {
  engagement: Engagement;
  onDirtyChange?: (dirty: boolean) => void;
}

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

function toDraft(row: EngagementAssignmentRow): AssignmentDraft {
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

function draftsEqual(a: AssignmentDraft, b: AssignmentDraft): boolean {
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

function staffDisplayName(staff: { first_name: string; last_name: string }): string {
  return `${staff.first_name} ${staff.last_name}`;
}

interface StaffComboboxProps {
  options: Array<{ staff: StaffWithSkills; pickerMatch: MatchResult | null }>;
  value: string;
  onValueChange: (staffId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  fallbackLabel?: string;
}

// Selector de candidatos buscable. Ordenado full -> partial -> category_only -> none, luego
// alfabético. Advisory only — cualquier candidato puede elegirse sin importar el tier.
function StaffCombobox({
  options,
  value,
  onValueChange,
  disabled,
  invalid,
  fallbackLabel,
}: StaffComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...options].sort((a, b) => {
        const wa = a.pickerMatch ? TIER_SORT_ORDER[a.pickerMatch.tier] : 4;
        const wb = b.pickerMatch ? TIER_SORT_ORDER[b.pickerMatch.tier] : 4;
        if (wa !== wb) return wa - wb;
        return staffDisplayName(a.staff).localeCompare(staffDisplayName(b.staff));
      }),
    [options]
  );

  const selected = options.find((o) => o.staff.staff_id === value)?.staff;
  const displayLabel = selected
    ? staffDisplayName(selected)
    : value
      ? fallbackLabel
      : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between h-9 px-2 font-normal border-0 shadow-none hover:bg-muted/50",
            !displayLabel && "text-muted-foreground",
            invalid && "ring-1 ring-destructive"
          )}
        >
          <span className="truncate">
            {displayLabel ?? t("engagement.assignments.selectStaff")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[--radix-popover-trigger-width] w-auto max-w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("engagement.assignments.searchStaff")} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            <CommandGroup>
              {sorted.map(({ staff, pickerMatch }) => (
                <CommandItem
                  key={staff.staff_id}
                  value={`${staff.first_name} ${staff.last_name} ${staff.short_name ?? ""}`}
                  onSelect={() => {
                    onValueChange(staff.staff_id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === staff.staff_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span
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
  );
}

interface DateCellProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  minDate?: string;
}

function DateCell({ value, onChange, disabled, invalid, minDate }: DateCellProps) {
  const { t } = useTranslation();
  const selected = value ? parseDateLocal(value) : undefined;
  const min = minDate ? parseDateLocal(minDate) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "w-full justify-between h-9 px-2 font-normal border-0 shadow-none hover:bg-muted/50",
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
          selected={selected}
          onSelect={(date) => date && onChange(format(date, "yyyy-MM-dd"))}
          disabled={min ? (date) => date < min : undefined}
          defaultMonth={selected}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

export function StaffAssignmentsCard({ engagement, onDirtyChange }: StaffAssignmentsCardProps) {
  const { t, i18n } = useTranslation();
  const numericLocale = i18n.language?.startsWith("es") ? "es" : "en";

  const engagementId = engagement.engagement_id;
  const { data: assignments, isLoading, isError } = useEngagementAssignments(engagementId);
  const { data: aggregatedReqs } = useEngagementAggregatedRequirements(engagementId);
  const { data: staffOptions } = useActiveStaffWithSkills();
  const servicesQuery = useServices();
  const services = servicesQuery.data;
  // Categorías por SERVICIO del engagement (issue §6/§11). O6 (CERRADA) prohíbe expresamente el
  // fallback histórico "sin scope: todas las categorías": practica nula o sin match en `services`
  // resuelve a Auditoría, igual que el backfill de la migración de convergencia — nunca al
  // catálogo global (review de Fase 5 #M1). `servicesLoaded` además evita exponer cualquier
  // catálogo mientras `services` todavía no cargó (review #3): antes de eso no hay manera de saber
  // si `engagementServiceId` va a resolver a un match real o a Auditoría.
  const servicesLoaded = services !== undefined;
  const engagementServiceId = useMemo(() => {
    if (!services) return undefined;
    return (
      services.find((s) => s.code === engagement.practica)?.service_id ??
      services.find((s) => s.code === AUDITORIA_SERVICE_CODE)?.service_id
    );
  }, [services, engagement.practica]);
  const categoriesQuery = useCategories(engagementServiceId);
  // "Resuelto" exige además que la query scoped haya TERMINADO con éxito (review de Fase 5,
  // Iteración 3) — no alcanza con que el service_id ya esté disponible: mientras
  // `categoriesQuery` sigue en vuelo (o si falla), `categoriesResolved` se quedaba en `true` con
  // datos vacíos, marcando cualquier fila persistida como "categoría ajena" por error. Un
  // ambiente sin Auditoría en el catálogo (engagementServiceId nunca resuelve, no debería
  // ocurrir) queda sin categorías, no en catalogError — services sí cargó correctamente.
  const categoriesResolved = servicesLoaded && engagementServiceId !== undefined && categoriesQuery.isSuccess;
  const categories = categoriesResolved ? categoriesQuery.data : undefined;
  // El catálogo (servicio + categorías) participa de los mismos estados loading/error que
  // `useEngagementAssignments` — antes solo se mostraba loading/error de assignments, dejando a
  // la grilla renderizar con datos de categoría a medio cargar o rotos.
  const catalogLoading = !servicesLoaded || (engagementServiceId !== undefined && categoriesQuery.isLoading);
  const catalogError = servicesQuery.isError || (engagementServiceId !== undefined && categoriesQuery.isError);
  const { saveAssignments, isSaving } = useSaveEngagementAssignments();

  const { isAdmin } = useUserRole();
  const { staffRecord } = useCurrentStaff();
  const myStaffId = staffRecord?.staff_id ?? null;
  const canEdit = canWriteEngagementAssignments({
    isAdmin,
    myStaffId,
    responsibleStaffIds: [
      engagement.manager_id,
      engagement.partner_id,
      engagement.sqr_id,
      engagement.encargado_id,
      engagement.specialist_it_id,
      engagement.specialist_tax_id,
    ],
  });

  const [drafts, setDrafts] = useState<AssignmentDraft[]>([]);
  // Baseline capturado al sembrar/guardar. El dirty se mide contra este snapshot ESTABLE — no
  // contra el resultado de la query en movimiento — así una fila que otro usuario agrega
  // concurrentemente no ensucia falsamente la grilla ni bloquea el re-seed.
  const [baseline, setBaseline] = useState<AssignmentDraft[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  const [dateErrorKeys, setDateErrorKeys] = useState<Set<string>>(new Set());
  const [numberErrorKeys, setNumberErrorKeys] = useState<Set<string>>(new Set());
  const [overlapKeys, setOverlapKeys] = useState<Set<string>>(new Set());

  const requirements: AggregatedRequirement[] = useMemo(() => aggregatedReqs ?? [], [aggregatedReqs]);

  const validCategoryIds = useMemo(
    () => new Set((categories ?? []).map((c) => c.category_id)),
    [categories]
  );
  const foreignCategoryKeys = useMemo(
    () => findForeignCategoryKeys(drafts, validCategoryIds, categoriesResolved),
    [drafts, validCategoryIds, categoriesResolved]
  );
  const outOfRangeKeys = useMemo(
    () => findOutOfEngagementRangeKeys(drafts, engagement.start_date, engagement.end_date),
    [drafts, engagement.start_date, engagement.end_date]
  );

  const dirty = useMemo(() => {
    if (deletedIds.size > 0) return true;
    if (drafts.some((d) => !d.assignment_id)) return true;
    const draftKeys = new Set(drafts.map((d) => d.key));
    if (baseline.some((b) => !draftKeys.has(b.key))) return true;
    const byKey = new Map(baseline.map((b) => [b.key, b]));
    return drafts.some((d) => {
      const base = byKey.get(d.key);
      return !base || !draftsEqual(d, base);
    });
  }, [drafts, baseline, deletedIds]);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Sembrar drafts desde la query: incondicionalmente en el primer load de este engagement,
  // luego solo mientras esté limpio — un refetch de fondo NUNCA pisa ediciones en curso.
  const seededEngagementIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!assignments) return;
    const firstSeed = seededEngagementIdRef.current !== engagementId;
    if (!firstSeed && dirtyRef.current) return;
    seededEngagementIdRef.current = engagementId;
    const seeded = assignments.map(toDraft);
    setDrafts(seeded);
    setBaseline(seeded);
    setDeletedIds(new Set());
  }, [assignments, engagementId]);

  const staffById = useMemo(
    () => new Map((staffOptions ?? []).map((s) => [s.staff_id, s])),
    [staffOptions]
  );

  const activeStaffNames = useMemo(
    () => new Map((staffOptions ?? []).map((s) => [s.staff_id, staffDisplayName(s)])),
    [staffOptions]
  );

  // Nombres embebidos en filas persistidas — el fallback para staff desactivado después de
  // asignado (ausente de la lista activa).
  const persistedStaffNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of assignments ?? []) {
      if (row.staff) map.set(row.staff_id, staffDisplayName(row.staff));
    }
    return map;
  }, [assignments]);

  // Candidatos para FILAS NUEVAS: solo staff activo Y schedulable (issue: "solo permiten
  // seleccionar staff activo y schedulable"). Filas históricas siguen mostrando su staff vía
  // resolveStaffLabel aunque ya no aparezca aquí.
  const newRowCandidates = useMemo(
    () => (staffOptions ?? []).filter((s) => s.is_schedulable !== false),
    [staffOptions]
  );

  // Fila existente: se permite reasignar a CUALQUIER staff activo (no solo schedulable) sin
  // ocultar candidatos — la RPC es la autoridad final: reasignar a un staff no-schedulable ahora
  // sí re-valida elegibilidad server-side y rechaza con EAS_STAFF_INELIGIBLE si corresponde
  // (review de Fase 5 #4; antes esa validación se saltaba por completo en cualquier UPDATE).
  const candidateOptionsFor = (draft: AssignmentDraft) => {
    const pool = draft.assignment_id ? staffOptions ?? [] : newRowCandidates;
    return pool.map((staff) => ({
      staff,
      pickerMatch: rankCandidateForCategory(toCandidate(staff), requirements, staff.category_id),
    }));
  };

  const clearRowErrors = (key: string) => {
    const clear = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
      setter((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    clear(setInvalidKeys);
    clear(setDateErrorKeys);
    clear(setNumberErrorKeys);
    clear(setOverlapKeys);
  };

  const updateDraft = (key: string, patch: Partial<AssignmentDraft>) => {
    clearRowErrors(key);
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const addRow = () => {
    setDrafts((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        staff_id: "",
        category_id: "",
        start_date: engagement.start_date ?? "",
        end_date: engagement.end_date ?? "",
        hours_per_week: 40,
        allocation_percent: 100,
        notes: "",
      },
    ]);
  };

  const removeRow = (key: string) => {
    clearRowErrors(key);
    const removed = drafts.find((d) => d.key === key);
    if (removed?.assignment_id) {
      const id = removed.assignment_id;
      setDeletedIds((prev) => new Set(prev).add(id));
    }
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  };

  const undoRemove = (persistedRow: EngagementAssignmentRow) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      next.delete(persistedRow.assignment_id);
      return next;
    });
    setDrafts((prev) =>
      prev.some((d) => d.key === persistedRow.assignment_id) ? prev : [...prev, toDraft(persistedRow)]
    );
  };

  const pendingRemovedRows = useMemo(
    () => (assignments ?? []).filter((row) => deletedIds.has(row.assignment_id)),
    [assignments, deletedIds]
  );

  const handleStaffPick = (key: string, staffId: string) => {
    const staff = staffById.get(staffId);
    // Autoprefill de categoría SOLO si pertenece al servicio del engagement — nunca autocompleta
    // una categoría de otro servicio (issue §6).
    const staffCategoryValid = !!staff?.category_id && validCategoryIds.has(staff.category_id);
    updateDraft(key, {
      staff_id: staffId,
      category_id: staffCategoryValid ? staff!.category_id! : "",
    });
  };

  const discardChanges = () => {
    setDrafts(baseline);
    setDeletedIds(new Set());
    setInvalidKeys(new Set());
    setDateErrorKeys(new Set());
    setNumberErrorKeys(new Set());
    setOverlapKeys(new Set());
  };

  const handleSave = async () => {
    if (!canEdit || isSaving || !dirty) return;

    const result = validateAssignmentDrafts(drafts);
    if (!result.valid) {
      setInvalidKeys(result.missing);
      setDateErrorKeys(result.badDates);
      setNumberErrorKeys(result.badNumbers);
      if (result.missing.size > 0) toast.error(t("engagement.assignments.errors.requiredFields"));
      else if (result.badDates.size > 0) toast.error(t("engagement.assignments.errors.dateRange"));
      else toast.error(t("engagement.assignments.errors.numericRange"));
      return;
    }

    if (foreignCategoryKeys.size > 0) {
      toast.error(t("engagement.assignments.errors.categoryForeignService"));
      return;
    }

    if (outOfRangeKeys.size > 0) {
      toast.error(t("engagement.assignments.errors.outOfEngagementRange"));
      return;
    }

    const overlaps = new Set<string>();
    for (const d of drafts) {
      if (findStaffSegmentOverlap(d, drafts.filter((o) => o.key !== d.key)) ) overlaps.add(d.key);
    }
    if (overlaps.size > 0) {
      setOverlapKeys(overlaps);
      toast.error(t("scheduler.errors.overlap"));
      return;
    }

    try {
      const rows = await saveAssignments({
        engagementId,
        current: drafts,
        original: assignments ?? [],
        deletedIds: Array.from(deletedIds),
      });
      // Re-sembrar drafts + baseline desde el estado autoritativo devuelto por la RPC — adopta
      // los assignment_id (ya iguales al UUID cliente salvo colisión) y limpia dirty SOLO ahora.
      const seeded = rows.map(rpcRowToDraft);
      setDrafts(seeded);
      setBaseline(seeded);
      setDeletedIds(new Set());
      toast.success(t("engagement.assignments.saveSuccess"));
    } catch {
      // El hook ya mostró su propio toast (mapeo EAS_* o el manejador centralizado) — dirty se
      // preserva, no se toca drafts/baseline.
    }
  };

  if (isLoading || catalogLoading) {
    return (
      <div className="space-y-3">
        <h3 className="font-medium text-lg">{t("engagement.assignments.title")}</h3>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError || catalogError) {
    return (
      <div className="space-y-3">
        <h3 className="font-medium text-lg">{t("engagement.assignments.title")}</h3>
        <Alert variant="destructive">
          <AlertDescription>{t("engagement.assignments.errors.loadFailed")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-lg">{t("engagement.assignments.title")}</h3>
        {!canEdit && (
          <span className="text-xs text-muted-foreground">{t("engagement.assignments.readOnly")}</span>
        )}
      </div>

      {pendingRemovedRows.length > 0 && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {t("engagement.assignments.pendingChanges")}
            {pendingRemovedRows.map((row) => (
              <Button key={row.assignment_id} type="button" size="sm" variant="outline" onClick={() => undoRemove(row)}>
                {t("common.undo")} — {row.staff ? staffDisplayName(row.staff) : "—"}
              </Button>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Desktop: grilla (>= md) */}
      <div className="hidden md:block border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border min-w-[200px]">
                  {t("engagement.assignments.staff")} *
                </th>
                <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border w-40">
                  {t("engagement.assignments.category")} *
                </th>
                <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border w-36">
                  {t("engagement.assignments.startDate")} *
                </th>
                <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border w-36">
                  {t("engagement.assignments.endDate")} *
                </th>
                <th className="text-right p-2 font-semibold text-xs text-muted-foreground border-r border-border w-20">
                  {t("engagement.assignments.hoursPerWeek")}
                </th>
                <th className="text-right p-2 font-semibold text-xs text-muted-foreground border-r border-border w-24">
                  {t("engagement.assignments.allocationPct")}
                </th>
                <th className="text-center p-2 font-semibold text-xs text-muted-foreground border-r border-border w-16">
                  {t("engagement.assignments.match.label")}
                </th>
                <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border min-w-[140px]">
                  {t("engagement.assignments.notes")}
                </th>
                <th className="w-12 p-2" />
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-sm text-muted-foreground border-b border-border">
                    {t("engagement.assignments.empty")}
                  </td>
                </tr>
              )}

              {drafts.map((draft) => {
                const staff = staffById.get(draft.staff_id);
                const rowMatch = staff
                  ? rankCandidateForCategory(toCandidate(staff), requirements, draft.category_id || null)
                  : null;
                const isInvalid = invalidKeys.has(draft.key);
                const hasNumberError = numberErrorKeys.has(draft.key);
                const hasForeignCategory = foreignCategoryKeys.has(draft.key);
                const hasOverlap = overlapKeys.has(draft.key);
                const hasDateError =
                  dateErrorKeys.has(draft.key) ||
                  (!!draft.start_date && !!draft.end_date && draft.end_date < draft.start_date);
                const hasRangeError = outOfRangeKeys.has(draft.key);

                return (
                  <tr
                    key={draft.key}
                    className={cn(
                      "border-b border-border hover:bg-muted/30",
                      (isInvalid || hasForeignCategory || hasOverlap || hasRangeError) && "bg-destructive/5"
                    )}
                  >
                    <td className="p-1 border-r border-border align-top">
                      <StaffCombobox
                        options={candidateOptionsFor(draft)}
                        value={draft.staff_id}
                        onValueChange={(staffId) => handleStaffPick(draft.key, staffId)}
                        disabled={!canEdit}
                        invalid={isInvalid && !draft.staff_id}
                        fallbackLabel={resolveStaffLabel(draft.staff_id, activeStaffNames, persistedStaffNames)}
                      />
                    </td>

                    <td className="p-1 border-r border-border align-top">
                      <Select
                        value={draft.category_id || undefined}
                        onValueChange={(v) => updateDraft(draft.key, { category_id: v })}
                        disabled={!canEdit}
                      >
                        <SelectTrigger
                          className={cn(
                            "border-0 bg-transparent focus:ring-1 h-9 shadow-none",
                            (isInvalid && !draft.category_id || hasForeignCategory) && "ring-1 ring-destructive"
                          )}
                        >
                          <SelectValue placeholder={t("engagement.assignments.selectCategory")} />
                        </SelectTrigger>
                        <SelectContent>
                          {(categories ?? []).map((c) => (
                            <SelectItem key={c.category_id} value={c.category_id}>
                              {c.category_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {hasForeignCategory && (
                        <p className="px-2 pb-1 text-xs text-destructive">
                          {t("engagement.assignments.errors.categoryForeignService")}
                        </p>
                      )}
                    </td>

                    <td className="p-1 border-r border-border align-top">
                      <DateCell
                        value={draft.start_date}
                        onChange={(v) => updateDraft(draft.key, { start_date: v })}
                        disabled={!canEdit}
                        invalid={(isInvalid && !draft.start_date) || hasRangeError}
                      />
                    </td>

                    <td className="p-1 border-r border-border align-top">
                      <DateCell
                        value={draft.end_date}
                        onChange={(v) => updateDraft(draft.key, { end_date: v })}
                        disabled={!canEdit}
                        invalid={(isInvalid && !draft.end_date) || hasDateError || hasRangeError}
                        minDate={draft.start_date || undefined}
                      />
                      {hasDateError && (
                        <p className="px-2 pb-1 text-xs text-destructive">
                          {t("engagement.assignments.errors.dateRange")}
                        </p>
                      )}
                      {!hasDateError && hasRangeError && (
                        <p className="px-2 pb-1 text-xs text-destructive">
                          {t("engagement.assignments.errors.outOfEngagementRange")}
                        </p>
                      )}
                      {hasOverlap && (
                        <p className="px-2 pb-1 text-xs text-destructive">{t("scheduler.errors.overlap")}</p>
                      )}
                    </td>

                    <td className="p-1 border-r border-border align-top">
                      <NumericInput
                        decimals={1}
                        locale={numericLocale}
                        min={0.1}
                        max={HOURS_PER_WEEK_MAX}
                        value={draft.hours_per_week}
                        onChange={(v) => updateDraft(draft.key, { hours_per_week: v })}
                        disabled={!canEdit}
                        className={cn(
                          "border-0 bg-transparent focus:bg-background focus:ring-1 h-9 shadow-none text-right",
                          hasNumberError && "ring-1 ring-destructive"
                        )}
                      />
                    </td>

                    <td className="p-1 border-r border-border align-top">
                      <NumericInput
                        decimals={1}
                        locale={numericLocale}
                        min={0.1}
                        max={ALLOCATION_PERCENT_MAX}
                        value={draft.allocation_percent}
                        onChange={(v) => updateDraft(draft.key, { allocation_percent: v })}
                        disabled={!canEdit}
                        className={cn(
                          "border-0 bg-transparent focus:bg-background focus:ring-1 h-9 shadow-none text-right",
                          hasNumberError && "ring-1 ring-destructive"
                        )}
                      />
                    </td>

                    <td className="p-1 border-r border-border align-middle text-center">
                      <MatchDot result={rowMatch} />
                    </td>

                    <td className="p-1 border-r border-border align-top">
                      <Input
                        value={draft.notes}
                        onChange={(e) => updateDraft(draft.key, { notes: e.target.value })}
                        disabled={!canEdit}
                        aria-label={t("engagement.assignments.notes")}
                        className="border-0 bg-transparent focus:bg-background focus:ring-1 h-9 shadow-none"
                      />
                    </td>

                    <td className="p-1 text-center align-middle">
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(draft.key)}
                          aria-label={t("engagement.assignments.remove")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {canEdit && (
                <tr>
                  <td colSpan={9} className="p-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground hover:text-foreground rounded-none h-10"
                      onClick={addRow}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t("engagement.assignments.addRow")}
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: tarjetas apiladas (< md) */}
      <div className="space-y-3 md:hidden">
        {drafts.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("engagement.assignments.empty")}
          </p>
        )}
        {drafts.map((draft) => {
          const staff = staffById.get(draft.staff_id);
          const rowMatch = staff
            ? rankCandidateForCategory(toCandidate(staff), requirements, draft.category_id || null)
            : null;
          const isInvalid = invalidKeys.has(draft.key);
          const hasNumberError = numberErrorKeys.has(draft.key);
          const hasForeignCategory = foreignCategoryKeys.has(draft.key);
          const hasOverlap = overlapKeys.has(draft.key);
          const hasDateError =
            dateErrorKeys.has(draft.key) ||
            (!!draft.start_date && !!draft.end_date && draft.end_date < draft.start_date);
          const hasRangeError = outOfRangeKeys.has(draft.key);

          return (
            <Card key={draft.key} className={cn("p-3 space-y-2", (isInvalid || hasForeignCategory || hasOverlap || hasRangeError) && "border-destructive/40")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.staff")} *</span>
                <MatchDot result={rowMatch} />
              </div>
              <StaffCombobox
                options={candidateOptionsFor(draft)}
                value={draft.staff_id}
                onValueChange={(staffId) => handleStaffPick(draft.key, staffId)}
                disabled={!canEdit}
                invalid={isInvalid && !draft.staff_id}
                fallbackLabel={resolveStaffLabel(draft.staff_id, activeStaffNames, persistedStaffNames)}
              />

              <span className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.category")} *</span>
              <Select
                value={draft.category_id || undefined}
                onValueChange={(v) => updateDraft(draft.key, { category_id: v })}
                disabled={!canEdit}
              >
                <SelectTrigger className={cn((isInvalid && !draft.category_id) || hasForeignCategory ? "ring-1 ring-destructive" : "")}>
                  <SelectValue placeholder={t("engagement.assignments.selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.category_id} value={c.category_id}>
                      {c.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasForeignCategory && (
                <p className="text-xs text-destructive">{t("engagement.assignments.errors.categoryForeignService")}</p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.startDate")} *</span>
                  <DateCell
                    value={draft.start_date}
                    onChange={(v) => updateDraft(draft.key, { start_date: v })}
                    disabled={!canEdit}
                    invalid={(isInvalid && !draft.start_date) || hasRangeError}
                  />
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.endDate")} *</span>
                  <DateCell
                    value={draft.end_date}
                    onChange={(v) => updateDraft(draft.key, { end_date: v })}
                    disabled={!canEdit}
                    invalid={(isInvalid && !draft.end_date) || hasDateError || hasRangeError}
                    minDate={draft.start_date || undefined}
                  />
                </div>
              </div>
              {hasDateError && <p className="text-xs text-destructive">{t("engagement.assignments.errors.dateRange")}</p>}
              {!hasDateError && hasRangeError && (
                <p className="text-xs text-destructive">{t("engagement.assignments.errors.outOfEngagementRange")}</p>
              )}
              {hasOverlap && <p className="text-xs text-destructive">{t("scheduler.errors.overlap")}</p>}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.hoursPerWeek")}</span>
                  <NumericInput
                    decimals={1}
                    locale={numericLocale}
                    min={0.1}
                    max={HOURS_PER_WEEK_MAX}
                    value={draft.hours_per_week}
                    onChange={(v) => updateDraft(draft.key, { hours_per_week: v })}
                    disabled={!canEdit}
                    className={cn("text-right", hasNumberError && "ring-1 ring-destructive")}
                  />
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.allocationPct")}</span>
                  <NumericInput
                    decimals={1}
                    locale={numericLocale}
                    min={0.1}
                    max={ALLOCATION_PERCENT_MAX}
                    value={draft.allocation_percent}
                    onChange={(v) => updateDraft(draft.key, { allocation_percent: v })}
                    disabled={!canEdit}
                    className={cn("text-right", hasNumberError && "ring-1 ring-destructive")}
                  />
                </div>
              </div>

              <span className="text-xs font-medium text-muted-foreground">{t("engagement.assignments.notes")}</span>
              <Input
                value={draft.notes}
                onChange={(e) => updateDraft(draft.key, { notes: e.target.value })}
                disabled={!canEdit}
                aria-label={t("engagement.assignments.notes")}
              />

              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(draft.key)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("engagement.assignments.remove")}
                </Button>
              )}
            </Card>
          );
        })}
        {canEdit && (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRow}>
            <Plus className="h-4 w-4 mr-2" />
            {t("engagement.assignments.addRow")}
          </Button>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="cancel" size="sm" onClick={discardChanges} disabled={!dirty || isSaving}>
            {t("engagement.assignments.discard")}
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!dirty || isSaving}>
            {t("engagement.assignments.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
