import { useState, useEffect } from "react";
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
  useActivityCodes,
  useExpenseTypes,
  Category,
  Industry,
  ActivityCode,
  ExpenseType,
} from "@/hooks/useEmsData";
import { useUpdateGlobalSetting } from "@/hooks/useEmsMutations";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/hooks/useLanguage";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { IndustryForm } from "@/components/forms/IndustryForm";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { ActivityCodeForm } from "@/components/forms/ActivityCodeForm";
import { ExpenseTypeForm } from "@/components/forms/ExpenseTypeForm";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { currentLanguage } = useLanguage();
  
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: industries, isLoading: industriesLoading } = useIndustries();
  const { data: settings, isLoading: settingsLoading } = useGlobalSettings();
  const { data: activityCodes, isLoading: activitiesLoading } = useActivityCodes();
  const { data: expenseTypes, isLoading: expenseTypesLoading } = useExpenseTypes();
  const updateSettingMutation = useUpdateGlobalSetting();

  // Form states
  const [industryFormOpen, setIndustryFormOpen] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null);

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityCode | null>(null);

  const [expenseTypeFormOpen, setExpenseTypeFormOpen] = useState(false);
  const [selectedExpenseType, setSelectedExpenseType] = useState<ExpenseType | null>(null);

  // Settings state
  const [taxRate, setTaxRate] = useState<string>("");
  const [dailyLimit, setDailyLimit] = useState<string>("");
  const [weeklyLimit, setWeeklyLimit] = useState<string>("");
  const [language, setLanguage] = useState<string>("en");
  const [allowWeekendTracking, setAllowWeekendTracking] = useState<boolean>(false);
  const [compactFont, setCompactFont] = useState<boolean>(false);

  const getSetting = (key: string) => settings?.find((s) => s.setting_key === key)?.setting_value || "";

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
    }
  }, [settings]);

  // Industry columns
  const industryColumns: Column<Industry>[] = [
    { key: "industry_name", label: t("industry.name"), sortable: true },
    { key: "fiscal_year_end", label: t("industry.fiscalYearEnd"), sortable: true },
    {
      key: "default_season",
      label: t("industry.defaultSeason"),
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

  // Category columns
  const categoryColumns: Column<Category>[] = [
    { key: "display_order", label: t("category.order"), sortable: true, className: "w-20" },
    { key: "category_name", label: t("category.name"), sortable: true },
    {
      key: "can_approve_wo",
      label: t("category.canApproveWO"),
      sortable: true,
      className: "w-28 text-center",
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
      render: (row) => Math.round(row.rate_high_bob).toLocaleString("es-BO", { maximumFractionDigits: 0 }),
    },
    {
      key: "rate_low_bob",
      label: t("category.bobLow"),
      sortable: true,
      className: "text-right",
      render: (row) => Math.round(row.rate_low_bob).toLocaleString("es-BO", { maximumFractionDigits: 0 }),
    },
    {
      key: "rate_high_usd",
      label: t("category.usdHigh"),
      sortable: true,
      className: "text-right",
      render: (row) => Math.round(row.rate_high_usd).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    },
    {
      key: "rate_low_usd",
      label: t("category.usdLow"),
      sortable: true,
      className: "text-right",
      render: (row) => Math.round(row.rate_low_usd).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    },
  ];

  // Activity code columns
  const activityColumns: Column<ActivityCode>[] = [
    { key: "activity_code", label: t("activity.code"), sortable: true, className: "font-mono w-24" },
    { key: "description", label: t("activity.description"), sortable: true },
    {
      key: "is_active",
      label: t("activity.status"),
      sortable: true,
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

  // Expense type columns
  const expenseTypeColumns: Column<ExpenseType>[] = [
    { key: "expense_name", label: t("expense.name"), sortable: true },
    {
      key: "default_unit_cost",
      label: t("expense.defaultUnitCost"),
      sortable: true,
      className: "text-right",
      render: (row) => Math.round(row.default_unit_cost).toLocaleString("es-BO", { maximumFractionDigits: 0 }),
    },
  ];

  const handleSaveSettings = async () => {
    try {
      if (taxRate) {
        await updateSettingMutation.mutateAsync({ key: "TAX_RATE", value: (parseFloat(taxRate) / 100).toString() });
      }
      if (dailyLimit) {
        await updateSettingMutation.mutateAsync({ key: "DAILY_LIMIT", value: dailyLimit });
      }
      if (weeklyLimit) {
        await updateSettingMutation.mutateAsync({ key: "WEEKLY_LIMIT", value: weeklyLimit });
      }
      if (language && isAdmin) {
        await updateSettingMutation.mutateAsync({ key: "LANGUAGE", value: language });
      }
      await updateSettingMutation.mutateAsync({ key: "ALLOW_WEEKEND_TRACKING", value: allowWeekendTracking.toString() });
      await updateSettingMutation.mutateAsync({ key: "COMPACT_FONT", value: compactFont.toString() });
      toast({ title: t("messages.settingsSaved") });
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <AppLayout title={t("settings.title")}>
      <Tabs defaultValue="industries" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="industries">{t("settings.industries")}</TabsTrigger>
          <TabsTrigger value="rates">{t("settings.categoryRates")}</TabsTrigger>
          <TabsTrigger value="activities">{t("settings.activityCodes")}</TabsTrigger>
          <TabsTrigger value="expense-types">{t("settings.expenseTypes")}</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="global">{t("settings.globalSettings")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="industries" className="space-y-6">
          <DataTable
            data={industries || []}
            columns={industryColumns}
            searchPlaceholder={t("common.search")}
            searchKeys={["industry_name"]}
            isLoading={industriesLoading}
            newButtonLabel={t("industry.newIndustry")}
            onNewClick={() => {
              setSelectedIndustry(null);
              setIndustryFormOpen(true);
            }}
            onRowClick={(row) => {
              setSelectedIndustry(row);
              setIndustryFormOpen(true);
            }}
            getRowId={(row) => row.industry_id}
          />
          <IndustryForm
            open={industryFormOpen}
            onOpenChange={setIndustryFormOpen}
            industry={selectedIndustry}
          />
        </TabsContent>

        <TabsContent value="rates" className="space-y-6">
          <DataTable
            data={categories || []}
            columns={categoryColumns}
            searchPlaceholder={t("common.search")}
            searchKeys={["category_name"]}
            isLoading={categoriesLoading}
            newButtonLabel={t("category.newCategory")}
            onNewClick={() => {
              setSelectedCategory(null);
              setCategoryFormOpen(true);
            }}
            onRowClick={(row) => {
              setSelectedCategory(row);
              setCategoryFormOpen(true);
            }}
            getRowId={(row) => row.category_id}
          />
          <CategoryForm
            open={categoryFormOpen}
            onOpenChange={setCategoryFormOpen}
            category={selectedCategory}
          />
        </TabsContent>

        <TabsContent value="activities" className="space-y-6">
          <DataTable
            data={activityCodes || []}
            columns={activityColumns}
            searchPlaceholder={t("common.search")}
            searchKeys={["activity_code", "description"]}
            isLoading={activitiesLoading}
            newButtonLabel={t("activity.newActivity")}
            onNewClick={() => {
              setSelectedActivity(null);
              setActivityFormOpen(true);
            }}
            onRowClick={(row) => {
              setSelectedActivity(row);
              setActivityFormOpen(true);
            }}
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
            newButtonLabel={t("expense.newExpenseType")}
            onNewClick={() => {
              setSelectedExpenseType(null);
              setExpenseTypeFormOpen(true);
            }}
            onRowClick={(row) => {
              setSelectedExpenseType(row);
              setExpenseTypeFormOpen(true);
            }}
            getRowId={(row) => row.expense_type_id}
          />
          <ExpenseTypeForm
            open={expenseTypeFormOpen}
            onOpenChange={setExpenseTypeFormOpen}
            expenseType={selectedExpenseType}
          />
        </TabsContent>

        {isAdmin && (
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
                        onCheckedChange={setCompactFont}
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="taxRate">{t("settings.taxRate")}</Label>
                        <NumericInput
                          decimals={2}
                          locale="en"
                          min={0}
                          max={100}
                          value={parseFloat(getSetting("TAX_RATE")) * 100 || 13}
                          onChange={(val) => setTaxRate(String(val))}
                          className="max-w-[200px]"
                        />
                        <p className="text-sm text-muted-foreground">{t("settings.taxRateHelp")}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dailyLimit">{t("settings.dailyLimit")}</Label>
                        <NumericInput
                          decimals={0}
                          locale="en"
                          min={1}
                          max={24}
                          value={getSetting("DAILY_LIMIT") || 10}
                          onChange={(val) => setDailyLimit(String(val))}
                          className="max-w-[200px]"
                        />
                        <p className="text-sm text-muted-foreground">{t("settings.dailyLimitHelp")}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="weeklyLimit">{t("settings.weeklyLimit")}</Label>
                        <NumericInput
                          decimals={0}
                          locale="en"
                          min={1}
                          max={168}
                          value={getSetting("WEEKLY_LIMIT") || 50}
                          onChange={(val) => setWeeklyLimit(String(val))}
                          className="max-w-[200px]"
                        />
                        <p className="text-sm text-muted-foreground">{t("settings.weeklyLimitHelp")}</p>
                      </div>
                    </div>
                  </>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveSettings}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground"
                    disabled={updateSettingMutation.isPending}
                  >
                    {t("settings.saveSettings")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
