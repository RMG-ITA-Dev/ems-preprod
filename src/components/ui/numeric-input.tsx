import * as React from "react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  /**
   * Number of decimal places: 0 for integers, 1 for hours, 2 for currency amounts.
   * Up to 6 for high-precision rates (e.g. exchange rates), which are stored as
   * unbounded NUMERIC and are not rounded by any downstream calculation.
   */
  decimals?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Locale for the DISPLAYED decimal separator: "es" shows a comma, "en" a period.
   * Both separators are always accepted on input regardless of this value.
   */
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

    // Both separators are accepted while typing (a Spanish numpad emits ",", an
    // English one "."); `locale` only decides which one is echoed back.
    const toDisplay = (val: string) => val.replace(/[.,]/, decimalSeparator);

    // Clear intermediate state when external value changes
    useEffect(() => {
      if (value === undefined || value === null) return;
      setIntermediateValue((prev) => {
        if (prev === null) return null;
        // BUG 0722-164: el padre vació el campo (su modelo volvió a 0 y lo pasa
        // como ""). Es un reset externo: el borrador ya no corresponde y hay que
        // soltarlo, o quedaría texto viejo montado sobre un modelo vacío.
        if (value === "") return null;
        // BUG 0722-164: distinguir un cambio EXTERNO (hidratar/resetear el campo)
        // de la propia emisión de este input. Al editar 100,15 → "100,0" el
        // onChange mueve el value del padre (100.15 → 100) y este efecto borraba
        // el texto que se acababa de guardar: la tecla siguiente daba 1005. Si el
        // value nuevo es justo el número que representa ese texto, el cambio vino
        // de acá y hay que conservarlo; cualquier otro valor sí lo reemplaza.
        const parsedPrev = parseFloat(prev.replace(",", "."));
        return !isNaN(parsedPrev) && parsedPrev === Number(value) ? prev : null;
      });
    }, [value]);
    
    // Build regex pattern based on decimals
    const buildPattern = () => {
      if (decimals === 0) {
        return /^-?\d*$/;
      }
      // Accept either separator on input; `locale` governs display only.
      return new RegExp(`^-?\\d*[.,]?\\d{0,${decimals}}$`);
    };

    const pattern = buildPattern();

    // Normalize value for internal use (parse with a period regardless of locale)
    const normalizeValue = (val: string): string => val.replace(",", ".");

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
    const newValue = e.target.value;

      // Allow empty string
      if (newValue === "") {
        // BUG 0722-164: limpiar el borrador. Si el campo tenía texto preservado
        // ("100,0") y se selecciona todo y se borra, sin esto el input seguía
        // mostrando ese resto (el padre ya está en 0) y la tecla siguiente se
        // pegaba a él, guardando un monto ajeno al que se ve.
        setIntermediateValue(null);
        onValueChange?.("");
        onChange?.(0);
        return;
      }

      // Allow just a minus sign or either decimal separator while typing
      if (newValue === "-" || newValue === "." || newValue === ",") {
        const display = toDisplay(newValue);
        setIntermediateValue(display);
        onValueChange?.(display);
        return;
      }

      // BUG #33: Allow intermediate states like "0." while typing decimals
      // Only block if value ends with separator AND has content after
      const endsWithSeparator = /[.,]$/.test(newValue);
      if (endsWithSeparator && decimals > 0) {
        // Allow typing "0." on the way to "0.5"
        const baseValue = newValue.slice(0, -1);
        if (baseValue === "" || baseValue === "-" || !isNaN(parseFloat(normalizeValue(baseValue)))) {
          const display = toDisplay(newValue);
          setIntermediateValue(display);
          onValueChange?.(display);
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

      // BUG 0722-164: conservar el texto tecleado mientras NO sea la forma
      // canónica del número. "100,0" parsea a 100 y, al limpiar el intermedio,
      // el input volvía a renderizar el `value` del padre ("100"), borrando el
      // ",0" recién tecleado: la tecla siguiente aterrizaba sobre el entero y
      // "100,05" terminaba guardado como 1005 — un monto equivocado, en silencio.
      // Afectaba a todo decimal que empiece en 0 (x,0y) y al cero final ("1250,50").
      //
      // Los ceros a la IZQUIERDA quedan fuera: son ruido que el número ya
      // representa ("00" → 0, "007" → 7). Conservarlos rompía escribir sobre un
      // campo que ya muestra "0" — tecleando "0.5" quedaba "00.5".
      const display = toDisplay(newValue);
      const withoutLeadingZeros = normalizedValue.replace(/^(-?)0+(?=\d)/, "$1");
      const isFractionalDraft = withoutLeadingZeros !== String(numericValue);
      setIntermediateValue(isFractionalDraft ? display : null);
      onValueChange?.(display);
      onChange?.(isNaN(numericValue) ? 0 : numericValue);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Get the actual displayed value (could be from intermediateValue or input)
      let currentValue = intermediateValue !== null ? intermediateValue : e.target.value;
      
      // Clear intermediate state first
      setIntermediateValue(null);

      // Clean up trailing decimal separator (either one)
      if (/[.,]$/.test(currentValue)) {
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
