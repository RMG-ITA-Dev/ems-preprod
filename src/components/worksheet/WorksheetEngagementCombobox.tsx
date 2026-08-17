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

interface WorksheetEngagementOption {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  client?: { client_legal_name: string } | null;
}

interface WorksheetEngagementComboboxProps {
  engagements: WorksheetEngagementOption[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function WorksheetEngagementCombobox({
  engagements,
  value,
  onValueChange,
  disabled = false,
  placeholder,
}: WorksheetEngagementComboboxProps) {
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
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {selected ? (
              selected.engagement_code
                ? `${selected.engagement_code} - ${selected.engagement_name}`
                : selected.engagement_name
            ) : (
              <span className="text-muted-foreground">
                {placeholder || t("engagement.selectClient")}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-[--radix-popover-trigger-width] w-auto max-w-[600px] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={t("worksheet.searchEngagement")} />
          <CommandList>
            <CommandEmpty>{t("worksheet.noEngagementResults")}</CommandEmpty>
            <CommandGroup>
              {engagements.map((eng) => (
                <CommandItem
                  key={eng.engagement_id}
                  className="group"
                  value={`${eng.engagement_code ?? ""} ${eng.engagement_name} ${eng.client?.client_legal_name ?? ""}`}
                  onSelect={() => {
                    onValueChange(eng.engagement_id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === eng.engagement_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center">
                      {eng.engagement_code && (
                        <span className="font-mono text-xs opacity-60 mr-2 shrink-0">
                          {eng.engagement_code}
                        </span>
                      )}
                      <span className="truncate">{eng.engagement_name}</span>
                    </div>
                    {eng.client?.client_legal_name && (
                      // BUG 0526-124: `text-muted-foreground` would otherwise clash with
                      // CommandItem's `data-[selected=true]:text-accent-foreground` on the parent.
                      <span className="text-xs opacity-70 text-muted-foreground group-data-[selected=true]:text-accent-foreground">
                        {eng.client.client_legal_name}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
