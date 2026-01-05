import { z } from "zod";

/**
 * Common validation schemas for reuse across forms
 */

// Basic field validations
export const requiredString = (fieldName = "This field") =>
  z.string().trim().min(1, `${fieldName} is required`);

export const optionalString = () =>
  z.string().trim().optional().or(z.literal(""));

export const email = (options?: { required?: boolean }) => {
  const base = z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters");
  
  if (options?.required) {
    return base.min(1, "Email is required");
  }
  return base.optional().or(z.literal(""));
};

export const phone = () =>
  z
    .string()
    .trim()
    .max(20, "Phone number must be less than 20 characters")
    .optional()
    .or(z.literal(""));

export const url = () =>
  z
    .string()
    .trim()
    .url("Invalid URL")
    .max(2048, "URL must be less than 2048 characters")
    .optional()
    .or(z.literal(""));

// Name validations
export const firstName = () =>
  z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(100, "First name must be less than 100 characters");

export const lastName = () =>
  z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(100, "Last name must be less than 100 characters");

export const companyName = () =>
  z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(200, "Company name must be less than 200 characters");

// Password validations
export const signinPassword = () =>
  z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be less than 100 characters");

export const signupPassword = () =>
  z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be less than 100 characters");

// Numeric validations
export const positiveNumber = (fieldName = "Value") =>
  z.number().positive(`${fieldName} must be greater than 0`);

export const nonNegativeNumber = (fieldName = "Value") =>
  z.number().min(0, `${fieldName} cannot be negative`);

export const amount = () =>
  z.number().min(0, "Amount cannot be negative");

export const hours = () =>
  z.number().min(0, "Hours cannot be negative").max(1000, "Hours cannot exceed 1000");

// Date validations
export const requiredDate = (fieldName = "Date") =>
  z.date({ required_error: `${fieldName} is required` });

export const optionalDate = () =>
  z.date().optional();

// ID/Code validations
export const taxId = () =>
  z
    .string()
    .trim()
    .min(1, "Tax ID is required")
    .max(50, "Tax ID must be less than 50 characters");

export const code = (options?: { required?: boolean; maxLength?: number }) => {
  const maxLen = options?.maxLength ?? 20;
  const base = z
    .string()
    .trim()
    .max(maxLen, `Code must be less than ${maxLen} characters`);
  
  if (options?.required) {
    return base.min(1, "Code is required");
  }
  return base.optional().or(z.literal(""));
};

export const initials = () =>
  z
    .string()
    .trim()
    .max(4, "Initials must be 4 characters or less")
    .optional()
    .or(z.literal(""));

// UUID validation
export const uuid = (fieldName = "ID") =>
  z.string().uuid(`Invalid ${fieldName}`);

export const optionalUuid = () =>
  z.string().uuid().optional().or(z.literal(""));

// Boolean
export const checkbox = (defaultValue = false) =>
  z.boolean().default(defaultValue);

// Text area / description
export const description = (maxLength = 1000) =>
  z
    .string()
    .trim()
    .max(maxLength, `Description must be less than ${maxLength} characters`)
    .optional()
    .or(z.literal(""));

export const notes = (maxLength = 2000) =>
  z
    .string()
    .trim()
    .max(maxLength, `Notes must be less than ${maxLength} characters`)
    .optional()
    .or(z.literal(""));

// Address
export const address = () =>
  z
    .string()
    .trim()
    .max(500, "Address must be less than 500 characters")
    .optional()
    .or(z.literal(""));

// Currency
export const currency = () =>
  z.enum(["USD", "BOB"] as const);

// Status
export const status = <T extends readonly [string, ...string[]]>(options: T) =>
  z.enum(options);

/**
 * Company email validation with domain restriction
 */
export const companyEmail = (allowedDomain: string) =>
  z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters")
    .refine(
      (email) =>
        !allowedDomain ||
        email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`),
      { message: `Only @${allowedDomain} emails are allowed` }
    );

/**
 * Helper to create a form error message from Zod errors
 */
export function getFirstZodError(error: z.ZodError): string {
  return error.errors[0]?.message || "Validation error";
}

/**
 * Helper to safely parse and return typed errors
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: getFirstZodError(result.error) };
}
