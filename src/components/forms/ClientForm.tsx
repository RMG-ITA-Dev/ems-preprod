import { useEffect, useMemo, useState } from "react";
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
import { useCreateClient, useUpdateClient, useDeleteClient, useSaveClientContacts } from "@/hooks/mutations";
import { useAuthorization } from "@/hooks/useAuthorization";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useClientContacts, firstContactOfType } from "@/hooks/useClientContacts";

export // Antes era z.string() sin validar: aceptaba cualquier texto. Se permiten dígitos y los
// separadores de uso corriente (+ espacio guion paréntesis) y se exigen al menos 7 dígitos
// reales, para que ni "abc" ni "(( ))" pasen. Vacío sigue siendo válido porque el teléfono es
// opcional. Cobranzas Fase 5: se extrae para reutilizarlo en los dos contactos.
const phoneSchema = z
  .string()
  .trim()
  .max(20, "Phone cannot exceed 20 characters")
  .refine((v) => v === "" || /^\+?[\d\s()-]+$/.test(v), {
    message: "Phone can only contain digits and + - ( ) or spaces",
  })
  .refine((v) => v === "" || (v.match(/\d/g)?.length ?? 0) >= 7, {
    message: "Phone must contain at least 7 digits",
  })
  .optional();

// Los mensajes de los contactos pasan por i18n: eran texto fijo en español (y el de formato de
// correo en inglés), así que según qué fallara el formulario mezclaba idiomas. `t` por defecto
// devuelve la clave, que es lo que ven los tests del schema.
type Translate = (key: string) => string;

export const buildFormSchema = (t: Translate = (k) => k) => z.object({
  client_legal_name: z.string().min(1, "Client name is required"),
  unique_tax_id: z
    .string()
    .min(1, "NIT is required")
    .max(15, "NIT cannot exceed 15 digits")
    .regex(/^\d+$/, "NIT must contain only digits (0–9)"),
  industry_id: z.string().optional(),
  // Cobranzas Fase 5 (issue #352, decisiones Q20/Q52): el cliente pasa de UN contacto suelto a
  // dos CONTACTOS con tipo, los dos obligatorios. El de cobranza (finanzas) es a quien se le
  // reclama una factura, y casi nunca es el mismo que el contacto del encargo.
  // El CORREO tambien es obligatorio en los dos (decision del operador 2026-10-20): el cobro se
  // reclama por correo, asi que un contacto sin correo no sirve para lo unico que tiene que
  // servir. El telefono sigue siendo opcional.
  contact_general_name: z.string().trim().min(1, t("validation.contactGeneralRequired")),
  contact_general_email: z.string().trim().min(1, t("validation.emailRequired")).email(t("validation.emailInvalid")),
  contact_general_phone: phoneSchema,
  contact_cobranza_name: z.string().trim().min(1, t("validation.contactCobranzaRequired")),
  contact_cobranza_email: z.string().trim().min(1, t("validation.emailRequired")).email(t("validation.emailInvalid")),
  contact_cobranza_phone: phoneSchema,
  address: z.string().optional(),
  is_active: z.boolean(),
});

export const formSchema = buildFormSchema();

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
  const { can } = useAuthorization();
  const isEdit = !!client;
  // Al editar, el guardado exige client.update; al crear, la ruta ya gatea client.create.
  const canSave = !isEdit || can("client.update");
  const { data: industries } = useIndustries();
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  // Cobranzas Fase 5: los contactos ya no son columnas de la ficha; se leen y se guardan
  // aparte, y la RPC valida que haya al menos uno de cada tipo.
  const saveContacts = useSaveClientContacts();
  const { data: clientContacts, isFetched: contactsFetched } = useClientContacts(client?.client_id);
  const generalContact = firstContactOfType(clientContacts, "general");
  const cobranzaContact = firstContactOfType(clientContacts, "cobranza");
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

  const schema = useMemo(() => buildFormSchema(t), [t]);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_legal_name: "",
      unique_tax_id: "",
      industry_id: "",
      contact_general_name: "",
      contact_general_email: "",
      contact_general_phone: "",
      contact_cobranza_name: "",
      contact_cobranza_email: "",
      contact_cobranza_phone: "",
      address: "",
      is_active: true,
    },
  });

  // Se carga la ficha cuando llegaron el cliente Y sus contactos. Los contactos vienen en otra
  // consulta que casi siempre llega después: antes el formulario se reseteaba dos veces, y si en
  // el medio se empezaba a escribir, el segundo reset borraba lo tecleado. Hasta esa primera
  // carga los campos quedan deshabilitados (`loaded`), así que no hay nada que perder; después,
  // una consulta repetida en segundo plano no pisa un formulario con cambios.
  const [loaded, setLoaded] = useState(!client);
  useEffect(() => {
    if (client && contactsFetched && (!loaded || !form.formState.isDirty)) {
      form.reset({
        client_legal_name: client.client_legal_name,
        unique_tax_id: client.unique_tax_id,
        industry_id: client.industry_id || "",
        // Cobranzas Fase 5: los contactos ya no son columnas de `clients`, llegan de
        // client_contacts. Se toma el primer activo de cada tipo: puede haber varios (Q52),
        // pero el formulario edita el principal de cada uno.
        contact_general_name: generalContact?.full_name ?? "",
        contact_general_email: generalContact?.email ?? "",
        contact_general_phone: generalContact?.phone ?? "",
        contact_cobranza_name: cobranzaContact?.full_name ?? "",
        contact_cobranza_email: cobranzaContact?.email ?? "",
        contact_cobranza_phone: cobranzaContact?.phone ?? "",
        address: client.address || "",
        is_active: client.is_active,
      });
      setLoaded(true);
    }
  }, [client, form, contactsFetched, loaded, generalContact, cobranzaContact]);

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
      address: data.address || undefined,
      is_active: data.is_active,
    };

    // Cobranzas Fase 5: los contactos se guardan aparte, con su propia RPC, que valida el
    // mínimo de uno activo por tipo. Van DESPUÉS de la ficha porque al crear hace falta el
    // client_id que devuelve el alta.
    const contactsPayload = [
      {
        contact_id: generalContact?.contact_id,
        contact_type: "general" as const,
        full_name: data.contact_general_name,
        email: data.contact_general_email,
        phone: data.contact_general_phone,
      },
      {
        contact_id: cobranzaContact?.contact_id,
        contact_type: "cobranza" as const,
        full_name: data.contact_cobranza_name,
        email: data.contact_cobranza_email,
        phone: data.contact_cobranza_phone,
      },
      // El resto de los contactos activos viaja SIN TOCAR. El formulario edita uno de cada
      // tipo, pero el modelo admite varios (Q52), y la RPC desactiva todo contacto activo que
      // no venga en la lista: sin esto, guardar la ficha —para corregir una dirección, por
      // ejemplo— borraba en silencio un segundo contacto de cobranza.
      ...(clientContacts ?? [])
        .filter(
          (c) =>
            c.is_active &&
            c.contact_id !== generalContact?.contact_id &&
            c.contact_id !== cobranzaContact?.contact_id,
        )
        .map((c) => ({
          contact_id: c.contact_id,
          contact_type: c.contact_type,
          full_name: c.full_name,
          email: c.email,
          phone: c.phone,
        })),
    ];

    if (isEdit && client) {
      await updateMutation.mutateAsync({ id: client.client_id, data: payload });
      await saveContacts.mutateAsync({ clientId: client.client_id, contacts: contactsPayload });
    } else {
      // El alta no puede devolver la fila creada: el RETURNING la haría pasar por la policy
      // de LECTURA de clients, que varios roles no pasan (ver useCreateClient). Así que el id
      // se genera acá y se manda, y los contactos se guardan contra ese mismo id.
      const newClientId = crypto.randomUUID();
      await createMutation.mutateAsync({ ...payload, client_id: newClientId });
      await saveContacts.mutateAsync({ clientId: newClientId, contacts: contactsPayload });
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
            <fieldset disabled={!loaded} className="contents">
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
                      <Input
                          className="h-8 text-sm"
                          placeholder="123456789"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={15}
                          {...field}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const stripped = raw.replace(/\D/g, "");
                            if (raw !== stripped) {
                              form.setError("unique_tax_id", { type: "manual", message: t("client.nitOnlyNumbers") });
                            } else {
                              form.clearErrors("unique_tax_id");
                            }
                            field.onChange(stripped);
                          }}
                        />
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
              {/* Cobranzas Fase 5 (issue #352): dos contactos con tipo, los dos
                  obligatorios. El de cobranza es el de finanzas — a quien se le reclama
                  una factura — y casi nunca es el mismo que el contacto del encargo. */}
              <FormField
                control={form.control}
                name="contact_general_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactGeneralName")} *</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_general_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactGeneralEmail")} *</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" type="email" placeholder="contact@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_general_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactGeneralPhone")}</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" inputMode="tel" placeholder="+591 12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_cobranza_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactCobranzaName")} *</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_cobranza_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactCobranzaEmail")} *</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" type="email" placeholder="contact@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_cobranza_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t("client.contactCobranzaPhone")}</FormLabel>
                    <FormControl>
                      <Input className="h-8 text-sm" inputMode="tel" placeholder="+591 12345678" {...field} />
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
              {canSave && (
                <LoadingButton
                  type="submit"
                  size="sm"
                  variant="default"
                  loading={createMutation.isPending || updateMutation.isPending}
                >
                  {t("common.saveChanges")}
                </LoadingButton>
              )}
            </div>
            </fieldset>
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
                <AlertDialogAction onClick={handleDelete} className="bg-destructive/70 text-destructive-foreground hover:bg-destructive">
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
            <fieldset disabled={!loaded} className="contents">
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
                        <Input
                          placeholder="123456789"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={15}
                          {...field}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const stripped = raw.replace(/\D/g, "");
                            if (raw !== stripped) {
                              form.setError("unique_tax_id", { type: "manual", message: t("client.nitOnlyNumbers") });
                            } else {
                              form.clearErrors("unique_tax_id");
                            }
                            field.onChange(stripped);
                          }}
                        />
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
              {/* Cobranzas Fase 5 (issue #352): dos contactos con tipo, los dos
                  obligatorios. El de cobranza es el de finanzas — a quien se le reclama
                  una factura — y casi nunca es el mismo que el contacto del encargo. */}
              <FormField
                control={form.control}
                name="contact_general_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("client.contactGeneralName")} *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_general_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("client.contactGeneralEmail")} *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="contact@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_general_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("client.contactGeneralPhone")}</FormLabel>
                    <FormControl>
                      <Input inputMode="tel" placeholder="+591 12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_cobranza_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("client.contactCobranzaName")} *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_cobranza_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("client.contactCobranzaEmail")} *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="contact@company.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_cobranza_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("client.contactCobranzaPhone")}</FormLabel>
                    <FormControl>
                      <Input inputMode="tel" placeholder="+591 12345678" {...field} />
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
              {canSave && (
                <LoadingButton
                  type="submit"
                  variant="default"
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                  loading={createMutation.isPending || updateMutation.isPending}
                >
                  {isEdit ? t("common.saveChanges") : t("client.createClient")}
                </LoadingButton>
              )}
            </div>
            </fieldset>
          </form>
        </Form>
      </div>
    </div>
  );
}