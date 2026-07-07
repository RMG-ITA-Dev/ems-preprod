import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Sentinel stored in the form when the user explicitly picks "No aplica" —
// distinct from `undefined` (field never touched), so the Cliente-required
// validation can tell "not answered" apart from "explicitly opted out".
export const NO_APLICA_VALUE = "no_aplica";

interface TaxonomyComboboxProps {
  taxonomies: Array<{
    taxonomy_id: string;
    code: string;
    name: string;
  }>;
  value: string | undefined;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function formatTaxonomyLabel(code: string, name: string): string {
  return `${code} - ${name}`;
}

export function TaxonomyCombobox({
  taxonomies,
  value,
  onValueChange,
  disabled = false,
  placeholder,
}: TaxonomyComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = taxonomies.find((tx) => tx.taxonomy_id === value);
  const isNoAplica = value === NO_APLICA_VALUE;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid="taxonomy-combobox-trigger"
          className="w-full justify-between h-10 font-normal"
        >
          <span className="truncate">
            {selected
              ? formatTaxonomyLabel(selected.code, selected.name)
              : isNoAplica
                ? t("engagement.noAplicaTaxonomy")
                : placeholder || t("engagement.selectTaxonomy")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[--radix-popover-trigger-width] w-auto max-w-[600px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("engagement.searchTaxonomy")} />
          <CommandList>
            <CommandEmpty>{t("engagement.noMatchingTaxonomies")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={t("engagement.noAplicaTaxonomy")}
                onSelect={() => {
                  onValueChange(NO_APLICA_VALUE);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    isNoAplica ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="text-muted-foreground">{t("engagement.noAplicaTaxonomy")}</span>
              </CommandItem>
              {taxonomies.map((tx) => (
                <CommandItem
                  key={tx.taxonomy_id}
                  value={`${tx.code} ${tx.name}`}
                  onSelect={() => {
                    onValueChange(tx.taxonomy_id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === tx.taxonomy_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-medium">{tx.code}</span>
                  <span className="opacity-70 ml-2 whitespace-normal">- {tx.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
