import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
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
import { ActivityCode } from "@/hooks/useEmsData";
import { useCreateActivityCode, useUpdateActivityCode, useDeleteActivityCode } from "@/hooks/mutations";
import { Trash2 } from "lucide-react";

const formSchema = z.object({
  activity_code: z.string().min(1, "Code is required").max(5, "Max 5 characters"),
  description: z.string().min(1, "Description is required"),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface ActivityCodeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityCode?: ActivityCode | null;
}

export function ActivityCodeForm({ open, onOpenChange, activityCode }: ActivityCodeFormProps) {
  const { t } = useTranslation();
  const isEdit = !!activityCode;
  const createMutation = useCreateActivityCode();
  const updateMutation = useUpdateActivityCode();
  const deleteMutation = useDeleteActivityCode();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      activity_code: "",
      description: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        activity_code: activityCode?.activity_code || "",
        description: activityCode?.description || "",
        is_active: activityCode?.is_active ?? true,
      });
    }
  }, [open, activityCode, form]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      activity_code: data.activity_code.toUpperCase(),
      description: data.description,
      is_active: data.is_active,
    };
    if (isEdit && activityCode) {
      await updateMutation.mutateAsync({ id: activityCode.activity_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
    form.reset();
  };

  const handleDelete = async () => {
    if (activityCode) {
      await deleteMutation.mutateAsync(activityCode.activity_id);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("activity.editActivity") : t("activity.newActivity")}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="activity_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity.code")} *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., PLN"
                      maxLength={5}
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity.description")} *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Planning" {...field} />
                  </FormControl>
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
                      {t("activity.activeDescription")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
              {isEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" size="icon" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("activity.deleteActivity")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("common.confirmDelete", { name: activityCode?.activity_code })} {t("common.deleteWarning")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>
              <LoadingButton
                type="submit"
                className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("activity.createActivity")}
              </LoadingButton>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}