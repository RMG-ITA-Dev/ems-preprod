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
import { Trash2, AlertTriangle, RefreshCw, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUpdateUserRole } from "@/hooks/useUserRoles";
import { Database } from "@/integrations/supabase/types";
import { PROFICIENCY_LEVELS, type ProficiencyLevel } from "@/integrations/supabase/customTypes";

const todayISO = () => new Date().toISOString().split("T")[0];

type AppRole = Database["public"]["Enums"]["app_role"];

const createFormSchema = (t: TFunction) =>
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
  const { data: categories } = useCategories();
  const { data: activeSkills } = useActiveSkills();
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();
  const updateRoleMutation = useUpdateUserRole();
  const createCompetency = useCreateStaffCompetency();
  const updateCompetency = useUpdateStaffCompetency();
  const deleteCompetency = useDeleteStaffCompetency();

  // Tracks skill_ids of competencies that existed when the edit form was loaded
  const originalSkillIds = useRef<Set<string>>(new Set());

  // Pending hours dialog state
  const [pendingWeeks, setPendingWeeks] = useState<PendingWeek[]>([]);
  const [showPendingDialog, setShowPendingDialog] = useState(false);

  // Role sync dialog state
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncData, setSyncData] = useState<{ userId: string; newRole: AppRole } | null>(null);

  const formSchema = useMemo(() => createFormSchema(t), [t, i18n.language]);

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
  const watchIsActive = form.watch("is_active");
  const watchTerminationDate = form.watch("termination_date");

  // No-Reingreso: block reactivation for deactivated staff with termination_date
  const isReactivationBlocked = isEdit && staff && !staff.is_active && !!staff.termination_date;

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

  // Auto-set termination_date when toggling is_active from true to false
  useEffect(() => {
    if (isEdit && staff?.is_active && !watchIsActive && !watchTerminationDate) {
      form.setValue("termination_date", new Date().toISOString().split("T")[0]);
    }
  }, [watchIsActive, isEdit, staff?.is_active, watchTerminationDate, form]);

  const onConfirmSync = async () => {
    if (syncData) {
      try {
        await updateRoleMutation.mutateAsync({ 
          userId: syncData.userId, 
          newRole: syncData.newRole,
          reason: "Category change sync"
        });
        toast.success(t("staff.roleSynced"));
      } catch (error) {
        toast.error(t("staff.roleSyncError"));
      }
    }
    setShowSyncDialog(false);
    if (onSaveSuccess) {
      onSaveSuccess();
    } else {
      navigate("/staff");
    }
  };

  const onSkipSync = () => {
    setShowSyncDialog(false);
    if (onSaveSuccess) {
      onSaveSuccess();
    } else {
      navigate("/staff");
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

    // Pre-save duplicate id_number check
    if (data.id_number) {
      const { data: existingIdNum } = await supabase
        .from('staff')
        .select('staff_id, first_name, last_name')
        .eq('id_number', data.id_number)
        .is('deleted_at', null)
        .neq('staff_id', staff?.staff_id || '')
        .limit(1);

      if (existingIdNum && existingIdNum.length > 0) {
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
      } catch {
        toast.error(t("staff.competencies.errors.partialSave"));
        return; // Stay on form; do NOT open role-sync dialog
      }

      // Check for category change sync if staff is auth-linked
      if (staff.auth_user_id && staff.category_id !== data.category_id) {
        const newCategory = categories?.find(c => c.category_id === data.category_id);
        const targetRole = newCategory?.default_app_role as AppRole | null;

        if (targetRole) {
          // Check current role
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", staff.auth_user_id)
            .single();

          if (roleData?.role === 'admin' && targetRole !== 'admin') {
            toast.info(t("staff.adminRoleProtected"));
          } else if (roleData?.role !== targetRole) {
            setSyncData({ userId: staff.auth_user_id, newRole: targetRole });
            setShowSyncDialog(true);
            return; // Stop navigation until dialog resolved
          }
        }
      }
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
        {isEdit && (
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        {isReactivationBlocked
                          ? t("errors.noReingreso")
                          : isEdit ? t("staff.activeDescription") : t("staff.activeDescriptionNew")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isReactivationBlocked}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Competencies section */}
            <div className="space-y-3">
              <h3 className="font-medium text-lg">{t("staff.competencies.title")}</h3>

              {competencyFields.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t("staff.competencies.empty")}</p>
              ) : (
                <div className="space-y-2">
                  {/* Table header — hidden on mobile */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_160px_160px_36px] gap-2 px-1">
                    <span className="text-xs text-muted-foreground">{t("staff.competencies.name")} *</span>
                    <span className="text-xs text-muted-foreground">{t("staff.competencies.level")} *</span>
                    <span className="text-xs text-muted-foreground">{t("staff.competencies.verifiedDate")} *</span>
                    <span />
                  </div>

                  {competencyFields.map((field, index) => {
                    // Skills already chosen in other rows (excluding this row)
                    const usedSkillIds = new Set(
                      form.getValues("competencies")
                        .filter((_, i) => i !== index)
                        .map((c) => c.skill_id)
                        .filter(Boolean)
                    );

                    // For existing rows with an inactive skill, show that skill even though
                    // it won't appear in the active list for new rows
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
                      <div
                        key={field.id}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_160px_160px_36px] gap-2 sm:items-center items-start border rounded-md p-2 sm:border-0 sm:p-0"
                      >
                        {/* Competency select */}
                        <FormField
                          control={form.control}
                          name={`competencies.${index}.skill_id`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="sm:hidden text-xs">{t("staff.competencies.name")} *</FormLabel>
                              <Select
                                onValueChange={f.onChange}
                                value={f.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t("staff.competencies.errors.required")} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {/* Show inactive assigned skill in its own item */}
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

                        {/* Level select */}
                        <FormField
                          control={form.control}
                          name={`competencies.${index}.proficiency_level`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="sm:hidden text-xs">{t("staff.competencies.level")} *</FormLabel>
                              <Select onValueChange={f.onChange} value={f.value}>
                                <FormControl>
                                  <SelectTrigger>
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

                        {/* Verification date */}
                        <FormField
                          control={form.control}
                          name={`competencies.${index}.last_evaluated_date`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="sm:hidden text-xs">{t("staff.competencies.verifiedDate")} *</FormLabel>
                              <FormControl>
                                <Input type="date" max={todayISO()} {...f} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Remove button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-destructive"
                          onClick={() => removeCompetency(index)}
                          aria-label={t("staff.competencies.remove")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
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

      {/* Role Sync Dialog */}
      <Dialog open={showSyncDialog} onOpenChange={(open) => !open && onSkipSync()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              {t("staff.syncRoleTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("staff.syncRoleMessage", { role: syncData ? t(`userRoles.roles.${syncData.newRole}`) : '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="cancel" onClick={onSkipSync}>
              {t("staff.syncRoleSkip")}
            </Button>
            <Button onClick={onConfirmSync}>
              {t("staff.syncRoleConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
