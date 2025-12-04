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

// Mock data
const mockCategories = [
  { id: 1, name: "Partner", rateHighBOB: 1530, rateLowBOB: 1400, rateHighUSD: 153, rateLowUSD: 140 },
  { id: 2, name: "Manager", rateHighBOB: 700, rateLowBOB: 600, rateHighUSD: 70, rateLowUSD: 60 },
  { id: 3, name: "Senior", rateHighBOB: 350, rateLowBOB: 280, rateHighUSD: 35, rateLowUSD: 28 },
  { id: 4, name: "Staff", rateHighBOB: 200, rateLowBOB: 170, rateHighUSD: 20, rateLowUSD: 17 },
  { id: 5, name: "Junior", rateHighBOB: 100, rateLowBOB: 90, rateHighUSD: 10, rateLowUSD: 9 },
];

const mockIndustries = [
  { id: 1, name: "Mining", fiscalYearEnd: "September 30", defaultSeason: "Low" },
  { id: 2, name: "Banking", fiscalYearEnd: "December 31", defaultSeason: "High" },
  { id: 3, name: "Oil & Gas", fiscalYearEnd: "December 31", defaultSeason: "High" },
  { id: 4, name: "Manufacturing", fiscalYearEnd: "December 31", defaultSeason: "High" },
];

const Settings = () => {
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
                    {mockCategories.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium border-r">{cat.name}</TableCell>
                        <TableCell className="text-center">
                          <Input 
                            type="number" 
                            defaultValue={cat.rateHighBOB} 
                            className="w-24 mx-auto text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center border-r">
                          <Input 
                            type="number" 
                            defaultValue={cat.rateLowBOB} 
                            className="w-24 mx-auto text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input 
                            type="number" 
                            defaultValue={cat.rateHighUSD} 
                            className="w-24 mx-auto text-center"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input 
                            type="number" 
                            defaultValue={cat.rateLowUSD} 
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
                    {mockIndustries.map((ind) => (
                      <TableRow key={ind.id}>
                        <TableCell className="font-medium">{ind.name}</TableCell>
                        <TableCell>{ind.fiscalYearEnd}</TableCell>
                        <TableCell>
                          <span className={ind.defaultSeason === "High" ? "text-accent font-medium" : "text-muted-foreground"}>
                            {ind.defaultSeason}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="taxRate">VAT Tax Rate (%)</Label>
                  <Input id="taxRate" type="number" step="0.01" defaultValue="13" className="max-w-[200px]" />
                  <p className="text-sm text-muted-foreground">Applied to gross-up fee calculations</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dailyLimit">Daily Hour Limit</Label>
                  <Input id="dailyLimit" type="number" defaultValue="10" className="max-w-[200px]" />
                  <p className="text-sm text-muted-foreground">Maximum hours per day in time sheets</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weeklyLimit">Weekly Hour Limit</Label>
                  <Input id="weeklyLimit" type="number" defaultValue="50" className="max-w-[200px]" />
                  <p className="text-sm text-muted-foreground">Maximum hours per week</p>
                </div>
              </div>
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
                    <TableRow><TableCell className="font-mono">PLN</TableCell><TableCell>Planning</TableCell></TableRow>
                    <TableRow><TableCell className="font-mono">FLD</TableCell><TableCell>Fieldwork</TableCell></TableRow>
                    <TableRow><TableCell className="font-mono">REV</TableCell><TableCell>Review</TableCell></TableRow>
                    <TableRow><TableCell className="font-mono">DOC</TableCell><TableCell>Documentation</TableCell></TableRow>
                    <TableRow><TableCell className="font-mono">ADM</TableCell><TableCell>Administration</TableCell></TableRow>
                    <TableRow><TableCell className="font-mono">MTG</TableCell><TableCell>Meetings</TableCell></TableRow>
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
