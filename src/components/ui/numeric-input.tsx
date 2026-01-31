import * as React from "react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  /** Number of decimal places: 0 for integers, 1 for hours, 2 for currency */
  decimals?: 0 | 1 | 2;
  /** Locale for decimal separator: "es" uses comma, "en" uses period */
  locale?: "es" | "en";
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Callback with the numeric value */
  onChange?: (value: number) => void;
  /** Callback with the string value for controlled inputs */
  onValueChange?: (value: string) => void;
}

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      className,
      decimals = 2,
      locale = "en",
      min,
      max,
      value,
      onChange,
      onValueChange,
      ...props
    },
    ref
  ) => {
    // Internal state for intermediate values like "-" or "." that aren't valid numbers yet
    const [intermediateValue, setIntermediateValue] = useState<string | null>(null);
    
    const decimalSeparator = locale === "es" ? "," : ".";
    
    // Clear intermediate state when external value changes
    useEffect(() => {
      if (value !== undefined && value !== null && value !== "") {
        setIntermediateValue(null);
      }
    }, [value]);
    
    // Build regex pattern based on decimals
    const buildPattern = () => {
      if (decimals === 0) {
        return /^-?\d*$/;
      }
      const sep = locale === "es" ? "," : "\\.";
      return new RegExp(`^-?\\d*${sep}?\\d{0,${decimals}}$`);
    };

    const pattern = buildPattern();

    // Normalize value for internal use (convert comma to period for parsing)
    const normalizeValue = (val: string): string => {
      return locale === "es" ? val.replace(",", ".") : val;
    };

    // Format value for display (convert period to comma for es locale)
    const formatValue = (val: string | number | readonly string[] | undefined): string => {
      if (val === undefined || val === null || val === "") return "";
      const strVal = String(val);
      if (locale === "es") {
        return strVal.replace(".", ",");
      }
      return strVal;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows
      const allowedKeys = [
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ];

      if (allowedKeys.includes(e.key)) {
        return;
      }

      // Allow Ctrl/Cmd + A, C, V, X
      if ((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) {
        return;
      }

      // Allow minus sign - prepend to value if cursor not at start
      if (e.key === "-") {
        const input = e.currentTarget;
        const currentValue = input.value;
        
        // If min is set to 0 or positive, don't allow negative
        if (min !== undefined && min >= 0) {
          e.preventDefault();
          return;
        }
        
        // If already has minus sign, block
        if (currentValue.startsWith("-")) {
          e.preventDefault();
          return;
        }
        
        // Allow typing minus at position 0
        if (input.selectionStart === 0) {
          return;
        }
        
        // If cursor is not at start, prepend minus to value
        e.preventDefault();
        const newValue = "-" + currentValue;
        
        // Update via callbacks if available
        if (onValueChange) {
          onValueChange(newValue);
          const numericValue = parseFloat(normalizeValue(newValue));
          onChange?.(isNaN(numericValue) ? 0 : numericValue);
        } else {
          // Fallback: directly update input and trigger change via native setter
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
          )?.set;
          nativeInputValueSetter?.call(input, newValue);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        
        // Move cursor after the minus sign
        setTimeout(() => input.setSelectionRange(1, 1), 0);
        return;
      }

      // Allow decimal separator if decimals > 0
      if ((e.key === "." || e.key === ",") && decimals > 0) {
        const input = e.currentTarget;
        const currentValue = input.value;
        // Only allow one decimal separator
        if (currentValue.includes(".") || currentValue.includes(",")) {
          e.preventDefault();
          return;
        }
        return;
      }

      // Allow digits
      if (/^\d$/.test(e.key)) {
        return;
      }

      // Block everything else
      e.preventDefault();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value;

      // Allow empty string
      if (newValue === "") {
        onValueChange?.("");
        onChange?.(0);
        return;
      }

      // Allow just a minus sign or decimal separator while typing
      if (newValue === "-" || newValue === decimalSeparator) {
        setIntermediateValue(newValue);
        onValueChange?.(newValue);
        return;
      }

      // BUG #33: Allow intermediate states like "0." while typing decimals
      // Only block if value ends with separator AND has content after
      const endsWithSeparator = newValue.endsWith(decimalSeparator) || newValue.endsWith(".");
      if (endsWithSeparator && decimals > 0) {
        // Allow typing "0." on the way to "0.5"
        const baseValue = newValue.slice(0, -1);
        if (baseValue === "" || baseValue === "-" || !isNaN(parseFloat(normalizeValue(baseValue)))) {
          setIntermediateValue(newValue);
          onValueChange?.(newValue);
          return;
        }
      }

      // Check if value matches pattern
      if (!pattern.test(newValue)) {
        return;
      }

      // Parse the numeric value
      const normalizedValue = normalizeValue(newValue);
      const numericValue = parseFloat(normalizedValue);

      // BUG #33: Only enforce min constraint on blur, not during typing
      // This allows typing "0.5" without blocking at "0"
      // Max constraint is still enforced during typing to prevent overflow
      if (!isNaN(numericValue)) {
        if (max !== undefined && numericValue > max) {
          return;
        }
      }

      setIntermediateValue(null);
      onValueChange?.(newValue);
      onChange?.(isNaN(numericValue) ? 0 : numericValue);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Get the actual displayed value (could be from intermediateValue or input)
      let currentValue = intermediateValue !== null ? intermediateValue : e.target.value;
      
      // Clear intermediate state first
      setIntermediateValue(null);

      // Clean up trailing decimal separator
      if (currentValue.endsWith(decimalSeparator) || currentValue.endsWith(".")) {
        currentValue = currentValue.slice(0, -1);
        onValueChange?.(currentValue);
        // Also need to notify onChange with the cleaned-up numeric value
        if (currentValue !== "" && currentValue !== "-") {
          const normalizedValue = normalizeValue(currentValue);
          const numericValue = parseFloat(normalizedValue);
          if (!isNaN(numericValue)) {
            onChange?.(numericValue);
          }
        }
      }

      // Clean up lone minus sign
      if (currentValue === "-") {
        onValueChange?.("");
        onChange?.(0);
        props.onBlur?.(e);
        return;
      }

      // BUG #33: Enforce min constraint on blur (after user finishes typing)
      if (currentValue !== "") {
        const normalizedValue = normalizeValue(currentValue);
        const numericValue = parseFloat(normalizedValue);
        if (!isNaN(numericValue) && min !== undefined && numericValue < min) {
          const minStr = locale === "es" ? String(min).replace(".", ",") : String(min);
          onValueChange?.(minStr);
          onChange?.(min);
        }
      }

      props.onBlur?.(e);
    };

    return (
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm hide-spinners",
          className
        )}
        ref={ref}
        value={intermediateValue !== null ? intermediateValue : formatValue(value)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        {...props}
      />
    );
  }
);
NumericInput.displayName = "NumericInput";

export { NumericInput };
export type { NumericInputProps };
