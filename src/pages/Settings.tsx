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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Lock, CheckCircle, AlertTriangle, ArrowUp, ArrowDown, Plus, Edit2, Copy } from "lucide-react";
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

interface ExchangeRateTestResult {
  compra: number;
  venta: number;
  fecha_vigencia: string;
  estado: string;
  canal: string;
  fuente: string;
}

// MUST FIX review iteracion 1 #8: fecha_vigencia llega como YYYY-MM-DD; toda la app usa
// DD/MM/YYYY (mismo patron que formatEffectiveDate en ExchangeRateIndicator.tsx).
function formatEffectiveDate(fechaVigencia: string): string {
  const [y, m, d] = fechaVigencia.split("-");
  return `${d}/${m}/${y}`;
}

// MUST FIX review iteracion 1 #10: los codigos de error del handler (exchange-rate-sync)
// vienen en español fijo ("Campo 'fuente' invalido...") y no deben viajar tal cual a un
// usuario en ingles. Solo los codigos reconocidos se traducen; cualquier otro (o un
// error sin `code`, ej. de red antes de llegar al servidor) cae al mensaje generico.
const KNOWN_EXCHANGE_RATE_ERROR_CODES = new Set([
  "unauthorized",
  "forbidden",
  "missing_url",
  "provider_error",
  "invalid_payload",
]);

// MUST FIX review iteracion 10 #6: extraida de handleTestExchangeRate para que
// handleSaveAndSeedExchangeRate (el "Guardar" del mismo modal) reuse el mismo mapeo de
// codigo -> string traducido, en vez de mostrar error.message crudo (potencialmente en
// ingles o con texto interno del handler) via un toast sin pasar por i18n.
async function parseExchangeRateFunctionError(error: unknown): Promise<{ message: string; code: string | null }> {
  let message = error instanceof Error ? error.message : String(error);
  let code: string | null = null;
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      message = body?.error?.message || message;
      code = body?.error?.code ?? null;
    } catch {
      // keep the generic error.message
    }
  }
  return { message, code };
}

const Settings = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { can, roleKey } = useAuthorization();
  const isAdmin = roleKey === "admin";
  // Visibilidad de tabs por permiso (Fase 5 · roles/permisos)
  const canSkillsTab = can("competency.read");
  const canSkillsWrite = can("competency.create");
  // Los tabs se muestran por permiso de LECTURA y las acciones por el de escritura:
  // la matriz da "Listar/Ver" de estos catálogos a muchos más roles que "Crear".
  const canHolidaysTab = can("holiday.read");
  const canIndustryTab = can("industry.read");
  const canRatesTab = can("category_rate.read");
  const canActivitiesTab = can("activity_code.read");
  const canExpenseTab = can("expense_type.read");
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
  const { data: services } = useServices();
  const { data: taxonomies, isLoading: taxonomiesLoading } = useTaxonomies();
  const { data: engagements } = useEngagements();
  // BUG 0828-186 (Punto C): el encargo de Feriados debe ser administrativo/interno de la
  // firma -- el selector solo ofrece candidatos con is_internal=true. El lookup del
  // encargo ya configurado (línea ~1188, advertencia approval_required) sigue usando la
  // lista completa para no perder la advertencia de una configuración previa no interna.
  const holidayEngagementOptions = engagements?.filter((eng) => eng.is_internal === true);
  const persistedHolidayEngagementId = useHolidayEngagementId();
  const updateSettingMutation = useUpdateGlobalSetting();
  const reorderActivityMutation = useReorderServiceActivity();
  const moveCategoryMutation = useMoveCategory();
  const copyCategoriesMutation = useCopyCategories();

  // ── Prácticas: single selector shared by the Categorías and Actividades
  // sub-tabs (0817-177 — unifies what used to be two independent selectors).
  // Admins see every práctica (incl. inactive) so they can edit/reactivate
  // them; non-admins only see active, rate-eligible prácticas.
  const eligibleServices = useMemo(() => {
    const all = services ?? [];
    return isAdmin ? all : all.filter((s) => s.is_active && s.allows_rates_activities);
  }, [services, isAdmin]);

  // Valid copy-categories targets are always active + rate-eligible, regardless
  // of whether the viewer is an admin (mirrors the pre-unification behavior).
  const copyableServices = useMemo(
    () => (services ?? []).filter((s) => s.is_active && s.allows_rates_activities),
    [services]
  );

  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  useEffect(() => {
    if (!selectedServiceId && eligibleServices.length > 0) {
      const auditoria = eligibleServices.find((s) => s.code === 1) ?? eligibleServices[0];
      setSelectedServiceId(auditoria.practica_id);
    }
  }, [eligibleServices, selectedServiceId]);

  const currentService = eligibleServices.find((s) => s.practica_id === selectedServiceId);
  // A práctica must be active and rate-eligible to host categories/activities;
  // admins can still select an inactive/ineligible one to edit it, but child
  // ABM stays disabled until it qualifies.
  const canManageChildren = !!currentService?.is_active && !!currentService?.allows_rates_activities;
  const canCreateActivities = canManageChildren && !!currentService?.abbreviation;

  // Hold off the query entirely while no práctica is selected — passing a
  // falsy serviceId to useCategories() reads as "all", which would leak
  // categories from every práctica into this scoped view (0817-177).
  const { data: categories, isLoading: categoriesLoading } = useCategories(selectedServiceId || undefined, {
    enabled: !!selectedServiceId,
  });

  // Copy-categories dialog state.
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetId, setCopyTargetId] = useState<string>("");
  const [copyNeedsReplace, setCopyNeedsReplace] = useState(false);

  // Active service-linked activities grouped by service, ordered by code.
  // Used to compute the 1-based position of each row for the ↑/↓ controls.
  //
  // ADM is is_system=true with practica_id NULL (migración cero, informe §5) — the
  // practica_id filter alone already excludes it, keeping the client's position/total
  // in sync with what reorder_practice_activity/deactivate_practice_activity operate on.
  const activeActivitiesByService = useMemo(() => {
    const map = new Map<string, string[]>();
    (activityCodes ?? [])
      .filter((a) => a.is_active && a.practica_id)
      .slice()
      .sort((a, b) => {
        const n = (code: string) => parseInt(code.match(/(\d+)$/)?.[1] ?? "0", 10);
        return n(a.activity_code) - n(b.activity_code);
      })
      .forEach((a) => {
        const arr = map.get(a.practica_id) ?? [];
        arr.push(a.activity_id);
        map.set(a.practica_id, arr);
      });
    return map;
  }, [activityCodes]);

  // ── Activity codes: filtered by the shared práctica selector. The "Global"
  // bucket no longer exists (activity_codes.practica_id is NOT NULL, 0817-177).
  const filteredActivityCodes = useMemo(
    () => (selectedServiceId ? (activityCodes ?? []).filter((a) => a.practica_id === selectedServiceId) : []),
    [activityCodes, selectedServiceId]
  );

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

  // Prácticas: sub-tab under the unified "services" tab, gated by each
  // catalog's own read permission.
  const [servicesSubTab, setServicesSubTab] = useState<"categories" | "activities">(
    canRatesTab ? "categories" : "activities"
  );
  useEffect(() => {
    if (servicesSubTab === "categories" && !canRatesTab && canActivitiesTab) setServicesSubTab("activities");
    if (servicesSubTab === "activities" && !canActivitiesTab && canRatesTab) setServicesSubTab("categories");
  }, [canRatesTab, canActivitiesTab, servicesSubTab]);

  // Switching práctica invalidates whatever category/activity form was mid-edit
  // for the previous one.
  useEffect(() => {
    setCategoryFormOpen(false);
    setActivityFormOpen(false);
  }, [selectedServiceId]);

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
  // Notificaciones: ventana de las alarmas de timesheet. Independiente de
  // TS_EMPLOYEE_RETRO_DAYS, que gobierna la EDICION de semanas pasadas.
  const [alertWindowWeeks, setAlertWindowWeeks] = useState<string>("");
  const [trackingStartDate, setTrackingStartDate] = useState<string>("");
  const [exchangeRateApiUrl, setExchangeRateApiUrl] = useState<string>("");
  const [exchangeRateTestOpen, setExchangeRateTestOpen] = useState(false);
  const [exchangeRateTestLoading, setExchangeRateTestLoading] = useState(false);
  const [exchangeRateTestSaving, setExchangeRateTestSaving] = useState(false);
  const [exchangeRateTestResult, setExchangeRateTestResult] = useState<ExchangeRateTestResult | null>(null);
  const [exchangeRateTestErrorCode, setExchangeRateTestErrorCode] = useState<string | null>(null);
  const [exchangeRateTestError, setExchangeRateTestError] = useState<string | null>(null);

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
      // Se hidrata explicitamente (no via fallback en `value`) porque el guardado compara
      // contra lo persistido para permitir GUARDAR EL VACIO. Sin esto, guardar sin tocar el
      // campo borraria la fecha ya configurada.
      const trackingStartSetting = settings.find(
        (s) => s.setting_key === "TS_TRACKING_START_DATE"
      );
      if (trackingStartSetting) {
        setTrackingStartDate(trackingStartSetting.setting_value ?? "");
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
      const exchangeRateApiUrlSetting = settings.find((s) => s.setting_key === "EXCHANGE_RATE_API_URL");
      if (exchangeRateApiUrlSetting) setExchangeRateApiUrl(exchangeRateApiUrlSetting.setting_value);
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
    const persistedExchangeRateApiUrl = getSetting("EXCHANGE_RATE_API_URL") || "";
    const persistedAlertWindow = getSetting("TS_ALERT_WINDOW_WEEKS") || "4";
    const persistedTrackingStart = getSetting("TS_TRACKING_START_DATE") || "";

    return (
      language !== persistedLang ||
      allowWeekendTracking !== persistedWeekend ||
      compactFont !== persistedCompact ||
      allowedEmailDomain !== persistedDomain ||
      holidayEngagementId !== persistedHolidayEngagement ||
      exchangeRateApiUrl !== persistedExchangeRateApiUrl ||
      (taxRate !== "" && taxRate !== persistedTax) ||
      (realizationLimit !== "" && realizationLimit !== persistedRealization) ||
      (dailyMin !== "" && dailyMin !== persistedDailyMin) ||
      (dailyMax !== "" && dailyMax !== persistedDailyMax) ||
      (weeklyMin !== "" && weeklyMin !== persistedWeeklyMin) ||
      (weeklyMax !== "" && weeklyMax !== persistedWeeklyMax) ||
      (maxFailedAttempts !== "" && maxFailedAttempts !== persistedMaxAttempts) ||
      (lockoutMinutes !== "" && lockoutMinutes !== persistedLockoutMinutes) ||
      // Los dos campos de notificaciones NO son simetricos, porque no se guardan igual:
      //   * alertWindowWeeks nunca se hidrata (el input cae al persistido en `value`), y el
      //     guardado solo escribe si tiene algo. Vacio = sin tocar, igual que los numericos.
      //   * trackingStartDate SI se hidrata, y el guardado compara contra lo persistido para
      //     poder GUARDAR EL VACIO — dejarlo en blanco es como se desactiva el recorte. Asi que
      //     aca la comparacion es directa: vacio sobre un valor guardado es un cambio real.
      (alertWindowWeeks !== "" && alertWindowWeeks !== persistedAlertWindow) ||
      trackingStartDate !== persistedTrackingStart
    );
  }, [settings, getSetting, language, allowWeekendTracking, compactFont, allowedEmailDomain,
      holidayEngagementId, taxRate, realizationLimit, dailyMin, dailyMax, weeklyMin, weeklyMax,
      maxFailedAttempts, lockoutMinutes, exchangeRateApiUrl, alertWindowWeeks, trackingStartDate]);

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
    setExchangeRateApiUrl(getSetting("EXCHANGE_RATE_API_URL") || "");
    // Mismas dos formas que en isGlobalDirty: el que no se hidrata vuelve a vacio (= sin
    // tocar) y el que si se hidrata vuelve a lo persistido. Desde que los dos cuentan para el
    // estado sucio, dejarlos afuera de Cancelar haria que el LeavePageDialog saltara igual
    // despues de cancelar.
    setAlertWindowWeeks("");
    setTrackingStartDate(getSetting("TS_TRACKING_START_DATE") || "");

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
        // Wait for selectedServiceId before computing total — otherwise
        // useCategories(undefined) can return ALL services' categories while
        // pos is per-service, mismatching the bounds check. Reordering is a
        // child mutation, so it stays off while the práctica can't host
        // children (canManageChildren), matching create.
        if (!isAdmin || !selectedServiceId || !canManageChildren) return null;
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
      key: "practica_id",
      label: t("activity.service"),
      sortable: false,
      mobilePriority: 'secondary',
      render: (row) => <span className="text-sm">{row.service?.name ?? "—"}</span>,
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
        // ↑/↓ only for active activities; swap code with the adjacent sibling
        // of the same practice via reorder_practice_activity. Reordering is a
        // child mutation, so it stays off while the práctica can't host
        // children (canManageChildren), matching create.
        if (!isAdmin || !row.is_active || !canManageChildren) return null;
        const siblings = activeActivitiesByService.get(row.practica_id) ?? [];
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

  // Taxonomy columns
  const taxonomyColumns: Column<Taxonomy>[] = [
    { key: "code", label: t("taxonomy.code"), sortable: true, className: "w-24 font-mono", mobilePriority: 'primary' },
    { key: "name", label: t("taxonomy.name"), sortable: true, mobilePriority: 'primary' },
    {
      key: "practica_id",
      label: t("taxonomy.service"),
      sortable: false,
      mobilePriority: 'secondary',
      render: (row) => {
        const service = (services || []).find((s) => s.practica_id === row.practica_id);
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

      // Ventana de alarmas: el backend recorta a 1-52 y cae al default ante basura, pero se
      // valida aca tambien para no persistir un valor que la funcion va a ignorar.
      let alertWindowValue: string | null = null;
      if (alertWindowWeeks) {
        const val = parseInt(alertWindowWeeks, 10);
        if (isNaN(val) || val < 1 || val > 52) {
          toast.error(t("settings.alertWindowWeeksRangeError"));
          return;
        }
        alertWindowValue = val.toString();
      }

      // Mandatory-HTTPS absolute-URL validation (bug 0722-156) — the same rule the
      // "Probar"/"Guardar" flow relies on (fetchProviderRate rejects non-HTTPS server-side
      // too), checked here so a bad value never reaches global_settings via plain Save.
      // MUST FIX review iteracion 3 #3: `if (exchangeRateApiUrl)` truthy-check skipped the
      // mutation entirely when the field was cleared, so an admin could never disable a
      // configured provider URL through this control — compare against the persisted value
      // instead (same pattern as holidayEngagementId below), so clearing it persists "".
      const trimmedExchangeRateApiUrl = exchangeRateApiUrl.trim();
      let exchangeRateApiUrlValue: string | null = null;
      if (trimmedExchangeRateApiUrl) {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(trimmedExchangeRateApiUrl);
        } catch {
          toast.error(t("settings.exchangeRateApiUrlInvalid"));
          return;
        }
        if (parsedUrl.protocol !== "https:") {
          toast.error(t("settings.exchangeRateApiUrlHttpsRequired"));
          return;
        }
      }
      const persistedExchangeRateApiUrl = getSetting("EXCHANGE_RATE_API_URL") || "";
      if (trimmedExchangeRateApiUrl !== persistedExchangeRateApiUrl) {
        exchangeRateApiUrlValue = trimmedExchangeRateApiUrl;
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
      if (alertWindowValue !== null) {
        await updateSettingMutation.mutateAsync({ key: "TS_ALERT_WINDOW_WEEKS", value: alertWindowValue });
      }
      // Se compara contra lo persistido para poder GUARDAR EL VACIO: dejar el campo en blanco
      // es la forma de desactivar el recorte por fecha de arranque.
      const persistedTrackingStart = getSetting("TS_TRACKING_START_DATE") || "";
      if (trackingStartDate !== persistedTrackingStart) {
        await updateSettingMutation.mutateAsync({ key: "TS_TRACKING_START_DATE", value: trackingStartDate });
      }

      if (exchangeRateApiUrlValue !== null) {
        await updateSettingMutation.mutateAsync({ key: "EXCHANGE_RATE_API_URL", value: exchangeRateApiUrlValue });
      }
      queryClient.invalidateQueries({ queryKey: ["global_settings"] });
      toast.success(t("messages.settingsSaved"));
      setActiveTab("account");
    } catch (error) {
      // Error handled by mutation
    }
  };

  // BUG 0722-156 (Fase 1): "Probar" dry-runs the currently-typed URL (possibly unsaved) via
  // exchange-rate-sync's admin-gated test mode — never writes to exchange_rate_history.
  const handleTestExchangeRate = async () => {
    setExchangeRateTestError(null);
    setExchangeRateTestErrorCode(null);
    setExchangeRateTestResult(null);
    setExchangeRateTestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("exchange-rate-sync", {
        body: { mode: "test", url: exchangeRateApiUrl.trim() },
      });
      if (error) {
        const { message, code } = await parseExchangeRateFunctionError(error);
        setExchangeRateTestError(message);
        setExchangeRateTestErrorCode(code);
      } else if ((data as { error?: { message?: string; code?: string } } | null)?.error) {
        const err = (data as { error: { message: string; code?: string } }).error;
        setExchangeRateTestError(err.message);
        setExchangeRateTestErrorCode(err.code ?? null);
      } else {
        setExchangeRateTestResult(data as ExchangeRateTestResult);
      }
    } catch (e) {
      setExchangeRateTestError(e instanceof Error ? e.message : t("messages.error"));
      setExchangeRateTestErrorCode(null);
    } finally {
      setExchangeRateTestLoading(false);
      setExchangeRateTestOpen(true);
    }
  };

  // "Guardar" inside the test modal: persists the URL, then re-invokes exchange-rate-sync in
  // sync mode (server-side re-fetch of the just-saved URL — never the client-held payload
  // above) so the navbar populates immediately instead of waiting for a future cron run.
  const handleSaveAndSeedExchangeRate = async () => {
    setExchangeRateTestSaving(true);
    try {
      await updateSettingMutation.mutateAsync({ key: "EXCHANGE_RATE_API_URL", value: exchangeRateApiUrl.trim() });
      const { error } = await supabase.functions.invoke("exchange-rate-sync", { body: {} });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["exchange-rate", "latest"] });
      toast.success(t("settings.exchangeRateSeeded"));
      setExchangeRateTestOpen(false);
    } catch (e) {
      // MUST FIX review iteracion 10 #6: antes mostraba e.message crudo via toast (podia
      // venir en ingles o con texto interno del handler) -- reusa el mismo mapeo de
      // codigo -> string traducido que ya usa "Probar" (mismo Alert dentro del modal, no
      // un toast aparte), en vez de un mensaje sin pasar por i18n.
      const { message, code } = await parseExchangeRateFunctionError(e);
      setExchangeRateTestError(message);
      setExchangeRateTestErrorCode(code);
    } finally {
      setExchangeRateTestSaving(false);
    }
  };

  // Copy-categories: available targets are the other rate-bearing services.
  const copyTargetServices = copyableServices.filter((s) => s.practica_id !== selectedServiceId);

  const openCopyDialog = () => {
    setCopyTargetId("");
    setCopyNeedsReplace(false);
    setCopyDialogOpen(true);
  };

  const handleCopyCategories = async (replace: boolean) => {
    if (!selectedServiceId || !copyTargetId) return;
    try {
      await copyCategoriesMutation.mutateAsync({
        sourceServiceId: selectedServiceId,
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

  const serviceName = (id: string) =>
    (services ?? []).find((s) => s.practica_id === id)?.name ?? "";

  return (
    <AppLayout title={t("settings.title")} focusMode={isGlobalTabActive}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="account">{t("settings.account")}</TabsTrigger>
          {canIndustryTab && (
            <TabsTrigger value="industries">{t("settings.industries")}</TabsTrigger>
          )}
          {canSkillsTab && (
            <TabsTrigger value="skills">{t("settings.skills")}</TabsTrigger>
          )}
          {canExpenseTab && (
            <TabsTrigger value="expense-types">{t("settings.expenseTypes")}</TabsTrigger>
          )}
          {canHolidaysTab && (
            <TabsTrigger value="holidays">{t("settings.holidays")}</TabsTrigger>
          )}
          {canRolesTab && (
            <TabsTrigger value="roles">{t("settings.userRoles")}</TabsTrigger>
          )}
          {(isAdmin || canRatesTab || canActivitiesTab) && (
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

        {(isAdmin || canRatesTab || canActivitiesTab) && (
          <TabsContent value="services" className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="practiceSelector">{t("category.service")}</Label>
                <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger
                    id="practiceSelector"
                    className="w-56 border-info [&_svg]:text-info [&_svg]:opacity-100"
                    data-testid="practice-selector"
                  >
                    <SelectValue placeholder={t("category.selectService")} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleServices.map((s) => (
                      <SelectItem key={s.practica_id} value={s.practica_id}>
                        {s.name}
                        {!s.is_active ? ` (${t("status.inactive")})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="warning"
                    disabled={!currentService}
                    onClick={() => { setSelectedService(currentService ?? null); setServiceFormOpen(true); }}
                    data-testid="edit-practice-button"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    {t("service.editService")}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => { setSelectedService(null); setServiceFormOpen(true); }}
                    data-testid="new-practice-button"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("service.newService")}
                  </Button>
                </div>
              )}
            </div>

            {!canManageChildren && currentService && (
              <Alert data-testid="practice-children-disabled-notice">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t("service.disallowsChildrenNotice")}</AlertDescription>
              </Alert>
            )}

            <Tabs value={servicesSubTab} onValueChange={(v) => setServicesSubTab(v as "categories" | "activities")}>
              <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
                {canRatesTab && (
                  <TabsTrigger
                    value="categories"
                    className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-0 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {t("settings.categoryRates")}
                  </TabsTrigger>
                )}
                {canActivitiesTab && (
                  <TabsTrigger
                    value="activities"
                    className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-0 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {t("settings.activityCodes")}
                  </TabsTrigger>
                )}
              </TabsList>

              {canRatesTab && (
                <TabsContent value="categories" className="space-y-6 mt-6">
                  <DataTable
                    key={selectedServiceId}
                    data={categories || []}
                    columns={categoryColumns}
                    searchPlaceholder={t("common.search")}
                    searchKeys={["category_name"]}
                    isLoading={categoriesLoading}
                    newButtonLabel={canRatesWrite && canManageChildren ? t("category.newCategory") : undefined}
                    onNewClick={canRatesWrite && canManageChildren ? () => { setSelectedCategory(null); setCategoryFormOpen(true); } : undefined}
                    onRowClick={canRatesWrite && canManageChildren ? (row) => { setSelectedCategory(row); setCategoryFormOpen(true); } : undefined}
                    getRowId={(row) => row.category_id}
                    headerActions={
                      canRatesWrite ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openCopyDialog}
                          disabled={!selectedServiceId || !canManageChildren || copyTargetServices.length === 0}
                          className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                          data-testid="copy-categories-button"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {t("category.copyFromService")}
                        </Button>
                      ) : undefined
                    }
                  />
                  <CategoryForm
                    open={categoryFormOpen}
                    onOpenChange={setCategoryFormOpen}
                    category={selectedCategory}
                    serviceId={selectedServiceId}
                    lockService={!selectedCategory}
                  />

                  {/* Copy categories from the current service into another */}
                  <AlertDialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("category.copyFromService")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("category.copySource", { service: serviceName(selectedServiceId) })}
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
                              <SelectItem key={s.practica_id} value={s.practica_id}>
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
              )}

              {canActivitiesTab && (
                <TabsContent value="activities" className="space-y-6 mt-6">
                  {canManageChildren && !canCreateActivities && (
                    <Alert data-testid="activity-abbreviation-missing-notice">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{t("activity.abbreviationMissing")}</AlertDescription>
                    </Alert>
                  )}
                  <DataTable
                    key={selectedServiceId}
                    data={filteredActivityCodes}
                    columns={activityColumns}
                    searchPlaceholder={t("common.search")}
                    searchKeys={["activity_code", "description"]}
                    isLoading={activitiesLoading}
                    newButtonLabel={canActivitiesWrite ? t("activity.newActivity") : undefined}
                    onNewClick={canActivitiesWrite && canCreateActivities ? () => { setSelectedActivity(null); setActivityFormOpen(true); } : undefined}
                    onRowClick={canActivitiesWrite && canManageChildren ? (row) => { setSelectedActivity(row); setActivityFormOpen(true); } : undefined}
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
                    serviceId={selectedServiceId}
                    lockService={!selectedActivity}
                  />
                </TabsContent>
              )}
            </Tabs>

            <ServiceForm
              open={serviceFormOpen}
              onOpenChange={setServiceFormOpen}
              service={selectedService}
              usedCodes={(services || []).map((s) => s.code)}
            />
          </TabsContent>
        )}

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

                    {/* Exchange Rate Microservice URL Setting (BUG 0722-156, Fase 1) */}
                    <div className="space-y-2 py-4 border-b border-border">
                      <Label htmlFor="exchangeRateApiUrl">{t("settings.exchangeRateApiUrl")}</Label>
                      <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
                        <Input
                          id="exchangeRateApiUrl"
                          value={exchangeRateApiUrl}
                          onChange={(e) => setExchangeRateApiUrl(e.target.value)}
                          placeholder={t("settings.exchangeRateApiUrlPlaceholder")}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={exchangeRateTestLoading || !exchangeRateApiUrl.trim()}
                          onClick={handleTestExchangeRate}
                        >
                          {exchangeRateTestLoading ? t("common.loading") : t("settings.testConnection")}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">{t("settings.exchangeRateApiUrlHelp")}</p>
                    </div>

                    {/* Holiday Engagement Setting */}
                    <div className="space-y-2 py-4 border-b border-border">
                      <Label htmlFor="holidayEngagement">{t("settings.holidayEngagement")}</Label>
                      <Select value={holidayEngagementId} onValueChange={setHolidayEngagementId}>
                        <SelectTrigger id="holidayEngagement" className="max-w-md">
                          <SelectValue placeholder={t("timesheet.selectEngagement")} />
                        </SelectTrigger>
                        <SelectContent>
                          {holidayEngagementOptions?.map((eng) => (
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

                    {/* Notificaciones: ventana de las alarmas de timesheet. */}
                    <div className="space-y-4 py-4 border-b border-border">
                      <h4 className="font-medium text-sm">{t("settings.notificationsSection")}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="alertWindowWeeks">{t("settings.alertWindowWeeks")}</Label>
                          <NumericInput
                            id="alertWindowWeeks"
                            value={alertWindowWeeks || getSetting("TS_ALERT_WINDOW_WEEKS") || "4"}
                            onValueChange={setAlertWindowWeeks}
                            placeholder="4"
                            decimals={0}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.alertWindowWeeksHelp")}</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trackingStartDate">{t("settings.trackingStartDate")}</Label>
                          <Input
                            id="trackingStartDate"
                            type="date"
                            value={trackingStartDate}
                            onChange={(e) => setTrackingStartDate(e.target.value)}
                          />
                          <p className="text-sm text-muted-foreground">{t("settings.trackingStartDateHelp")}</p>
                        </div>
                      </div>
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
      <Dialog open={exchangeRateTestOpen} onOpenChange={setExchangeRateTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.exchangeRateTestModalTitle")}</DialogTitle>
            <DialogDescription>{t("settings.exchangeRateApiUrlHelp")}</DialogDescription>
          </DialogHeader>
          {exchangeRateTestError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {exchangeRateTestErrorCode && KNOWN_EXCHANGE_RATE_ERROR_CODES.has(exchangeRateTestErrorCode)
                  ? t(`settings.exchangeRateError.${exchangeRateTestErrorCode}`)
                  : t("settings.exchangeRateError.generic")}
              </AlertDescription>
            </Alert>
          ) : exchangeRateTestResult ? (
            <div className="space-y-1 text-sm">
              <p>{t("settings.exchangeRateTestCompra", { value: exchangeRateTestResult.compra })}</p>
              <p>{t("settings.exchangeRateTestVenta", { value: exchangeRateTestResult.venta })}</p>
              <p>{t("settings.exchangeRateTestEffectiveDate", { date: formatEffectiveDate(exchangeRateTestResult.fecha_vigencia) })}</p>
              <p>
                {t("settings.exchangeRateTestStatus", {
                  value: t(`header.exchangeRate.status.${exchangeRateTestResult.estado}`),
                })}
              </p>
              <p>{t("settings.exchangeRateTestChannel", { value: exchangeRateTestResult.canal })}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExchangeRateTestOpen(false)}>
              {t("common.cancel")}
            </Button>
            {exchangeRateTestResult && !exchangeRateTestError && (
              <Button onClick={handleSaveAndSeedExchangeRate} disabled={exchangeRateTestSaving}>
                {exchangeRateTestSaving ? t("common.saving") : t("settings.exchangeRateSaveAndSeed")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Settings;
