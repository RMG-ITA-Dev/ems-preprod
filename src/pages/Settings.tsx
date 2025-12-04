import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories, useIndustries, useGlobalSettings, useActivityCodes } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";

const Settings = () => {
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: industries, isLoading: industriesLoading } = useIndustries();
  const { data: settings, isLoading: settingsLoading } = useGlobalSettings();
  const { data: activityCodes, isLoading: activitiesLoading } = useActivityCodes();

  const getSetting = (key: string) => settings?.find(s => s.setting_key === key)?.setting_value || '';

  return (
    <AppLayout title="Settings">
      <Tabs defaultValue="rates" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="rates">Category Rates</TabsTrigger>
          <TabsTrigger value="industries">Industries</TabsTrigger>
          <TabsTrigger value="global">Global Settings</TabsTrigger>
          <TabsTrigger value="activities">Activity Codes</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Staff Category Rates</CardTitle>
              <CardDescription>
                Define hourly rates by category, currency, and season. Rates are locked when a Work Order is created.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead rowSpan={2} className="font-semibold border-r">Category</TableHead>
                      <TableHead colSpan={2} className="text-center font-semibold border-r">BOB (Bolivianos)</TableHead>
                      <TableHead colSpan={2} className="text-center font-semibold">USD (US Dollars)</TableHead>
                    </TableRow>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-center font-medium">High Season</TableHead>
                      <TableHead className="text-center font-medium border-r">Low Season</TableHead>
                      <TableHead className="text-center font-medium">High Season</TableHead>
                      <TableHead className="text-center font-medium">Low Season</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoriesLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-20 mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-20 mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-20 mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-20 mx-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : categories?.map((cat) => (
                      <TableRow key={cat.category_id}>
                        <TableCell className="font-medium border-r">{cat.category_name}</TableCell>
                        <TableCell className="text-center">
                          <Input 
                            type="number" 
                            defaultValue={cat.rate_high_bob} 
                            className="w-24 mx-auto text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r">
                          <Input 
                            type="number" 
                            defaultValue={cat.rate_low_bob} 
                            className="w-24 mx-auto text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input 
                            type="number" 
                            defaultValue={cat.rate_high_usd} 
                            className="w-24 mx-auto text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input 
                            type="number" 
                            defaultValue={cat.rate_low_usd} 
                            className="w-24 mx-auto text-center"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end mt-4">
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  Save Rates
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="industries" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Industries</CardTitle>
              <CardDescription>
                Configure industries with fiscal year-end dates. This determines the default season for Work Orders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Industry Name</TableHead>
                      <TableHead className="font-semibold">Fiscal Year-End</TableHead>
                      <TableHead className="font-semibold">Default Season</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {industriesLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        </TableRow>
                      ))
                    ) : industries?.map((ind) => {
                      const isHighSeason = ind.fiscal_year_end.includes("December");
                      return (
                        <TableRow key={ind.industry_id}>
                          <TableCell className="font-medium">{ind.industry_name}</TableCell>
                          <TableCell>{ind.fiscal_year_end}</TableCell>
                          <TableCell>
                            <span className={isHighSeason ? "text-accent font-medium" : "text-muted-foreground"}>
                              {isHighSeason ? "High" : "Low"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="global" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Global Settings</CardTitle>
              <CardDescription>
                System-wide configuration values.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {settingsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">VAT Tax Rate (%)</Label>
                    <Input 
                      id="taxRate" 
                      type="number" 
                      step="0.01" 
                      defaultValue={parseFloat(getSetting('TAX_RATE')) * 100 || 13} 
                      className="max-w-[200px]" 
                    />
                    <p className="text-sm text-muted-foreground">Applied to gross-up fee calculations</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dailyLimit">Daily Hour Limit</Label>
                    <Input 
                      id="dailyLimit" 
                      type="number" 
                      defaultValue={getSetting('DAILY_LIMIT') || 10} 
                      className="max-w-[200px]" 
                    />
                    <p className="text-sm text-muted-foreground">Maximum hours per day in time sheets</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weeklyLimit">Weekly Hour Limit</Label>
                    <Input 
                      id="weeklyLimit" 
                      type="number" 
                      defaultValue={getSetting('WEEKLY_LIMIT') || 50} 
                      className="max-w-[200px]" 
                    />
                    <p className="text-sm text-muted-foreground">Maximum hours per week</p>
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Activity Codes</CardTitle>
              <CardDescription>
                Standard activity codes for time tracking.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold w-24">Code</TableHead>
                      <TableHead className="font-semibold">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activitiesLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        </TableRow>
                      ))
                    ) : activityCodes?.map((act) => (
                      <TableRow key={act.activity_id}>
                        <TableCell className="font-mono">{act.activity_code}</TableCell>
                        <TableCell>{act.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Settings;
