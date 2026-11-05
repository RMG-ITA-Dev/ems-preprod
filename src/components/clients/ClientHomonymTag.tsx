import { Hash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ClientHomonymTagProps {
  /** Número del cliente entre los de igual razón social (`clients_directory.homonym_seq`). */
  seq: number;
  className?: string;
}

// 1028-211: chip con el número correlativo de un cliente homónimo (#1, #2…). Es un <span> y no un
// <Badge> porque Badge renderiza un <div>, que no puede ir dentro del <span> de SelectItemText.
export function ClientHomonymTag({ seq, className }: ClientHomonymTagProps) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 align-middle text-xs font-medium text-muted-foreground",
        className,
      )}
      // Solo `title`: un aria-label reemplazaría el texto del chip en el nombre accesible de la
      // opción, y el lector de pantalla dejaría de leer el número.
      title={t("client.homonymTag", { n: seq })}
    >
      <Hash className="h-3 w-3" aria-hidden="true" />
      {seq}
    </span>
  );
}
