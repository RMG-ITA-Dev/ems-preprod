import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  SheetHeader,
  SheetTitle,
  SheetFooter,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Industry } from "@/hooks/useEmsData";
import { useCreateIndustry, useUpdateIndustry, useDeleteIndustry } from "@/hooks/useEmsMutations";
import { Trash2 } from "lucide-react";

const fiscalYearOptions = [
  "December 31",
  "March 31",
  "June 30",
  "September 30",
];

const formSchema = z.object({
  industry_name: z.string().min(1, "Industry name is required"),
  fiscal_year_end: z.string().min(1, "Fiscal year-end is required"),
});

type FormData = z.infer<typeof formSchema>;

interface IndustryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  industry?: Industry | null;
}

export function IndustryForm({ open, onOpenChange, industry }: IndustryFormProps) {
  const isEdit = !!industry;
  const createMutation = useCreateIndustry();
  const updateMutation = useUpdateIndustry();
  const deleteMutation = useDeleteIndustry();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      industry_name: industry?.industry_name || "",
      fiscal_year_end: industry?.fiscal_year_end || "",
    },
  });

  const onSubmit = async (data: FormData) => {
    if (isEdit && industry) {
      await updateMutation.mutateAsync({ id: industry.industry_id, data: { industry_name: data.industry_name, fiscal_year_end: data.fiscal_year_end } });
    } else {
      await createMutation.mutateAsync({ industry_name: data.industry_name, fiscal_year_end: data.fiscal_year_end });
    }
    onOpenChange(false);
    form.reset();
  };

  const handleDelete = async () => {
    if (industry) {
      await deleteMutation.mutateAsync(industry.industry_id);
      onOpenChange(false);
    }
  };

  const isHighSeason = form.watch("fiscal_year_end")?.includes("December");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Industry" : "New Industry"}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="industry_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Industry Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Banking, Mining" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fiscal_year_end"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fiscal Year-End *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select fiscal year-end" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fiscalYearOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("fiscal_year_end") && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Default Season:{" "}
                  <span className={isHighSeason ? "text-accent font-medium" : "text-foreground"}>
                    {isHighSeason ? "High Season" : "Low Season"}
                  </span>
                </p>
              </div>
            )}

            <SheetFooter className="flex gap-2 pt-4">
              {isEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Industry</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{industry?.industry_name}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? "Save Changes" : "Create Industry"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
