import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClientFull, useIndustries } from "@/hooks/useEmsData";
import { useCreateClient, useUpdateClient, useDeleteClient } from "@/hooks/mutations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

const formSchema = z.object({
  client_legal_name: z.string().min(1, "Client name is required"),
  unique_tax_id: z.string().min(1, "NIT is required"),
  industry_id: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email("Invalid email").optional().or(z.literal("")),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface ClientFormProps {
  client?: ClientFull | null;
  compact?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel?: () => void;
  onSaveSuccess?: () => void;
}

export function ClientForm({ client, compact = false, onDirtyChange, onCancel, onSaveSuccess }: ClientFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = !!client;
  const { data: industries } = useIndustries();
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();

  const { data: engagementCount } = useQuery({
    queryKey: ['client-engagement-count', client?.client_id],
    queryFn: async () => {
      const { count } = await supabase
        .from('engagements')
        .select('engagement_id', { count: 'exact', head: true })
        .eq('client_id', client!.client_id);
      return count || 0;
    },
    enabled: isEdit && !!client?.client_id,
  });

  const hasEngagements = isEdit && (engagementCount || 0) > 0;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      client_legal_name: "",
      unique_tax_id: "",
      industry_id: "",
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      address: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        client_legal_name: client.client_legal_name,
        unique_tax_id: client.unique_tax_id,
        industry_id: client.industry_id || "",
        contact_name: client.contact_name || "",
        contact_email: client.contact_email || "",
        contact_phone: client.contact_phone || "",
        address: client.address || "",
        is_active: client.is_active,
      });
    }
  }, [client, form]);

  // Report dirty state to parent
  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const onSubmit = async (data: FormData) => {
    // Normalize name to match DB constraint: LOWER(TRIM(client_legal_name))
    // UI check is best-effort; DB constraint is source of truth for TRIM+LOWER normalization.
    const trimmedName = data.client_legal_name.trim();

    // Pre-save duplicate NIT check
    let nitQuery = supabase
      .from("clients")
      .select("client_id, client_legal_name")
      .eq("unique_tax_id", data.unique_tax_id);
    if (client?.client_id) {
      nitQuery = nitQuery.neq("client_id", client.client_id);
    }
    const { data: existingByNit, error: nitError } = await nitQuery.limit(1);

    if (nitError) {
      toast.error(t("errors.duplicateCheckFailed"));
      return;
    }
    if (existingByNit && existingByNit.length > 0) {
      toast.error(t("errors.duplicateNit", { nit: data.unique_tax_id, name: existingByNit[0].client_legal_name }));
      return;
    }

    // Pre-save duplicate name check (case-insensitive)
    let nameQuery = supabase
      .from("clients")
      .select("client_id, unique_tax_id")
      .ilike("client_legal_name", trimmedName);
    if (client?.client_id) {
      nameQuery = nameQuery.neq("client_id", client.client_id);
    }
    const { data: existingByName, error: nameError } = await nameQuery.limit(1);

    if (nameError) {
      toast.error(t("errors.duplicateCheckFailed"));
      return;
    }
    if (existingByName && existingByName.length > 0) {
      toast.error(t("errors.duplicateClientNameWithNit", { nit: existingByName[0].unique_tax_id }));
      return;
    }

    const payload = {
      client_legal_name: trimmedName,
      unique_tax_id: data.unique_tax_id,
      industry_id: data.industry_id || undefined,
      contact_name: data.contact_name || undefined,
      contact_email: data.contact_email || undefined,
      contact_phone: data.contact_phone || undefined,
      address: data.address || undefined,
      is_active: data.is_active,
    };
    if (isEdit && client) {
      await updateMutation.mutateAsync({ id: client.client_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    if (onSaveSuccess) {
      onSaveSuccess();
    } else {
      navigate("/clients");
    }
  };

  const handleDelete = async () => {
    if (!client) return;

    // Safety pre-check
    const { count } = await supabase
      .from('engagements')
      .select('engagement_id', { count: 'exact', head: true })
      .eq('client_id', client.client_id);

    if (count && count > 0) {
      toast.error(t("client.cannotDelete"), {
        description: t("client.cannotDeleteTooltip"),
      });
      return;
    }

    await deleteMutation.mutateAsync(client.client_id);
    if (onSaveSuccess) {
      onSaveSuccess();
    } else {
      navigate("/clients");
    }
  };

  // Compact layout for edit page with engagement list
  if (compact) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <FormField
                control={form.control}
                name="client_legal_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.legalName")} *</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="Company Name S.A." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unique_tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.nitLabel")} *</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="123456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="industry_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.industry")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder={t("client.selectIndustry")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {industries?.map((ind) => (
                          <SelectItem key={ind.industry_id} value={ind.industry_id}>
                            {ind.industry_name}
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
                  <FormItem className="flex items-center gap-2 pt-5">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="text-sm">{t("common.active")}</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactName")}</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactEmail")}</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" type="email" placeholder="contact@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactPhone")}</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="+591 12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.address")}</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="Street, City" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="cancel" size="sm" onClick={() => onCancel ? onCancel() : navigate("/clients")}>
                {t("common.cancel")}
              </Button>
              <LoadingButton
                type="submit"
                size="sm"
                variant="default"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {t("common.saveChanges")}
              </LoadingButton>
            </div>
          </form>
        </Form>
      </div>
    );
  }

  // Full layout for new client page
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {isEdit ? t("client.editClient") : t("client.newClient")}
        </h1>
        {isEdit && hasEngagements && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="destructive" disabled>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("common.delete")}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("client.cannotDeleteTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isEdit && !hasEngagements && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("common.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("client.deleteClient")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("common.confirmDelete", { name: client?.client_legal_name })} {t("common.deleteWarning")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
              <h3 className="font-medium text-lg">{t("common.basicInfo")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="client_legal_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("client.legalName")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="Company Name S.A." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unique_tax_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("client.nitLabel")} *</FormLabel>
                      <FormControl>
                        <Input placeholder="123456789" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="industry_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("client.industry")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("client.selectIndustry")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {industries?.map((ind) => (
                            <SelectItem key={ind.industry_id} value={ind.industry_id}>
                              {ind.industry_name}
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
                          {t("client.activeDescription")}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg">{t("common.contactInfo")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("client.contactName")}</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("client.contactEmail")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contact@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("client.contactPhone")}</FormLabel>
                      <FormControl>
                        <Input placeholder="+591 12345678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("client.address")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Street, City, Country" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
              <Button type="button" variant="cancel" onClick={() => onCancel ? onCancel() : navigate("/clients")} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                {t("common.cancel")}
              </Button>
              <LoadingButton
                type="submit"
                variant="default"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? t("common.saveChanges") : t("client.createClient")}
              </LoadingButton>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}