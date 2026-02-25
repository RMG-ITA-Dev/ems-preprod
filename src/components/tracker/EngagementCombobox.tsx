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
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface EngagementComboboxProps {
  engagements: Array<{
    engagement_id: string;
    engagement_code: string | null;
    engagement_name: string;
  }>;
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function formatEngagementLabel(code: string | null, name: string): string {
  return code ? `${code} - ${name}` : name;
}

export function EngagementCombobox({
  engagements,
  value,
  onValueChange,
  disabled = false,
  placeholder,
}: EngagementComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = engagements.find((e) => e.engagement_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between h-10 font-normal"
        >
          <span className="truncate">
            {selected
              ? formatEngagementLabel(selected.engagement_code, selected.engagement_name)
              : placeholder || t("tracker.selectEngagement")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[--radix-popover-trigger-width] w-auto max-w-[600px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("tracker.searchEngagement")} />
          <CommandList>
            <CommandEmpty>{t("tracker.noMatchingEngagements")}</CommandEmpty>
            <CommandGroup>
              {engagements.map((eng) => (
                <CommandItem
                  key={eng.engagement_id}
                  value={`${eng.engagement_code ?? ""} ${eng.engagement_name}`}
                  onSelect={() => {
                    onValueChange(eng.engagement_id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === eng.engagement_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {eng.engagement_code ? (
                    <>
                      <span className="font-medium">{eng.engagement_code}</span>
                      <span className="opacity-70 ml-2 whitespace-normal">- {eng.engagement_name}</span>
                    </>
                  ) : (
                    <span>{eng.engagement_name}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
