import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format amount with no decimal places and locale-specific thousand separator
export const formatAmount = (amount: number, locale: "es" | "en" = "es"): string => {
  const rounded = Math.round(amount);
  return locale === "es" 
    ? rounded.toLocaleString("es-BO", { maximumFractionDigits: 0 })
    : rounded.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
