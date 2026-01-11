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
import { StaffFull, useCategories } from "@/hooks/useEmsData";
import { useCreateStaff, useUpdateStaff, useDeleteStaff } from "@/hooks/mutations";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const formSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  short_name: z.string().optional(),
  initials: z.string().max(4, "Max 4 characters").optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  category_id: z.string().optional(),
  city: z.string().optional(),
  id_number: z.string().optional(),
  aud_reg_number: z.string().optional(),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

// StaffForm uses StaffFull interface since it needs PII fields for editing
interface StaffFormProps {
  staff?: StaffFull | null;
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

// Helper to generate initials suggestion
const generateInitials = (firstName: string, lastName: string): string => {
  if (!firstName || !lastName) return "";
  const firstInitial = firstName[0] || "";
  const lastNames = lastName.split(" ");
  const lastInitials = lastNames.map((n) => n[0] || "").join("");
  return `${firstInitial}${lastInitials}`.toUpperCase().slice(0, 4);
};

export function StaffForm({ staff }: StaffFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = !!staff;
  const { data: categories } = useCategories();
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      short_name: "",
      initials: "",
      email: "",
      category_id: "",
      city: "",
      id_number: "",
      aud_reg_number: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (staff) {
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
        is_active: staff.is_active,
      });
    }
  }, [staff, form]);

  // Watch first_name and last_name to auto-suggest short_name and initials
  const firstName = form.watch("first_name");
  const lastName = form.watch("last_name");
  const currentShortName = form.watch("short_name");
  const currentInitials = form.watch("initials");

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

  const onSubmit = async (data: FormData) => {
    const payload = {
      first_name: data.first_name,
      last_name: data.last_name,
      short_name: data.short_name || undefined,
      initials: data.initials || undefined,
      email: data.email || undefined,
      category_id: data.category_id || undefined,
      city: data.city || undefined,
      id_number: data.id_number || undefined,
      aud_reg_number: data.aud_reg_number || undefined,
      is_active: data.is_active,
    };
    if (isEdit && staff) {
      await updateMutation.mutateAsync({ id: staff.staff_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    navigate("/staff");
  };

  const handleDelete = async () => {
    if (staff) {
      await deleteMutation.mutateAsync(staff.staff_id);
      navigate("/staff");
    }
  };

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
                  {t("common.confirmDelete", { name: `${staff?.first_name} ${staff?.last_name}` })} {t("common.deleteWarning")}
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
                    <FormLabel>{t("staff.email")}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john.doe@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("staff.city")}</FormLabel>
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
                      <FormLabel>{t("staff.idNumber")}</FormLabel>
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
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.role")}</h3>
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("staff.category")}</FormLabel>
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
                        {t("staff.activeDescription")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
              <Button type="button" variant="cancel" onClick={() => navigate("/staff")} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>
              <LoadingButton
                type="submit"
                variant="default"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("staff.createStaff")}
              </LoadingButton>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
