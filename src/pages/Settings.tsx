import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { DataTable, Column } from "@/components/data-table/DataTable";
import { IndustryForm } from "@/components/forms/IndustryForm";
import { CategoryForm } from "@/components/forms/CategoryForm";
import { ActivityCodeForm } from "@/components/forms/ActivityCodeForm";
import { ExpenseTypeForm } from "@/components/forms/ExpenseTypeForm";
import { Skeleton } from "@/components/ui/skeleton";

const Settings = () => {
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

  const getSetting = (key: string) => settings?.find((s) => s.setting_key === key)?.setting_value || "";

  // Industry columns
  const industryColumns: Column<Industry>[] = [
    { key: "industry_name", label: "Industry Name", sortable: true },
    { key: "fiscal_year_end", label: "Fiscal Year-End", sortable: true },
    {
      key: "default_season",
      label: "Default Season",
      render: (row) => {
        const isHigh = row.fiscal_year_end.includes("December");
        return (
          <span className={isHigh ? "text-accent font-medium" : "text-muted-foreground"}>
            {isHigh ? "High" : "Low"}
          </span>
        );
      },
    },
  ];

  // Category columns
  const categoryColumns: Column<Category>[] = [
    { key: "display_order", label: "Order", sortable: true, className: "w-20" },
    { key: "category_name", label: "Category", sortable: true },
    {
      key: "rate_high_bob",
      label: "BOB High",
      sortable: true,
      className: "text-right",
      render: (row) => row.rate_high_bob.toLocaleString(),
    },
    {
      key: "rate_low_bob",
      label: "BOB Low",
      sortable: true,
      className: "text-right",
      render: (row) => row.rate_low_bob.toLocaleString(),
    },
    {
      key: "rate_high_usd",
      label: "USD High",
      sortable: true,
      className: "text-right",
      render: (row) => row.rate_high_usd.toLocaleString(),
    },
    {
      key: "rate_low_usd",
      label: "USD Low",
      sortable: true,
      className: "text-right",
      render: (row) => row.rate_low_usd.toLocaleString(),
    },
  ];

  // Activity code columns
  const activityColumns: Column<ActivityCode>[] = [
    { key: "activity_code", label: "Code", sortable: true, className: "font-mono w-24" },
    { key: "description", label: "Description", sortable: true },
    {
      key: "is_active",
      label: "Status",
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
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  // Expense type columns
  const expenseTypeColumns: Column<ExpenseType>[] = [
    { key: "expense_name", label: "Expense Name", sortable: true },
    {
      key: "default_unit_cost",
      label: "Default Unit Cost",
      sortable: true,
      className: "text-right",
      render: (row) => row.default_unit_cost.toFixed(2),
    },
  ];

  const handleSaveSettings = async () => {
    if (taxRate) {
      await updateSettingMutation.mutateAsync({ key: "TAX_RATE", value: (parseFloat(taxRate) / 100).toString() });
    }
    if (dailyLimit) {
      await updateSettingMutation.mutateAsync({ key: "DAILY_LIMIT", value: dailyLimit });
    }
    if (weeklyLimit) {
      await updateSettingMutation.mutateAsync({ key: "WEEKLY_LIMIT", value: weeklyLimit });
    }
  };

  return (
    <AppLayout title="Settings">
      <Tabs defaultValue="industries" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="industries">Industries</TabsTrigger>
          <TabsTrigger value="rates">Category Rates</TabsTrigger>
          <TabsTrigger value="activities">Activity Codes</TabsTrigger>
          <TabsTrigger value="expense-types">Expense Types</TabsTrigger>
          <TabsTrigger value="global">Global Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="industries" className="space-y-6">
          <DataTable
            data={industries || []}
            columns={industryColumns}
            searchPlaceholder="Search by industry name..."
            searchKeys={["industry_name"]}
            isLoading={industriesLoading}
            newButtonLabel="New Industry"
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
            searchPlaceholder="Search by category name..."
            searchKeys={["category_name"]}
            isLoading={categoriesLoading}
            newButtonLabel="New Category"
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
            searchPlaceholder="Search by code or description..."
            searchKeys={["activity_code", "description"]}
            isLoading={activitiesLoading}
            newButtonLabel="New Activity"
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
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
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
            searchPlaceholder="Search by expense name..."
            searchKeys={["expense_name"]}
            isLoading={expenseTypesLoading}
            newButtonLabel="New Expense Type"
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

        <TabsContent value="global" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Global Settings</CardTitle>
              <CardDescription>System-wide configuration values.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {settingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">VAT Tax Rate (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(getSetting("TAX_RATE")) * 100 || 13}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="max-w-[200px]"
                    />
                    <p className="text-sm text-muted-foreground">Applied to gross-up fee calculations</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dailyLimit">Daily Hour Limit</Label>
                    <Input
                      id="dailyLimit"
                      type="number"
                      defaultValue={getSetting("DAILY_LIMIT") || 10}
                      onChange={(e) => setDailyLimit(e.target.value)}
                      className="max-w-[200px]"
                    />
                    <p className="text-sm text-muted-foreground">Maximum hours per day in time sheets</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weeklyLimit">Weekly Hour Limit</Label>
                    <Input
                      id="weeklyLimit"
                      type="number"
                      defaultValue={getSetting("WEEKLY_LIMIT") || 50}
                      onChange={(e) => setWeeklyLimit(e.target.value)}
                      className="max-w-[200px]"
                    />
                    <p className="text-sm text-muted-foreground">Maximum hours per week</p>
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveSettings}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={updateSettingMutation.isPending}
                >
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
