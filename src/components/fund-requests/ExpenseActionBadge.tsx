import { cn } from "@/lib/utils";

type Tone = "cta" | "warning" | "info" | "muted";

const toneStyles: Record<Tone, string> = {
  cta: "bg-brand-purple/15 text-brand-purple border-brand-purple/30 animate-pulse",
  warning: "bg-warning/15 text-warning border-warning/40",
  info: "bg-info/15 text-info border-info/30",
  muted: "bg-muted text-muted-foreground border-border",
};

interface Props {
  count?: number;
  label: string;
  tone?: Tone;
  className?: string;
}

/**
 * Indicador compacto para las listas: "3 por aprobar", "Registrar gastos", etc.
 * Si count se pasa, lo antepone; si es 0/undefined y no es CTA, no renderiza nada.
 */
export function ExpenseActionBadge({ count, label, tone = "info", className }: Props) {
  if (count !== undefined && count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneStyles[tone],
        className,
      )}
    >
      {count !== undefined && <span className="font-semibold">{count}</span>}
      {label}
    </span>
  );
}
