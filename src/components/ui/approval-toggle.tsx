import { cn } from "@/lib/utils";
import { Check, Clock, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export type ApprovalDecision = "pending" | "approve" | "reject";

interface ApprovalToggleProps {
  value: ApprovalDecision;
  onChange: (value: ApprovalDecision) => void;
  disabled?: boolean;
}

export function ApprovalToggle({ value, onChange, disabled }: ApprovalToggleProps) {
  const { t } = useTranslation();

  const options: { key: ApprovalDecision; icon: typeof Clock; label: string }[] = [
    { key: "pending", icon: Clock, label: t("approval.decision.pending") },
    { key: "approve", icon: Check, label: t("approval.decision.approve") },
    { key: "reject", icon: X, label: t("approval.decision.reject") },
  ];

  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.key;
        
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              // Pending state
              option.key === "pending" && isSelected && "bg-muted text-muted-foreground",
              option.key === "pending" && !isSelected && "hover:bg-muted/50 text-muted-foreground/60",
              // Approve state
              option.key === "approve" && isSelected && "bg-success text-success-foreground",
              option.key === "approve" && !isSelected && "hover:bg-success/10 text-success/60",
              // Reject state
              option.key === "reject" && isSelected && "bg-destructive text-destructive-foreground",
              option.key === "reject" && !isSelected && "hover:bg-destructive/10 text-destructive/60",
              // Border between buttons
              "border-r border-border last:border-r-0"
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
