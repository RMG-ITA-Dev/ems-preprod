import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { useCreateActivityCode, useUpdateActivityCode, useDeleteActivityCode } from "@/hooks/useEmsMutations";
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
  const isEdit = !!activityCode;
  const createMutation = useCreateActivityCode();
  const updateMutation = useUpdateActivityCode();
  const deleteMutation = useDeleteActivityCode();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      activity_code: activityCode?.activity_code || "",
      description: activityCode?.description || "",
      is_active: activityCode?.is_active ?? true,
    },
  });

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
          <SheetTitle>{isEdit ? "Edit Activity Code" : "New Activity Code"}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
            <FormField
              control={form.control}
              name="activity_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Activity Code *</FormLabel>
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
                  <FormLabel>Description *</FormLabel>
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
                    <FormLabel className="text-base">Active</FormLabel>
                    <FormDescription>
                      Active codes can be used in time entries
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

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
                      <AlertDialogTitle>Delete Activity Code</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{activityCode?.activity_code}"? This action cannot be undone.
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
                {isEdit ? "Save Changes" : "Create Activity Code"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
