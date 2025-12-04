import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Engagement, useClients, useStaff } from "@/hooks/useEmsData";
import { useCreateEngagement, useUpdateEngagement, useDeleteEngagement } from "@/hooks/useEmsMutations";
import { Trash2, ArrowLeft, CalendarIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  engagement_name: z.string().min(1, "Engagement name is required"),
  engagement_code: z.string().optional(),
  client_id: z.string().min(1, "Client is required"),
  partner_id: z.string().optional(),
  manager_id: z.string().optional(),
  start_date: z.date().optional(),
  end_date: z.date().optional(),
  status: z.string(),
});

type FormData = z.infer<typeof formSchema>;

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

interface EngagementFormProps {
  engagement?: Engagement | null;
}

export function EngagementForm({ engagement }: EngagementFormProps) {
  const navigate = useNavigate();
  const isEdit = !!engagement;
  const { data: clients } = useClients();
  const { data: staff } = useStaff();
  const createMutation = useCreateEngagement();
  const updateMutation = useUpdateEngagement();
  const deleteMutation = useDeleteEngagement();

  // Filter staff for partners (category_name includes "Partner")
  const partners = staff?.filter((s) => s.category?.category_name?.toLowerCase().includes("partner"));

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      engagement_name: "",
      engagement_code: "",
      client_id: "",
      partner_id: "",
      manager_id: "",
      status: "active",
    },
  });

  useEffect(() => {
    if (engagement) {
      form.reset({
        engagement_name: engagement.engagement_name,
        engagement_code: engagement.engagement_code || "",
        client_id: engagement.client_id,
        partner_id: engagement.partner_id || "",
        manager_id: engagement.manager_id || "",
        status: engagement.status,
      });
    }
  }, [engagement, form]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      engagement_name: data.engagement_name,
      engagement_code: data.engagement_code || undefined,
      client_id: data.client_id,
      partner_id: data.partner_id || undefined,
      manager_id: data.manager_id || undefined,
      start_date: data.start_date ? format(data.start_date, "yyyy-MM-dd") : undefined,
      end_date: data.end_date ? format(data.end_date, "yyyy-MM-dd") : undefined,
      status: data.status,
    };
    if (isEdit && engagement) {
      await updateMutation.mutateAsync({ id: engagement.engagement_id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    navigate("/engagements");
  };

  const handleDelete = async () => {
    if (engagement) {
      await deleteMutation.mutateAsync(engagement.engagement_id);
      navigate("/engagements");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/engagements")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">
            {isEdit ? "Edit Engagement" : "New Engagement"}
          </h1>
        </div>
        {isEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Engagement</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{engagement?.engagement_name}"? This action cannot be undone.
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
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="engagement_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Engagement Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Annual Audit 2024" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="engagement_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Engagement Code</FormLabel>
                      <FormControl>
                        <Input placeholder="ENG-001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a client" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients?.filter((c) => c.is_active).map((client) => (
                            <SelectItem key={client.client_id} value={client.client_id}>
                              {client.client_legal_name}
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
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {statusOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg">Team</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="partner_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partner</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select partner" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {partners?.map((p) => (
                            <SelectItem key={p.staff_id} value={p.staff_id}>
                              {p.first_name} {p.last_name}
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
                  name="manager_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manager</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select manager" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {staff?.map((s) => (
                            <SelectItem key={s.staff_id} value={s.staff_id}>
                              {s.first_name} {s.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg">Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy") : "Pick a date"}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? format(field.value, "dd/MM/yyyy") : "Pick a date"}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate("/engagements")}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {isEdit ? "Save Changes" : "Create Engagement"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
