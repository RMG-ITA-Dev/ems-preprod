import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface RateFromDatePickerProps {
  /** Fecha elegida (yyyy-MM-dd), o null si todavía no se eligió ninguna. */
  value: string | null;
  /** Recibe la fecha en yyyy-MM-dd, en hora local: un toISOString la correría de día. */
  onPick: (date: string) => void;
  disabled?: boolean;
  /** Mientras se trae el TC de la fecha elegida: el botón gira y no deja elegir otra. */
  loading?: boolean;
  /** Solo el ícono, para las celdas de la tabla del plan, donde no hay ancho para el texto. */
  compact?: boolean;
  testId: string;
  className?: string;
}

/**
 * 1028-214: el botón de calendario para traer el TC de una fecha. Es el mismo gesto en los
 * cuatro lugares donde se carga un TC (encabezado del plan, TC Facturación y TC Pago por fila,
 * y el diálogo de facturar/cobrar), así que la consulta queda afuera: este componente solo
 * elige el día. Las fechas futuras no se ofrecen porque no tienen cotización.
 */
export function RateFromDatePicker({
  value,
  onPick,
  disabled,
  loading,
  compact,
  testId,
  className,
}: RateFromDatePickerProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const locale = i18n.language?.startsWith("en") ? enUS : es;
  const selected = value ? parseISO(value) : undefined;
  const label = t("workOrders.paymentPlan.rateFromDateAria");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          aria-busy={loading || undefined}
          aria-label={label}
          title={label}
          data-testid={testId}
          className={cn("h-8 shrink-0 gap-1.5 text-xs font-normal", compact ? "w-8 px-0" : "px-2", className)}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarIcon className="h-3.5 w-3.5" />
          )}
          {!compact && (selected ? format(selected, "dd/MM/yyyy") : t("workOrders.paymentPlan.rateFromDatePick"))}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={locale}
          selected={selected}
          defaultMonth={selected}
          disabled={{ after: new Date() }}
          onSelect={(date) => {
            if (!date) return;
            setOpen(false);
            onPick(format(date, "yyyy-MM-dd"));
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
