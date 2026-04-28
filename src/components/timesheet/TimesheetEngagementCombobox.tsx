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
import type { ApprovedEngagement } from "@/hooks/useTimesheetWeek";

interface TimesheetEngagementComboboxProps {
  engagements: ApprovedEngagement[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TimesheetEngagementCombobox({
  engagements,
  value,
  onValueChange,
  disabled = false,
  placeholder,
}: TimesheetEngagementComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = engagements.find((e) => e.engagement_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between border-0 bg-transparent focus:ring-1 h-auto min-h-[2rem] font-normal px-2"
        >
          <span className="truncate text-left">
            {selected ? (
              selected.engagement_code
                ? `${selected.engagement_code} - ${selected.engagement_name}`
                : selected.engagement_name
            ) : (
              <span className="text-muted-foreground">
                {placeholder || t("timesheet.selectEngagement")}
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
          <CommandInput placeholder={t("timesheet.searchEngagement")} />
          <CommandList>
            <CommandEmpty>{t("timesheet.noMatchingEngagements")}</CommandEmpty>
            <CommandGroup>
              {engagements.map((eng) => (
                <CommandItem
                  key={eng.engagement_id}
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
                      <span className="text-xs opacity-70">
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
