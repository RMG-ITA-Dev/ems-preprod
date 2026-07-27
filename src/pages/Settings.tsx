import { useState, useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCategories,
  useIndustries,
  useGlobalSettings,
  useAllActivityCodes,
  useExpenseTypes,
  useSkills,
  useEngagements,
  useServices,
  useTaxonomies,
  Category,
  Industry,
  ActivityCode,
  ExpenseType,
  Skill,
  Service,
  Taxonomy,
} from "@/hooks/useEmsData";
import { useUpdateGlobalSetting, useReorderServiceActivity, useMoveCategory, useCopyCategories } from "@/hooks/mutations";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useLanguage } from "@/hooks/useLanguage";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { IndustryForm } from "@/components/forms/IndustryForm";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { ActivityCodeForm } from "@/components/forms/ActivityCodeForm";
import { ExpenseTypeForm } from "@/components/forms/ExpenseTypeForm";
import { SkillForm } from "@/components/forms/SkillForm";
import { ServiceForm } from "@/components/forms/ServiceForm";
import { TaxonomyForm } from "@/components/forms/TaxonomyForm";
import { UserRolesManager } from "@/components/settings/UserRolesManager";
import { ChangePasswordCard } from "@/components/settings/ChangePasswordCard";
import { HolidaysManager } from "@/components/settings/HolidaysManager";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, CheckCircle, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { formatFiscalYearEnd } from "@/lib/fiscalYearDisplay";
import { useHolidayEngagementId } from "@/hooks/useHolidays";
import { toast } from "sonner";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

interface RpcUpdateResult {
  success?: boolean;
  updated?: number;
  error_code?: string;
  [key: string]: unknown;
}

const Settings = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { can, roleKey } = useAuthorization();
  const isAdmin = roleKey === "admin";
  // Visibilidad de tabs por permiso (Fase 5 · roles/permisos)
  const canSkillsTab = can("competency.read");
  const canSkillsWrite = can("competency.create");
  const canHolidaysTab = can("holiday.create");
  const canRolesTab = can("user_role.read");
  const canGlobalTab = can("global_settings.update");
  const canIndustryWrite = can("industry.create");
  const canRatesWrite = can("category_rate.create");
  const canActivitiesWrite = can("activity_code.create");
  const canExpenseWrite = can("expense_type.create");
  const { currentLanguage } = useLanguage();
  
  const { data: industries, isLoading: industriesLoading } = useIndustries();
  const { data: settings, isLoading: settingsLoading } = useGlobalSettings();
  const { data: activityCodes, isLoading: activitiesLoading } = useAllActivityCodes();
  const { data: expenseTypes, isLoading: expenseTypesLoading } = useExpenseTypes();
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: services, isLoading: servicesLoading } = useServices();
  const { data: taxonomies, isLoading: taxonomiesLoading } = useTaxonomies();
  const { data: engagements } = useEngagements();
  const persistedHolidayEngagementId = useHolidayEngagementId();
  const updateSettingMutation = useUpdateGlobalSetting();
  const reorderActivityMutation = useReorderServiceActivity();
  const moveCategoryMutation = useMoveCategory();
  const copyCategoriesMutation = useCopyCategories();

  // ── Category rates: service-scoped filter (default Auditoría) ──────────────
  const ratesServices = useMemo(
    () => (services ?? []).filter((s) => s.is_active && s.allows_rates_activities),
    [services]
  );
  const [ratesServiceId, setRatesServiceId] = useState<string>("");
  useEffect(() => {
    if (!ratesServiceId && ratesServices.length > 0) {
      const auditoria = ratesServices.find((s) => s.code === 1) ?? ratesServices[0];
      setRatesServiceId(auditoria.service_id);
    }
  }, [ratesServices, ratesServiceId]);

  const { data: categories, isLoading: categoriesLoading } = useCategories(ratesServiceId || undefined);

  // Copy-categories dialog state.
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetId, setCopyTargetId] = useState<string>("");
  const [copyNeedsReplace, setCopyNeedsReplace] = useState(false);

  // Active service-linked activities grouped by service, ordered by code.
  // Used to compute the 1-based position of each row for the ↑/↓ controls.
  const activeActivitiesByService = useMemo(() => {
    const map = new Map<string, string[]>();
    (activityCodes ?? [])
      .filter((a) => a.is_active && a.service_id)
      .slice()
      .sort((a, b) => {
        const n = (code: string) => parseInt(code.match(/(\d+)$/)?.[1] ?? "0", 10);
        return n(a.activity_code) - n(b.activity_code);
      })
      .forEach((a) => {
        const arr = map.get(a.service_id!) ?? [];
        arr.push(a.activity_id);
        map.set(a.service_id!, arr);
      });
    return map;
  }, [activityCodes]);

  // Controlled tab state
  const [activeTab, setActiveTab] = useState("account");
  const isGlobalTabActive = activeTab === "global";

  // Form states
  const [industryFormOpen, setIndustryFormOpen] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null);

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityCode | null>(null);

  const [expenseTypeFormOpen, setExpenseTypeFormOpen] = useState(false);
  const [selectedExpenseType, setSelectedExpenseType] = useState<ExpenseType | null>(null);

  const [skillFormOpen, setSkillFormOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const [taxonomyFormOpen, setTaxonomyFormOpen] = useState(false);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<Taxonomy | null>(null);

  // Settings state
  const [taxRate, setTaxRate] = useState<string>("");
  const [dailyMin, setDailyMin] = useState<string>("");
  const [dailyMax, setDailyMax] = useState<string>("");
  const [weeklyMin, setWeeklyMin] = useState<string>("");
  const [weeklyMax, setWeeklyMax] = useState<string>("");
  const [language, setLanguage] = useState<string>("en");
  const [allowWeekendTracking, setAllowWeekendTracking] = useState<boolean>(false);
  const [compactFont, setCompactFont] = useState<boolean>(false);
  const [allowedEmailDomain, setAllowedEmailDomain] = useState<string>("");
  const [realizationLimit, setRealizationLimit] = useState<string>("");
  const [holidayEngagementId, setHolidayEngagementId] = useState<string>("");
  const [maxFailedAttempts, setMaxFailedAttempts] = useState<string>("");
  const [lockoutMinutes, setLockoutMinutes] = useState<string>("");

  const getSetting = useCallback(
    (key: string) => settings?.find((s) => s.setting_key === key)?.setting_value || "",
    [settings]
  );

  useEffect(() => {
    if (settings) {
      const langSetting = settings.find((s) => s.setting_key === "LANGUAGE");
      if (langSetting) {
        setLanguage(langSetting.setting_value);
      }
      const weekendSetting = settings.find((s) => s.setting_key === "ALLOW_WEEKEND_TRACKING");
      if (weekendSetting) {
        setAllowWeekendTracking(weekendSetting.setting_value === "true");
      }
      const compactFontSetting = settings.find((s) => s.setting_key === "COMPACT_FONT");
      if (compactFontSetting) {
        setCompactFont(compactFontSetting.setting_value === "true");
      }
      const emailDomainSetting = settings.find((s) => s.setting_key === "ALLOWED_EMAIL_DOMAIN");
      if (emailDomainSetting) {
        setAllowedEmailDomain(emailDomainSetting.setting_value);
      }
      const realizationSetting = settings.find((s) => s.setting_key === "REALIZATION_LIMIT");
      if (realizationSetting) {
        setRealizationLimit(realizationSetting.setting_value);
      }
      const holidayEngagementSetting = settings.find((s) => s.setting_key === "HOLIDAY_ENGAGEMENT_ID");
      setHolidayEngagementId(holidayEngagementSetting?.setting_value ?? "");
      const maxAttemptsSetting = settings.find((s) => s.setting_key === "AUTH_MAX_FAILED_ATTEMPTS");
      if (maxAttemptsSetting) setMaxFailedAttempts(maxAttemptsSetting.setting_value);
      const lockoutMinutesSetting = settings.find((s) => s.setting_key === "AUTH_LOCKOUT_MINUTES");
      if (lockoutMinutesSetting) setLockoutMinutes(lockoutMinutesSetting.setting_value);
    }
  }, [settings]);

  // isGlobalDirty computation
  const isGlobalDirty = useMemo(() => {
    if (!settings) return false;
    const persistedLang = getSetting("LANGUAGE") || "en";
    const persistedWeekend = getSetting("ALLOW_WEEKEND_TRACKING") === "true";
    const persistedCompact = getSetting("COMPACT_FONT") === "true";
    const persistedDomain = getSetting("ALLOWED_EMAIL_DOMAIN") || "";
    const persistedTax = (parseFloat(getSetting("TAX_RATE") || "0.13") * 100).toString();
    const persistedRealization = getSetting("REALIZATION_LIMIT") || "75";
    const persistedDailyMin = getSetting("DAILY_MIN") || "8";
    const persistedDailyMax = getSetting("DAILY_MAX") || "8";
    const persistedWeeklyMin = getSetting("WEEKLY_MIN") || "40";
    const persistedWeeklyMax = getSetting("WEEKLY_MAX") || "40";
    const persistedHolidayEngagement = getSetting("HOLIDAY_ENGAGEMENT_ID") || "";
    const persistedMaxAttempts = getSetting("AUTH_MAX_FAILED_ATTEMPTS") || "5";
    const persistedLockoutMinutes = getSetting("AUTH_LOCKOUT_MINUTES") || "15";

    return (
      language !== persistedLang ||
      allowWeekendTracking !== persistedWeekend ||
      compactFont !== persistedCompact ||
      allowedEmailDomain !== persistedDomain ||
      holidayEngagementId !== persistedHolidayEngagement ||
      (taxRate !== "" && taxRate !== persistedTax) ||
      (realizationLimit !== "" && realizationLimit !== persistedRealization) ||
      (dailyMin !== "" && dailyMin !== persistedDailyMin) ||
      (dailyMax !== "" && dailyMax !== persistedDailyMax) ||
      (weeklyMin !== "" && weeklyMin !== persistedWeeklyMin) ||
      (weeklyMax !== "" && weeklyMax !== persistedWeeklyMax) ||
      (maxFailedAttempts !== "" && maxFailedAttempts !== persistedMaxAttempts) ||
      (lockoutMinutes !== "" && lockoutMinutes !== persistedLockoutMinutes)
    );
  }, [settings, getSetting, language, allowWeekendTracking, compactFont, allowedEmailDomain,
      holidayEngagementId, taxRate, realizationLimit, dailyMin, dailyMax, weeklyMin, weeklyMax,
      maxFailedAttempts, lockoutMinutes]);

  // Navigation lock - only when global tab is active
  const { blocker } = usePageLeaveLock({
    locked: isGlobalTabActive,
    isDirty: isGlobalTabActive && isGlobalDirty,
  });

  // Cancel handler for global tab
  const handleCancelGlobal = () => {
    setLanguage(getSetting("LANGUAGE") || "en");
    setAllowWeekendTracking(getSetting("ALLOW_WEEKEND_TRACKING") === "true");

    const persistedCompact = getSetting("COMPACT_FONT") === "true";
    setCompactFont(persistedCompact);
    document.documentElement.dataset.compactFont = persistedCompact ? "true" : "false";

    setAllowedEmailDomain(getSetting("ALLOWED_EMAIL_DOMAIN") || "");
    setHolidayEngagementId(getSetting("HOLIDAY_ENGAGEMENT_ID") || "");
    setTaxRate("");
    setRealizationLimit("");
    setDailyMin("");
    setDailyMax("");
    setWeeklyMin("");
    setWeeklyMax("");
    setMaxFailedAttempts("");
    setLockoutMinutes("");

    setActiveTab("account");
  };

  // Industry columns
  const industryColumns: Column<Industry>[] = [
    { key: "industry_name", label: t("industry.name"), sortable: true, mobilePriority: 'primary' },
    {
      key: "fiscal_year_end",
      label: t("industry.fiscalYearEnd"),
      sortable: true,
      mobilePriority: 'primary',
      render: (row) => formatFiscalYearEnd(row.fiscal_year_end, i18n.language),
    },
    {
      key: "default_season",
      label: t("industry.defaultSeason"),
      mobilePriority: 'secondary',
      render: (row) => {
        const isHigh = row.fiscal_year_end.includes("December");
        return (
          <span className={isHigh ? "text-accent font-medium" : "text-muted-foreground"}>
            {isHigh ? t("industry.high") : t("industry.low")}
          </span>
        );
      },
    },
  ];

  // Skill columns
  const skillColumns: Column<Skill>[] = [
    { key: "name", label: t("skill.name"), sortable: true, mobilePriority: 'primary' },
    {
      key: "category",
      label: t("skill.category"),
      sortable: true,
      mobilePriority: 'primary',
      render: (row) => t(`skill.categories.${row.category}`),
    },
    {
      key: "is_active",
      label: t("activity.status"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge
          variant="outline"
          className={
            row.is_active
              ? "bg-success/10 text-success border-success/20"
              : "bg-muted text-muted-foreground"
          }
        >
          {row.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
      ),
    },
  ];

  // Category columns
  const categoryColumns: Column<Category>[] = [
    { key: "display_order", label: t("category.order"), sortable: true, className: "w-20", mobilePriority: 'secondary' },
    { key: "category_name", label: t("category.name"), sortable: true, mobilePriority: 'primary' },
    {
      key: "can_approve_wo",
      label: t("category.canApproveWO"),
      sortable: true,
      className: "w-28 text-center",
      mobilePriority: 'secondary',
      render: (row) =>
        row.can_approve_wo ? (
          <Badge className="bg-success/10 text-success border-success/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            {t("common.yes")}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "rate_high_bob",
      label: t("category.bobHigh"),
      sortable: true,
      className: "text-right",
      mobilePriority: 'primary',
      render: (row) => Math.round(row.rate_high_bob).toLocaleString("es-BO", { maximumFractionDigits: 0 }),
    },
    {
      key: "rate_low_bob",
      label: t("category.bobLow"),
      sortable: true,
      className: "text-right",
      mobilePriority: 'secondary',
      render: (row) => Math.round(row.rate_low_bob).toLocaleString("es-BO", { maximumFractionDigits: 0 }),
    },
    {
      key: "rate_high_usd",
      label: t("category.usdHigh"),
      sortable: true,
      className: "text-right",
      mobilePriority: 'secondary',
      render: (row) => Math.round(row.rate_high_usd).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    },
    {
      key: "rate_low_usd",
      label: t("category.usdLow"),
      sortable: true,
      className: "text-right",
      mobilePriority: 'secondary',
      render: (row) => Math.round(row.rate_low_usd).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    },
    {
      key: "reorder",
      label: "",
      sortable: false,
      className: "w-24",
      mobilePriority: 'secondary',
      render: (row) => {
        // ↑/↓ reorder within the selected service. Categories are a gap-free
        // 1..N sequence, so display_order is the 1-based position.
        // Wait for ratesServiceId before computing total — otherwise
        // useCategories(undefined) can return ALL services' categories while
        // pos is per-service, mismatching the bounds check.
        if (!isAdmin || !ratesServiceId) return null;
        const total = (categories ?? []).length;
        const pos = row.display_order;
        if (total < 2) return null;
        return (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={pos <= 1 || moveCategoryMutation.isPending}
              aria-label={t("category.moveUp")}
              onClick={(e) => {
                e.stopPropagation();
                moveCategoryMutation.mutate({ categoryId: row.category_id, newPosition: pos - 1 });
              }}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={pos >= total || moveCategoryMutation.isPending}
              aria-label={t("category.moveDown")}
              onClick={(e) => {
                e.stopPropagation();
                moveCategoryMutation.mutate({ categoryId: row.category_id, newPosition: pos + 1 });
              }}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // Activity code columns
  const activityColumns: Column<ActivityCode>[] = [
    { key: "activity_code", label: t("activity.code"), sortable: true, className: "font-mono w-24", mobilePriority: 'primary' },
    { key: "description", label: t("activity.description"), sortable: true, mobilePriority: 'primary' },
    {
      key: "service_id",
      label: t("activity.service"),
      sortable: false,
      mobilePriority: 'secondary',
      render: (row) => row.service ? (
        <span className="text-sm">{row.service.name}</span>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      ),
    },
    {
      key: "is_active",
      label: t("activity.status"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge
          variant="outline"
          className={
            row.is_active
              ? "bg-success/10 text-success border-success/20"
              : "bg-muted text-muted-foreground"
          }
        >
          {row.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
      ),
    },
    {
      key: "reorder",
      label: "",
      sortable: false,
      className: "w-24",
      mobilePriority: 'secondary',
      render: (row) => {
        // ↑/↓ only for active service-linked activities; swap code with the
        // adjacent sibling of the same service via reorder_service_activity.
        if (!isAdmin || !row.is_active || !row.service_id) return null;
        const siblings = activeActivitiesByService.get(row.service_id) ?? [];
        const pos = siblings.indexOf(row.activity_id) + 1; // 1-based
        const total = siblings.length;
        if (pos < 1 || total < 2) return null;
        return (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={pos <= 1 || reorderActivityMutation.isPending}
              aria-label={t("activity.moveUp")}
              onClick={(e) => {
                e.stopPropagation();
                reorderActivityMutation.mutate({ activityId: row.activity_id, newPosition: pos - 1 });
              }}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={pos >= total || reorderActivityMutation.isPending}
              aria-label={t("activity.moveDown")}
              onClick={(e) => {
                e.stopPropagation();
                reorderActivityMutation.mutate({ activityId: row.activity_id, newPosition: pos + 1 });
              }}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // Service columns
  const serviceColumns: Column<Service>[] = [
    { key: "code", label: t("service.code"), sortable: true, className: "w-16 font-mono", mobilePriority: 'primary' },
    { key: "name", label: t("service.name"), sortable: true, mobilePriority: 'primary' },
    {
      key: "abbreviation",
      label: t("service.abbreviation"),
      sortable: true,
      className: "font-mono w-20",
      mobilePriority: 'secondary',
      render: (row) => row.abbreviation ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "allows_rates_activities",
      label: t("service.allowsRatesActivities"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant="outline" className={row.allows_rates_activities ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}>
          {row.allows_rates_activities ? t("common.yes") : t("common.no")}
        </Badge>
      ),
    },
    {
      key: "is_active",
      label: t("service.status"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant="outline" className={row.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}>
          {row.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
      ),
    },
  ];

  // Taxonomy columns
  const taxonomyColumns: Column<Taxonomy>[] = [
    { key: "code", label: t("taxonomy.code"), sortable: true, className: "w-24 font-mono", mobilePriority: 'primary' },
    { key: "name", label: t("taxonomy.name"), sortable: true, mobilePriority: 'primary' },
    {
      key: "service_id",
      label: t("taxonomy.service"),
      sortable: false,
      mobilePriority: 'secondary',
      render: (row) => {
        const service = (services || []).find((s) => s.service_id === row.service_id);
        return service ? service.name : t("taxonomy.global");
      },
    },
    {
      key: "is_active",
      label: t("taxonomy.status"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant="outline" className={row.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}>
          {row.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
      ),
    },
  ];

  // Expense type columns
  const expenseTypeColumns: Column<ExpenseType>[] = [
    { key: "expense_name", label: t("expense.name"), sortable: true, mobilePriority: 'primary' },
    {
      key: "default_unit_cost",
      label: t("expense.defaultUnitCost"),
      sortable: true,
      className: "text-right",
      mobilePriority: 'primary',
      render: (row) => Math.round(row.default_unit_cost).toLocaleString("es-BO", { maximumFractionDigits: 0 }),
    },
  ];

  const handleSaveSettings = async () => {
    try {
      // Validate inputs BEFORE any mutateAsync so an invalid value can never
      // leave the save partially committed. Upper bounds mirror
      // record_failed_login() in migration
      // 20260602000001_account_lockout_configurable_settings.sql, which falls
      // back to defaults for values above these limits — reject them here so we
      // never persist a policy the DB will silently ignore.
      const MAX_FAILED_ATTEMPTS_LIMIT = 1000;
      const LOCKOUT_MINUTES_LIMIT = 525600; // 1 year
      let maxFailedAttemptsValue: string | null = null;
      if (maxFailedAttempts) {
        const val = parseInt(maxFailedAttempts, 10);
        if (isNaN(val) || val < 1 || val > MAX_FAILED_ATTEMPTS_LIMIT) {
          toast.error(t("settings.maxFailedAttemptsRangeError"));
          return;
        }
        maxFailedAttemptsValue = val.toString();
      }
      let lockoutMinutesValue: string | null = null;
      if (lockoutMinutes) {
        const val = parseInt(lockoutMinutes, 10);
        if (isNaN(val) || val < 1 || val > LOCKOUT_MINUTES_LIMIT) {
          toast.error(t("settings.lockoutMinutesRangeError"));
          return;
        }
        lockoutMinutesValue = val.toString();
      }

      if (taxRate) {
        await updateSettingMutation.mutateAsync({ key: "TAX_RATE", value: (parseFloat(taxRate) / 100).toString() });
      }
      // Check if any timesheet min/max fields are dirty
      const timesheetMinMaxDirty = dailyMin || dailyMax || weeklyMin || weeklyMax;

      if (timesheetMinMaxDirty) {
        const dMin = parseFloat(dailyMin || getSetting("DAILY_MIN") || "8");
        const dMax = parseFloat(dailyMax || getSetting("DAILY_MAX") || "8");
        const wMin = parseFloat(weeklyMin || getSetting("WEEKLY_MIN") || "40");
        const wMax = parseFloat(weeklyMax || getSetting("WEEKLY_MAX") || "40");
        const wd = allowWeekendTracking ? 6 : 5;

        const { data: result, error: rpcError } = await supabase.rpc(
          "update_timesheet_minmax_settings",
          { p_daily_min: dMin, p_daily_max: dMax, p_weekly_min: wMin, p_weekly_max: wMax, p_work_days: wd }
        );

        if (rpcError) throw rpcError;

        const rpcResult = result as RpcUpdateResult;

        if (rpcResult && !rpcResult.success) {
          const errorKey = {
            DAILY_MIN_EXCEEDS_MAX: "settings.dailyMinMaxError",
            WEEKLY_MIN_EXCEEDS_MAX: "settings.weeklyMinMaxError",
            WEEKLY_MIN_EXCEEDS_DAILY_MAX: "settings.weeklyMinExceedsDailyMax",
            WEEKLY_MAX_BELOW_DAILY_MIN: "settings.weeklyMaxBelowDailyMin",
          }[rpcResult.error_code as string] || "messages.error";
          toast.error(t(errorKey));
          return;
        }
      }
      if (language && isAdmin) {
        await updateSettingMutation.mutateAsync({ key: "LANGUAGE", value: language });
      }
      await updateSettingMutation.mutateAsync({ key: "ALLOW_WEEKEND_TRACKING", value: allowWeekendTracking.toString() });
      await updateSettingMutation.mutateAsync({ key: "COMPACT_FONT", value: compactFont.toString() });
      if (allowedEmailDomain) {
        await updateSettingMutation.mutateAsync({ key: "ALLOWED_EMAIL_DOMAIN", value: allowedEmailDomain.trim() });
      }
      if (realizationLimit) {
        await updateSettingMutation.mutateAsync({ key: "REALIZATION_LIMIT", value: realizationLimit });
      }
      const persistedHolidayEngagement = getSetting("HOLIDAY_ENGAGEMENT_ID") || "";
      if (holidayEngagementId !== persistedHolidayEngagement) {
        await updateSettingMutation.mutateAsync({ key: "HOLIDAY_ENGAGEMENT_ID", value: holidayEngagementId });
      }
      // Persist the lockout values validated at the top of this handler.
      if (maxFailedAttemptsValue !== null) {
        await updateSettingMutation.mutateAsync({ key: "AUTH_MAX_FAILED_ATTEMPTS", value: maxFailedAttemptsValue });
      }
      if (lockoutMinutesValue !== null) {
        await updateSettingMutation.mutateAsync({ key: "AUTH_LOCKOUT_MINUTES", value: lockoutMinutesValue });
      }
      queryClient.invalidateQueries({ queryKey: ["global_settings"] });
      toast.success(t("messages.settingsSaved"));
      setActiveTab("account");
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Copy-categories: available targets are the other rate-bearing services.
  const copyTargetServices = ratesServices.filter((s) => s.service_id !== ratesServiceId);

  const openCopyDialog = () => {
    setCopyTargetId("");
    setCopyNeedsReplace(false);
    setCopyDialogOpen(true);
  };

  const handleCopyCategories = async (replace: boolean) => {
    if (!ratesServiceId || !copyTargetId) return;
    try {
      await copyCategoriesMutation.mutateAsync({
        sourceServiceId: ratesServiceId,
        targetServiceId: copyTargetId,
        replace,
      });
      setCopyDialogOpen(false);
      setCopyNeedsReplace(false);
    } catch (error) {
      // target_not_empty → switch to the replace confirmation; other codes are
      // surfaced as toasts by the mutation's onError.
      if (((error as Error)?.message ?? "").includes("target_not_empty")) {
        setCopyNeedsReplace(true);
      }
    }
  };

  const ratesServiceName = (id: string) =>
    ratesServices.find((s) => s.service_id === id)?.name ?? "";

  return (
    <AppLayout title={t("settings.title")} focusMode={isGlobalTabActive}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="account">{t("settings.account")}</TabsTrigger>
          <TabsTrigger value="industries">{t("settings.industries")}</TabsTrigger>
          {canSkillsTab && (
            <TabsTrigger value="skills">{t("settings.skills")}</TabsTrigger>
          )}
          <TabsTrigger value="rates">{t("settings.categoryRates")}</TabsTrigger>
          <TabsTrigger value="activities">{t("settings.activityCodes")}</TabsTrigger>
          <TabsTrigger value="expense-types">{t("settings.expenseTypes")}</TabsTrigger>
          {canHolidaysTab && (
            <TabsTrigger value="holidays">{t("settings.holidays")}</TabsTrigger>
          )}
          {canRolesTab && (
            <TabsTrigger value="roles">{t("settings.userRoles")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="services">{t("settings.services")}</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="taxonomies">{t("settings.taxonomies")}</TabsTrigger>
          )}
          {canGlobalTab && (
            <TabsTrigger value="global">{t("settings.globalSettings")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="account" className="space-y-6">
          <ChangePasswordCard />
        </TabsContent>

        <TabsContent value="industries" className="space-y-6">
          <DataTable
            data={industries || []}
            columns={industryColumns}
            searchPlaceholder={t("common.search")}
            searchKeys={["industry_name"]}
            isLoading={industriesLoading}
            newButtonLabel={canIndustryWrite ? t("industry.newIndustry") : undefined}
            onNewClick={canIndustryWrite ? () => { setSelectedIndustry(null); setIndustryFormOpen(true); } : undefined}
            onRowClick={canIndustryWrite ? (row) => { setSelectedIndustry(row); setIndustryFormOpen(true); } : undefined}
            getRowId={(row) => row.industry_id}
          />
          <IndustryForm
            open={industryFormOpen}
            onOpenChange={setIndustryFormOpen}
            industry={selectedIndustry}
          />
        </TabsContent>

        {canSkillsTab && (
          <TabsContent value="skills" className="space-y-6">
            <DataTable
              data={skills || []}
              columns={skillColumns}
              searchPlaceholder={t("common.search")}
              searchKeys={["name", "category"]}
              isLoading={skillsLoading}
              newButtonLabel={canSkillsWrite ? t("skill.newSkill") : undefined}
              onNewClick={canSkillsWrite ? () => { setSelectedSkill(null); setSkillFormOpen(true); } : undefined}
              onRowClick={canSkillsWrite ? (row) => { setSelectedSkill(row); setSkillFormOpen(true); } : undefined}
              getRowId={(row) => row.skill_id}
              statusFilter={{
                key: "is_active",
                options: [
                  { value: "active", label: t("status.active") },
                  { value: "inactive", label: t("status.inactive") },
                ],
              }}
            />
            <SkillForm
              open={skillFormOpen}
              onOpenChange={setSkillFormOpen}
              skill={selectedSkill}
            />
          </TabsContent>
        )}

        <TabsContent value="rates" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="ratesServiceFilter">{t("category.service")}</Label>
              <Select value={ratesServiceId} onValueChange={setRatesServiceId}>
                <SelectTrigger id="ratesServiceFilter" className="w-56" data-testid="rates-service-filter">
                  <SelectValue placeholder={t("category.selectService")} />
                </SelectTrigger>
                <SelectContent>
                  {ratesServices.map((s) => (
                    <SelectItem key={s.service_id} value={s.service_id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canRatesWrite && (
              <Button
                type="button"
                variant="outline"
                onClick={openCopyDialog}
                disabled={!ratesServiceId || copyTargetServices.length === 0}
                data-testid="copy-categories-button"
              >
                {t("category.copyFromService")}
              </Button>
            )}
          </div>
          <DataTable
            data={categories || []}
            columns={categoryColumns}
            searchPlaceholder={t("common.search")}
            searchKeys={["category_name"]}
            isLoading={categoriesLoading}
            newButtonLabel={canRatesWrite ? t("category.newCategory") : undefined}
            onNewClick={canRatesWrite ? () => { setSelectedCategory(null); setCategoryFormOpen(true); } : undefined}
            onRowClick={canRatesWrite ? (row) => { setSelectedCategory(row); setCategoryFormOpen(true); } : undefined}
            getRowId={(row) => row.category_id}
          />
          <CategoryForm
            open={categoryFormOpen}
            onOpenChange={setCategoryFormOpen}
            category={selectedCategory}
            serviceId={ratesServiceId}
          />

          {/* Copy categories from the current service into another */}
          <AlertDialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("category.copyFromService")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("category.copySource", { service: ratesServiceName(ratesServiceId) })}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-2">
                <Label htmlFor="copyTarget">{t("category.copyTarget")}</Label>
                <Select
                  value={copyTargetId}
                  onValueChange={(v) => { setCopyTargetId(v); setCopyNeedsReplace(false); }}
                >
                  <SelectTrigger id="copyTarget" data-testid="copy-target-select">
                    <SelectValue placeholder={t("category.selectService")} />
                  </SelectTrigger>
                  <SelectContent>
                    {copyTargetServices.map((s) => (
                      <SelectItem key={s.service_id} value={s.service_id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {copyNeedsReplace && (
                  <Alert variant="destructive" data-testid="copy-replace-warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{t("category.copyReplaceWarning")}</AlertDescription>
                  </Alert>
                )}
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                {copyNeedsReplace ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!copyTargetId || copyCategoriesMutation.isPending}
                    onClick={() => handleCopyCategories(true)}
                    data-testid="copy-replace-confirm"
                  >
                    {t("category.copyReplaceConfirm")}
                  </Button>
                ) : (
                  <AlertDialogAction
                    disabled={!copyTargetId || copyCategoriesMutation.isPending}
                    onClick={(e) => { e.preventDefault(); handleCopyCategories(false); }}
                    data-testid="copy-confirm"
                  >
                    {t("category.copyConfirm")}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="activities" className="space-y-6">
          <DataTable
            data={activityCodes || []}
            columns={activityColumns}
            searchPlaceholder={t("common.search")}
            searchKeys={["activity_code", "description"]}
            isLoading={activitiesLoading}
            newButtonLabel={canActivitiesWrite ? t("activity.newActivity") : undefined}
            onNewClick={canActivitiesWrite ? () => { setSelectedActivity(null); setActivityFormOpen(true); } : undefined}
            onRowClick={canActivitiesWrite ? (row) => { setSelectedActivity(row); setActivityFormOpen(true); } : undefined}
            getRowId={(row) => row.activity_id}
            statusFilter={{
              key: "is_active",
              options: [
                { value: "active", label: t("status.active") },
                { value: "inactive", label: t("status.inactive") },
              ],
            }}
          />
          <ActivityCodeForm
            open={activityFormOpen}
            onOpenChange={setActivityFormOpen}
            activityCode={selectedActivity}
          />
        </TabsContent>

        <TabsContent value="expense-types" className="space-y-6">
          <DataTable
            data={expenseTypes || []}
            columns={expenseTypeColumns}
            searchPlaceholder={t("common.search")}
            searchKeys={["expense_name"]}
            isLoading={expenseTypesLoading}
            newButtonLabel={canExpenseWrite ? t("expense.newExpenseType") : undefined}
            onNewClick={canExpenseWrite ? () => { setSelectedExpenseType(null); setExpenseTypeFormOpen(true); } : undefined}
            onRowClick={canExpenseWrite ? (row) => { setSelectedExpenseType(row); setExpenseTypeFormOpen(true); } : undefined}
            getRowId={(row) => row.expense_type_id}
          />
          <ExpenseTypeForm
            open={expenseTypeFormOpen}
            onOpenChange={setExpenseTypeFormOpen}
            expenseType={selectedExpenseType}
          />
        </TabsContent>

        {canRolesTab && (
          <TabsContent value="roles" className="space-y-6">
            <UserRolesManager />
          </TabsContent>
        )}

        {canGlobalTab && (
          <TabsContent value="global" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {t("settings.globalSettings")}
                  <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                    <Lock className="h-3 w-3 mr-1" />
                    {t("settings.adminOnly")}
                  </Badge>
                </CardTitle>
                <CardDescription>{t("settings.globalDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {settingsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (
                  <>
                    {/* Language Setting */}
                    <div className="space-y-2 pb-4 border-b border-border">
                      <Label htmlFor="language">{t("settings.language")}</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="max-w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">{t("settings.languageHelp")}</p>
                    </div>

                    {/* Compact Font Setting */}
                    <div className="flex items-center justify-between py-4 border-b border-border">
                      <div className="space-y-1">
                        <Label htmlFor="compactFont">{t("settings.compactFont")}</Label>
                        <p className="text-sm text-muted-foreground">{t("settings.compactFontHelp")}</p>
                      </div>
                      <Switch
                        id="compactFont"
                        checked={compactFont}
                        onCheckedChange={(checked) => {
                          setCompactFont(checked);
                          document.documentElement.dataset.compactFont = checked ? "true" : "false";
                        }}
                      />
                    </div>

                    {/* Weekend Tracking Setting */}
                    <div className="flex items-center justify-between py-4 border-b border-border">
                      <div className="space-y-1">
                        <Label htmlFor="weekendTracking">{t("settings.allowWeekendTracking")}</Label>
                        <p className="text-sm text-muted-foreground">{t("settings.allowWeekendTrackingHelp")}</p>
                      </div>
                      <Switch
                        id="weekendTracking"
                        checked={allowWeekendTracking}
                        onCheckedChange={setAllowWeekendTracking}
                      />
                    </div>

                    {/* Allowed Email Domain Setting */}
                    <div className="space-y-2 py-4 border-b border-border">
                      <Label htmlFor="allowedEmailDomain">{t("settings.allowedEmailDomain")}</Label>
                      <Input
                        id="allowedEmailDomain"
                        value={allowedEmailDomain}
                        onChange={(e) => setAllowedEmailDomain(e.target.value)}
                        placeholder="example.com"
                        className="max-w-[300px]"
                      />
                      <p className="text-sm text-muted-foreground">{t("settings.allowedEmailDomainHelp")}</p>
                    </div>

                    {/* Holiday Engagement Setting */}
                    <div className="space-y-2 py-4 border-b border-border">
                      <Label htmlFor="holidayEngagement">{t("settings.holidayEngagement")}</Label>
                      <Select value={holidayEngagementId} onValueChange={setHolidayEngagementId}>
                        <SelectTrigger id="holidayEngagement" className="max-w-md">
                          <SelectValue placeholder={t("timesheet.selectEngagement")} />
                        </SelectTrigger>
                        <SelectContent>
                          {engagements?.map((eng) => (
                            <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                              <span className="font-mono text-xs opacity-60 mr-2">
                                {eng.engagement_code}
                              </span>
                              {eng.engagement_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">{t("settings.holidayEngagementHelp")}</p>
                      {!persistedHolidayEngagementId && (
                        <Alert className="mt-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{t("settings.holidayNotConfigured")}</AlertDescription>
                        </Alert>
                      )}
                      {/* BUG 0526-122: the RPC always validates holiday dates dynamically for this
                          engagement regardless of this flag — this is UX feedback only, not a filter,
                          since the RPC is the real safeguard. */}
                      {holidayEngagementId &&
                        engagements?.find((eng) => eng.engagement_id === holidayEngagementId)
                          ?.approval_required === false && (
                          <Alert className="mt-2" variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{t("settings.holidayEngagementApprovalWarning")}</AlertDescription>
                          </Alert>
                        )}
                    </div>

                    {/* Tax Rate Setting */}
                    <div className="space-y-2 py-4 border-b border-border">
                      <Label htmlFor="taxRate">{t("settings.taxRate")}</Label>
                      <div className="flex items-center gap-2 max-w-[200px]">
                        <NumericInput
                          id="taxRate"
                          value={taxRate || (parseFloat(getSetting("TAX_RATE") || "0.13") * 100).toString()}
                          onValueChange={(value) => setTaxRate(value)}
                          placeholder="13"
                          decimals={2}
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{t("settings.taxRateHelp")}</p>
                    </div>

                    {/* Account Lockout Settings (BUG 0601-132) */}
                    <div className="space-y-4 py-4 border-b border-border">
                      <h4 className="font-medium text-sm">{t("settings.accountLockout")}</h4>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="maxFailedAttempts">{t("settings.maxFailedAttempts")}</Label>
                          <NumericInput
                            id="maxFailedAttempts"
                            value={maxFailedAttempts || getSetting("AUTH_MAX_FAILED_ATTEMPTS") || "5"}
                            onValueChange={setMaxFailedAttempts}
                            placeholder="5"
                            decimals={0}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.maxFailedAttemptsHelp")}</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lockoutMinutes">{t("settings.lockoutMinutes")}</Label>
                          <NumericInput
                            id="lockoutMinutes"
                            value={lockoutMinutes || getSetting("AUTH_LOCKOUT_MINUTES") || "15"}
                            onValueChange={setLockoutMinutes}
                            placeholder="15"
                            decimals={0}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.lockoutMinutesHelp")}</p>
                        </div>
                      </div>
                    </div>

                    {/* Realization Limit Setting */}
                    <div className="space-y-2 py-4 border-b border-border">
                      <Label htmlFor="realizationLimit">{t("settings.realizationLimit")}</Label>
                      <div className="flex items-center gap-2 max-w-[200px]">
                        <NumericInput
                          id="realizationLimit"
                          value={realizationLimit || getSetting("REALIZATION_LIMIT") || "75"}
                          onValueChange={(value) => setRealizationLimit(value)}
                          placeholder="75"
                          decimals={1}
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{t("settings.realizationLimitHelp")}</p>
                    </div>

                    {/* Time Limits (Min/Max) */}
                    <div className="grid grid-cols-2 gap-6 py-4">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="dailyMin">{t("settings.dailyMin")}</Label>
                          <NumericInput
                            id="dailyMin"
                            value={dailyMin || getSetting("DAILY_MIN") || "8"}
                            onValueChange={(value) => setDailyMin(value)}
                            placeholder="8"
                            decimals={1}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.dailyMinHelp")}</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="dailyMax">{t("settings.dailyMax")}</Label>
                          <NumericInput
                            id="dailyMax"
                            value={dailyMax || getSetting("DAILY_MAX") || "8"}
                            onValueChange={(value) => setDailyMax(value)}
                            placeholder="8"
                            decimals={1}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.dailyMaxHelp")}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="weeklyMin">{t("settings.weeklyMin")}</Label>
                          <NumericInput
                            id="weeklyMin"
                            value={weeklyMin || getSetting("WEEKLY_MIN") || "40"}
                            onValueChange={(value) => setWeeklyMin(value)}
                            placeholder="40"
                            decimals={1}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.weeklyMinHelp")}</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="weeklyMax">{t("settings.weeklyMax")}</Label>
                          <NumericInput
                            id="weeklyMax"
                            value={weeklyMax || getSetting("WEEKLY_MAX") || "40"}
                            onValueChange={(value) => setWeeklyMax(value)}
                            placeholder="40"
                            decimals={1}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.weeklyMaxHelp")}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button variant="cancel" onClick={handleCancelGlobal} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                        {t("common.cancel")}
                      </Button>
                      <Button onClick={handleSaveSettings} disabled={updateSettingMutation.isPending} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                        {updateSettingMutation.isPending ? t("common.saving") : t("common.saveChanges")}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="services" className="space-y-6">
            <DataTable
              data={services || []}
              columns={serviceColumns}
              searchPlaceholder={t("common.search")}
              searchKeys={["name"]}
              isLoading={servicesLoading}
              newButtonLabel={t("service.newService")}
              onNewClick={() => { setSelectedService(null); setServiceFormOpen(true); }}
              onRowClick={(row) => { setSelectedService(row); setServiceFormOpen(true); }}
              getRowId={(row) => row.service_id}
              statusFilter={{
                key: "is_active",
                options: [
                  { value: "active", label: t("status.active") },
                  { value: "inactive", label: t("status.inactive") },
                ],
              }}
            />
            <ServiceForm
              open={serviceFormOpen}
              onOpenChange={setServiceFormOpen}
              service={selectedService}
              usedCodes={(services || []).map((s) => s.code)}
            />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="taxonomies" className="space-y-6">
            <DataTable
              data={taxonomies || []}
              columns={taxonomyColumns}
              searchPlaceholder={t("common.search")}
              searchKeys={["name", "code"]}
              isLoading={taxonomiesLoading}
              newButtonLabel={t("taxonomy.newTaxonomy")}
              onNewClick={() => { setSelectedTaxonomy(null); setTaxonomyFormOpen(true); }}
              onRowClick={(row) => { setSelectedTaxonomy(row); setTaxonomyFormOpen(true); }}
              getRowId={(row) => row.taxonomy_id}
              statusFilter={{
                key: "is_active",
                options: [
                  { value: "active", label: t("status.active") },
                  { value: "inactive", label: t("status.inactive") },
                ],
              }}
            />
            <TaxonomyForm
              open={taxonomyFormOpen}
              onOpenChange={setTaxonomyFormOpen}
              taxonomy={selectedTaxonomy}
              usedCodes={(taxonomies || []).map((tx) => tx.code)}
            />
          </TabsContent>
        )}

        {canHolidaysTab && (
          <TabsContent value="holidays" className="space-y-6">
            <HolidaysManager />
          </TabsContent>
        )}
      </Tabs>
      <LeavePageDialog blocker={blocker} isDirty={isGlobalDirty} />
    </AppLayout>
  );
};

export default Settings;
