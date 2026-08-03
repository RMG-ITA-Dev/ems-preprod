// ============= Lines 1-500 of 657 total lines =============

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffFull, useCategories, useActiveSkills } from "@/hooks/useEmsData";
import { useCreateStaff, useUpdateStaff, useDeleteStaff, useCreateStaffCompetency, useUpdateStaffCompetency, useDeleteStaffCompetency } from "@/hooks/mutations";
import { Trash2, AlertTriangle, Plus, Lock, LockOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuthorization } from "@/hooks/useAuthorization";
import { PROFICIENCY_LEVELS, type ProficiencyLevel } from "@/integrations/supabase/customTypes";
import { formatFullDate, fromISODateString } from "@/lib/timesheetUtils";

const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Walks a react-hook-form errors tree and returns the first leaf .message found.
// Handles nested arrays (useFieldArray) where Object.values()[0] returns a non-message container.
const findFirstErrorMessage = (errors: unknown): string | undefined => {
  if (!errors || typeof errors !== "object") return undefined;
  if ("message" in errors && typeof (errors as { message?: unknown }).message === "string") {
    return (errors as { message: string }).message;
  }
  for (const val of Object.values(errors)) {
    const found = findFirstErrorMessage(val);
    if (found) return found;
  }
  return undefined;
};


const createFormSchema = (t: TFunction, isEdit: boolean = false, previousIsActive?: boolean) =>
  z.object({
    first_name: z.string().min(1, t("validation.firstNameRequired")),
    last_name: z.string().min(1, t("validation.lastNameRequired")),
    short_name: z.string().optional(),
    initials: z.string().max(4, t("validation.initialsMax4")).optional(),
    email: z.string().min(1, t("validation.emailRequired")).email(t("validation.emailInvalid")),
    category_id: z.string().min(1, t("validation.categoryRequired")),
    city: z.string().min(1, t("validation.cityRequired")),
    id_number: z.string().min(1, t("validation.idNumberRequired")),
    aud_reg_number: z.string().optional(),
    hire_date: z.string().min(1, t("validation.hireDateRequired")),
    termination_date: z.string().optional(),
    is_active: z.boolean(),
    competencies: z.array(
      z.object({
        _key: z.string(),
        staff_skill_id: z.string().uuid().optional(),
        skill_id: z.string().min(1, t("staff.competencies.errors.required")),
        proficiency_level: z.enum(["Beginner", "Intermediate", "Advanced"]),
        last_evaluated_date: z.string()
          .min(1, t("staff.competencies.errors.dateRequired"))
          .refine((d) => d <= todayISO(), t("staff.competencies.errors.futureDate")),
      })
    ).superRefine((rows, ctx) => {
      const seen = new Set<string>();
      rows.forEach((row, i) => {
        if (row.skill_id && seen.has(row.skill_id)) {
          ctx.addIssue({ code: "custom", path: [i, "skill_id"], message: t("staff.competencies.errors.duplicate") });
        }
        if (row.skill_id) seen.add(row.skill_id);
      });
    }).default([]),
  }).refine(
    (data) => {
      // Require termination_date only for actual active→inactive transitions
      // Don't require if already inactive or transitioning to active
      if (previousIsActive === true && !data.is_active && !data.termination_date) {
        return false;
      }
      return true;
    },
    {
      message: t("validation.terminationDateRequired"),
      path: ["termination_date"],
    }
  ).refine(
    (data) => {
      if (data.termination_date && data.hire_date) {
        return data.termination_date >= data.hire_date;
      }
      return true;
    },
    {
      message: t("validation.terminationDateBeforeHire"),
      path: ["termination_date"],
    }
  );

type FormSchema = ReturnType<typeof createFormSchema>;
type FormData = z.infer<FormSchema>;

interface PendingWeek {
  week_start: string;
  effective_start: string;
  effective_end: string;
  expected_hours: number;
  actual_hours: number;
  gap: number;
}

// StaffForm uses StaffFull interface since it needs PII fields for editing
interface StaffFormProps {
  staff?: StaffFull | null;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel?: () => void;
  onSaveSuccess?: () => void;
  prefillEmail?: string;
}

// Helper to generate short_name suggestion
const generateShortName = (firstName: string, lastName: string): string => {
  if (!firstName || !lastName) return "";
  const firstWord = firstName.split(" ")[0];
  const lastNames = lastName.split(" ");
  const firstLastName = lastNames[0] || "";
  const secondLastInitial = lastNames[1] ? `${lastNames[1][0]}.` : "";
  return `${firstWord} ${firstLastName} ${secondLastInitial}`.trim();
};

// BUG #4: Improved initials generation using consonants for uniqueness
const generateInitials = (firstName: string, lastName: string): string => {
  if (!firstName || !lastName) return "";
  
  const firstInitial = firstName[0]?.toUpperCase() || "";
  const lastNames = lastName.trim().split(/\s+/);
  
  const getConsonants = (word: string): string => {
    return word.slice(1).replace(/[aeiouáéíóúAEIOUÁÉÍÓÚ\s]/g, "");
  };
  
  let initials = firstInitial;
  
  if (lastNames.length >= 2) {
    initials += lastNames[0][0]?.toUpperCase() || "";
    initials += lastNames[1][0]?.toUpperCase() || "";
  } else if (lastNames.length === 1) {
    const lastName1 = lastNames[0];
    initials += lastName1[0]?.toUpperCase() || "";
    const consonants = getConsonants(lastName1);
    if (consonants.length > 0) {
      initials += consonants[0].toUpperCase();
    }
  }
  
  return initials.slice(0, 4);
};

export function StaffForm({ staff, onDirtyChange, onCancel, onSaveSuccess, prefillEmail }: StaffFormProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isEdit = !!staff;
  const { can, roleKey } = useAuthorization();
  const isAdmin = roleKey === "admin";
  const { data: categories } = useCategories();
  const { data: activeSkills } = useActiveSkills();
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();
  const createCompetency = useCreateStaffCompetency();
  const updateCompetency = useUpdateStaffCompetency();
  const deleteCompetency = useDeleteStaffCompetency();

  // Tracks skill_ids of competencies that existed when the edit form was loaded
  const originalSkillIds = useRef<Set<string>>(new Set());

  // Pending hours dialog state
  const [pendingWeeks, setPendingWeeks] = useState<PendingWeek[]>([]);
  const [showPendingDialog, setShowPendingDialog] = useState(false);

  // Reactivation confirmation dialog state (BUG 0526-123).
  // Opens when an admin toggles is_active OFF->ON on a row that still has a
  // termination_date. The DB-side hour-loading restriction stays in effect.
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);

  // Unblock dialog state (BUG 0601-132)
  const [showUnblockDialog, setShowUnblockDialog] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);

  const formSchema = useMemo(() => createFormSchema(t, isEdit, staff?.is_active), [t, isEdit, staff?.is_active]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      short_name: "",
      initials: "",
      email: prefillEmail || "",
      category_id: "",
      city: "",
      id_number: "",
      aud_reg_number: "",
      hire_date: "",
      termination_date: "",
      is_active: false,
      competencies: [],
    },
  });

  const { fields: competencyFields, append: appendCompetency, remove: removeCompetency } = useFieldArray({
    control: form.control,
    name: "competencies",
  });

  useEffect(() => {
    if (staff) {
      const seededCompetencies = (staff.staff_skills ?? []).map((ss) => ({
        _key: ss.staff_skill_id,
        staff_skill_id: ss.staff_skill_id,
        skill_id: ss.skill_id,
        proficiency_level: ss.proficiency_level as ProficiencyLevel,
        last_evaluated_date: ss.last_evaluated_date ?? "",
      }));
      originalSkillIds.current = new Set(seededCompetencies.map((c) => c.skill_id));
      form.reset({
        first_name: staff.first_name,
        last_name: staff.last_name,
        short_name: staff.short_name || "",
        initials: staff.initials || "",
        email: staff.email || "",
        category_id: staff.category_id || "",
        city: staff.city || "",
        id_number: staff.id_number || "",
        aud_reg_number: staff.aud_reg_number || "",
        hire_date: staff.hire_date || "",
        termination_date: staff.termination_date || "",
        is_active: staff.is_active,
        competencies: seededCompetencies,
      });
    }
  }, [staff, form]);

  // Report dirty state to parent
  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Watch first_name and last_name to auto-suggest short_name and initials
  const firstName = form.watch("first_name");
  const lastName = form.watch("last_name");
  const currentShortName = form.watch("short_name");
  const currentInitials = form.watch("initials");

  useEffect(() => {
    // Only auto-suggest if fields are empty (don't override user edits)
    if (!isEdit && firstName && lastName) {
      if (!currentShortName) {
        form.setValue("short_name", generateShortName(firstName, lastName));
      }
      if (!currentInitials) {
        form.setValue("initials", generateInitials(firstName, lastName));
      }
    }
  }, [firstName, lastName, isEdit, currentShortName, currentInitials, form]);


  const handleUnblock = async () => {
    if (!staff) return;
    setIsUnblocking(true);
    try {
      const { data, error } = await supabase.functions.invoke('unlock-account', {
        body: {
          staffId: staff.staff_id,
          redirectTo: `${window.location.origin}/reset-password?reason=admin_unlock`,
        },
      });
      if (error) throw error;
      const result = data as { ok: boolean; code?: string; resetEmailSent?: boolean } | null;
      if (!result?.ok) throw new Error(result?.code ?? 'UNKNOWN_ERROR');
      // The account is unblocked either way, but the reset email may have failed
      // (SMTP/rate limit/redirect). Don't claim it was sent when it wasn't.
      if (result.resetEmailSent === false) {
        toast.warning(t('staff.unblockNoEmail'));
      } else {
        toast.success(t('staff.unblockSuccess'));
      }
      setShowUnblockDialog(false);
      if (onSaveSuccess) {
        onSaveSuccess();
      } else {
        navigate('/staff');
      }
    } catch (err) {
      console.error('[StaffForm] unlock-account failed:', err);
      toast.error(t('staff.unblockError'));
    } finally {
      setIsUnblocking(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    // Pre-save duplicate email check
    if (data.email) {
      const { data: existing } = await supabase
        .from('staff')
        .select('staff_id, first_name, last_name')
        .eq('email', data.email)
        .is('deleted_at', null)
        .neq('staff_id', staff?.staff_id || '')
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error(t('staff.emailAlreadyUsed', {
          name: `${existing[0].first_name} ${existing[0].last_name}`
        }));
        return;
      }
    }

    // Pre-save duplicate id_number check.
    // Va por RPC: el SELECT de `staff.id_number` está revocado a `authenticated`
    // (20260730080000) y los privilegios de columna aplican también al WHERE, así
    // que el `.eq('id_number', ...)` anterior ya no puede correr desde el cliente.
    // El RPC responde solo si hay conflicto y de quién — nunca el documento ajeno.
    if (data.id_number) {
      const { data: conflict, error: conflictError } = await supabase.rpc(
        'staff_id_number_conflict' as never,
        {
          p_id_number: data.id_number,
          p_exclude_staff_id: staff?.staff_id ?? null,
        } as never
      );

      if (conflictError) {
        toast.error(t('errors.duplicateCheckFailed'));
        return;
      }
      if ((conflict as unknown as { conflict?: boolean } | null)?.conflict) {
        toast.error(t('errors.duplicateIdNumber'));
        return;
      }
    }

    // Pending-hours completeness gate: only on deactivation with termination_date
    if (isEdit && staff && staff.is_active && !data.is_active && data.termination_date) {
      try {
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('check_pending_hours_before_termination', {
            p_staff_id: staff.staff_id,
            p_termination_date: data.termination_date,
          });

        if (rpcError) {
          toast.error(t('staff.pendingHoursCheckError'));
          return;
        }

        const gaps = (rpcResult as unknown as PendingWeek[]) || [];
        if (gaps.length > 0) {
          setPendingWeeks(gaps);
          setShowPendingDialog(true);
          return;
        }
      } catch {
        toast.error(t('staff.pendingHoursCheckError'));
        return;
      }
    }

    const payload = {
      first_name: data.first_name,
      last_name: data.last_name,
      short_name: data.short_name || undefined,
      initials: data.initials || undefined,
      email: data.email,
      category_id: data.category_id,
      city: data.city,
      id_number: data.id_number,
      aud_reg_number: data.aud_reg_number || undefined,
      hire_date: data.hire_date || null,
      termination_date: data.termination_date || null,
      is_active: data.is_active,
    };
    
    if (isEdit && staff) {
      await updateMutation.mutateAsync({ id: staff.staff_id, data: payload });

      // Sync competencies: diff by skill_id (final-state approach)
      const submitted = data.competencies ?? [];
      const originals = staff.staff_skills ?? [];

      const toDelete = originals.filter((o) => !submitted.some((s) => s.skill_id === o.skill_id));
      const toUpdate = submitted.filter((s) =>
        originals.some(
          (o) =>
            o.skill_id === s.skill_id &&
            (o.proficiency_level !== s.proficiency_level || o.last_evaluated_date !== s.last_evaluated_date)
        )
      );
      const toInsert = submitted.filter((s) => !originals.some((o) => o.skill_id === s.skill_id));

      try {
        for (const row of toDelete) {
          await deleteCompetency.mutateAsync(row.staff_skill_id);
        }
        for (const row of toUpdate) {
          const orig = originals.find((o) => o.skill_id === row.skill_id)!;
          await updateCompetency.mutateAsync({
            id: orig.staff_skill_id,
            data: { proficiency_level: row.proficiency_level, last_evaluated_date: row.last_evaluated_date },
          });
        }
        for (const row of toInsert) {
          await createCompetency.mutateAsync({
            staff_id: staff.staff_id,
            skill_id: row.skill_id,
            proficiency_level: row.proficiency_level,
            last_evaluated_date: row.last_evaluated_date || null,
          });
        }
      } catch (err) {
        console.error("[StaffForm] Competency save failed:", err);
        toast.error(t("staff.competencies.errors.partialSave"));
        return; // Stay on form; do NOT proceed on partial competency save
      }
      // FASE 3c: se eliminó el sync categoría→rol. La categoría ya no cambia el
      // rol del usuario (Opción C: el rol directo manda; la categoría es negocio).
    } else {
      // Create staff first, then insert competencies with rollback on failure
      const newStaff = await createMutation.mutateAsync(payload);
      const newStaffId = (newStaff as { staff_id: string }).staff_id;

      if (data.competencies && data.competencies.length > 0) {
        try {
          for (const row of data.competencies) {
            await createCompetency.mutateAsync({
              staff_id: newStaffId,
              skill_id: row.skill_id,
              proficiency_level: row.proficiency_level,
              last_evaluated_date: row.last_evaluated_date || null,
            });
          }
        } catch {
          // Attempt rollback: delete the just-created staff record
          try {
            await supabase.from("staff").delete().eq("staff_id", newStaffId);
            toast.error(t("staff.competencies.errors.partialSave"));
          } catch {
            toast.error(t("staff.competencies.errors.partialSave"));
          }
          return;
        }
      }
    }

    if (onSaveSuccess) {
      onSaveSuccess();
    } else {
      navigate("/staff");
    }
  };

  const handleDelete = async () => {
    if (staff) {
      await deleteMutation.mutateAsync(staff.staff_id);
      if (onSaveSuccess) {
        onSaveSuccess();
      } else {
        navigate("/staff");
      }
    }
  };

  const totalMissingHours = pendingWeeks.reduce((sum, w) => sum + w.gap, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {isEdit ? t("staff.editStaff") : t("staff.newStaff")}
        </h1>
        {isEdit && can("staff.delete") && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("common.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("staff.deleteStaff")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("common.confirmDelete", { name: `${staff?.first_name} ${staff?.last_name}` })}
                  <br />
                  <span className="text-sm text-muted-foreground mt-2 block">
                    {t("staff.deleteExplanation")}
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive/70 text-destructive-foreground hover:bg-destructive">
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
            console.error("[StaffForm] Validation failed:", errors);
            const firstMessage = findFirstErrorMessage(errors);
            toast.error(firstMessage ?? t("validation.formInvalid"));
          })} className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.personalInfo")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.firstName")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="John" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.lastName")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="short_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.shortName")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("staff.shortNamePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="initials"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.initials")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("staff.initialsPlaceholder")} maxLength={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.email")} *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john.doe@example.com" {...field} disabled={isEdit} className={isEdit ? "bg-muted" : ""} />
                    </FormControl>
                    <FormMessage />
                    {isEdit && staff?.auth_user_id && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {t('staff.emailLinkedWarning')}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.city")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("staff.selectCity")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="La Paz">La Paz</SelectItem>
                          <SelectItem value="Santa Cruz">Santa Cruz</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="id_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.idNumber")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="12345678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="aud_reg_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.audRegNumber")}</FormLabel>
                      <FormControl>
                        <Input placeholder="AUD-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hire_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.hireDate")} *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        {t("staff.hireDateHelp")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Termination Date - only in edit mode */}
              {isEdit && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="termination_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("staff.terminationDate")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("staff.terminationDateHelp")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.role")}</h3>
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.category")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("staff.selectCategory")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories?.map((cat) => (
                          <SelectItem key={cat.category_id} value={cat.category_id}>
                            {cat.category_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t("common.active")}</FormLabel>
                      <FormDescription>
                        {isEdit ? t("staff.activeDescription") : t("staff.activeDescriptionNew")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          // BUG 0526-123: OFF->ON on a staff row that has a recorded
                          // termination_date opens a confirmation dialog. Detection
                          // uses the SAVED staff prop (not the live form value) so
                          // an admin cannot bypass the dialog by clearing the date
                          // field first. The DB guard TERMINATION_DATE_IMMUTABLE
                          // refuses any save that nulls the date during reactivation.
                          if (
                            checked &&
                            field.value === false &&
                            isEdit &&
                            !!staff?.termination_date
                          ) {
                            setShowReactivateDialog(true);
                            return;
                          }
                          field.onChange(checked);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Account security section — admin only, edit mode, auth-linked users */}
            {isEdit && isAdmin && staff?.auth_user_id && (
              <div className="space-y-4">
                <h3 className="font-medium text-lg">{t("staff.accountSecurity")}</h3>
                <div className={`flex items-center justify-between rounded-lg border p-4 ${staff?.is_blocked ? 'border-destructive/40 bg-destructive/5' : ''}`}>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      {staff?.is_blocked
                        ? <Lock className="h-4 w-4 text-destructive" />
                        : <LockOpen className="h-4 w-4 text-muted-foreground" />
                      }
                      <span className="text-base font-medium">
                        {staff?.is_blocked ? t("staff.blocked") : t("staff.notBlocked")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {staff?.is_blocked
                        ? t("staff.blockedDescription")
                        : t("staff.notBlockedDescription")}
                    </p>
                  </div>
                  {staff?.is_blocked && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowUnblockDialog(true)}
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      {t("staff.unblockAction")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Competencies section */}
            <div className="space-y-3">
              <h3 className="font-medium text-lg">{t("staff.competencies.title")}</h3>

              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border min-w-[240px]">
                          {t("staff.competencies.name")} *
                        </th>
                        <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border w-36">
                          {t("staff.competencies.level")} *
                        </th>
                        <th className="text-left p-2 font-semibold text-xs text-muted-foreground border-r border-border w-44">
                          {t("staff.competencies.verifiedDate")} *
                        </th>
                        <th className="w-12 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {competencyFields.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-sm text-muted-foreground border-b border-border">
                            {t("staff.competencies.empty")}
                          </td>
                        </tr>
                      )}

                      {competencyFields.map((field, index) => {
                        const usedSkillIds = new Set(
                          form.getValues("competencies")
                            .filter((_, i) => i !== index)
                            .map((c) => c.skill_id)
                            .filter(Boolean)
                        );

                        const currentSkillId = field.skill_id;
                        const currentSkillIsInactive =
                          currentSkillId &&
                          activeSkills &&
                          !activeSkills.some((s) => s.skill_id === currentSkillId);
                        const inactiveSkillName =
                          currentSkillIsInactive && staff?.staff_skills
                            ? staff.staff_skills.find((ss) => ss.skill_id === currentSkillId)?.skill?.name
                            : undefined;

                        return (
                          <tr key={field.id} className="border-b border-border hover:bg-muted/30">
                            <td className="p-2 border-r border-border align-top">
                              <FormField
                                control={form.control}
                                name={`competencies.${index}.skill_id`}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <Select onValueChange={f.onChange} value={f.value}>
                                      <FormControl>
                                        <SelectTrigger className="border-0 bg-transparent focus:ring-1 h-9 shadow-none">
                                          <SelectValue placeholder={t("staff.competencies.errors.required")} />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {currentSkillIsInactive && inactiveSkillName && (
                                          <SelectItem value={currentSkillId!}>{inactiveSkillName}</SelectItem>
                                        )}
                                        {(activeSkills ?? [])
                                          .filter((s) => !usedSkillIds.has(s.skill_id))
                                          .map((s) => {
                                            const catKey = `skill.categories.${s.category}`;
                                            const catLabel = t(catKey, { defaultValue: s.category });
                                            return (
                                              <SelectItem key={s.skill_id} value={s.skill_id}>
                                                {s.name} — {catLabel}
                                              </SelectItem>
                                            );
                                          })}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </td>

                            <td className="p-2 border-r border-border align-top">
                              <FormField
                                control={form.control}
                                name={`competencies.${index}.proficiency_level`}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <Select onValueChange={f.onChange} value={f.value}>
                                      <FormControl>
                                        <SelectTrigger className="border-0 bg-transparent focus:ring-1 h-9 shadow-none">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {PROFICIENCY_LEVELS.map((level) => (
                                          <SelectItem key={level} value={level}>
                                            {t(`staff.competencies.levels.${level.toLowerCase()}`)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </td>

                            <td className="p-2 border-r border-border align-top">
                              <FormField
                                control={form.control}
                                name={`competencies.${index}.last_evaluated_date`}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="date"
                                        max={todayISO()}
                                        className="border-0 bg-transparent focus:bg-background focus:ring-1 h-9 shadow-none"
                                        {...f}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </td>

                            <td className="p-2 text-center align-middle">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeCompetency(index)}
                                aria-label={t("staff.competencies.remove")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}

                      <tr>
                        <td colSpan={4} className="p-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full text-muted-foreground hover:text-foreground rounded-none h-10"
                            onClick={() =>
                              appendCompetency({
                                _key: crypto.randomUUID(),
                                staff_skill_id: undefined,
                                skill_id: "",
                                proficiency_level: "Beginner",
                                last_evaluated_date: todayISO(),
                              })
                            }
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            {t("staff.competencies.addButton")}
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
              <Button type="button" variant="cancel" onClick={() => onCancel ? onCancel() : navigate("/staff")} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>
              <LoadingButton
                type="submit"
                variant="default"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={createMutation.isPending || updateMutation.isPending || createCompetency.isPending || updateCompetency.isPending || deleteCompetency.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("staff.createStaff")}
              </LoadingButton>
            </div>
          </form>
        </Form>
      </div>

      {/* Pending Hours Dialog */}
      <Dialog open={showPendingDialog} onOpenChange={setShowPendingDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("staff.pendingHoursTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("staff.pendingHoursDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-sm table-dense">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 px-2">{t("staff.weekOf")}</th>
                  <th className="text-right py-1.5 px-2">{t("staff.expected")}</th>
                  <th className="text-right py-1.5 px-2">{t("staff.actual")}</th>
                  <th className="text-right py-1.5 px-2">{t("staff.gap")}</th>
                </tr>
              </thead>
              <tbody>
                {pendingWeeks.map((week) => (
                  <tr key={week.week_start} className="border-b">
                    <td className="py-1.5 px-2">{week.week_start}</td>
                    <td className="text-right py-1.5 px-2">{Number(week.expected_hours).toFixed(1)}</td>
                    <td className="text-right py-1.5 px-2">{Number(week.actual_hours).toFixed(1)}</td>
                    <td className="text-right py-1.5 px-2 text-destructive font-medium">{Number(week.gap).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-1.5 px-2" colSpan={3}>{t("staff.totalMissing")}</td>
                  <td className="text-right py-1.5 px-2 text-destructive">{totalMissingHours.toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <DialogFooter>
            <Button variant="cancel" onClick={() => setShowPendingDialog(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivation Confirmation Dialog (BUG 0526-123) */}
      <Dialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              {t("staff.reactivateTitle")}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 leading-relaxed">
                <p>
                  {t("staff.reactivateDescriptionDate", {
                    date: staff?.termination_date
                      ? formatFullDate(
                          fromISODateString(staff.termination_date),
                          i18n.language,
                        )
                      : "",
                  })}
                </p>
                <p>{t("staff.reactivateDescriptionDetails")}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="cancel" onClick={() => setShowReactivateDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                // Restore the saved termination_date only when the admin
                // cleared the field — the DB rejects nulling it
                // (TERMINATION_DATE_IMMUTABLE). If they changed it to another
                // non-empty date, respect that correction.
                const currentDate = form.getValues("termination_date");
                if (staff?.termination_date && !currentDate) {
                  form.setValue("termination_date", staff.termination_date, {
                    shouldDirty: true,
                  });
                }
                form.setValue("is_active", true, { shouldDirty: true });
                setShowReactivateDialog(false);
              }}
            >
              {t("staff.reactivateConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock Confirmation Dialog (BUG 0601-132) */}
      <Dialog open={showUnblockDialog} onOpenChange={(open) => !isUnblocking && setShowUnblockDialog(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5 text-primary" />
              {t("staff.unblockConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("staff.unblockConfirmDescription", {
                name: staff ? `${staff.first_name} ${staff.last_name}` : '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="cancel"
              onClick={() => setShowUnblockDialog(false)}
              disabled={isUnblocking}
            >
              {t("common.cancel")}
            </Button>
            <LoadingButton
              onClick={handleUnblock}
              loading={isUnblocking}
            >
              {t("staff.unblockConfirmButton")}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
