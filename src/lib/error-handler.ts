import { toast } from "sonner";
import { logger } from "@/lib/logger";

/**
 * Error codes for categorizing errors
 */
export enum ErrorCode {
  // Database errors
  DB_CONNECTION = "DB_CONNECTION",
  DB_QUERY = "DB_QUERY",
  DB_CONSTRAINT = "DB_CONSTRAINT",
  DB_NOT_FOUND = "DB_NOT_FOUND",
  
  // Auth errors
  AUTH_UNAUTHORIZED = "AUTH_UNAUTHORIZED",
  AUTH_FORBIDDEN = "AUTH_FORBIDDEN",
  AUTH_SESSION_EXPIRED = "AUTH_SESSION_EXPIRED",
  
  // Validation errors
  VALIDATION = "VALIDATION",
  
  // Network errors
  NETWORK = "NETWORK",
  TIMEOUT = "TIMEOUT",
  
  // Generic
  UNKNOWN = "UNKNOWN",
}

/**
 * Structured application error
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    context?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = context;
    this.originalError = originalError;
  }
}

/**
 * Parse Supabase/PostgreSQL error codes and return appropriate ErrorCode
 */
function parseSupabaseErrorCode(error: unknown): ErrorCode {
  if (!error || typeof error !== "object") return ErrorCode.UNKNOWN;
  
  const err = error as { code?: string; message?: string; status?: number };
  
  // Check HTTP status codes
  if (err.status === 401) return ErrorCode.AUTH_UNAUTHORIZED;
  if (err.status === 403) return ErrorCode.AUTH_FORBIDDEN;
  if (err.status === 404) return ErrorCode.DB_NOT_FOUND;
  
  // Check PostgreSQL error codes
  const pgCode = err.code;
  if (pgCode) {
    // Connection errors (08xxx)
    if (pgCode.startsWith("08")) return ErrorCode.DB_CONNECTION;
    // Constraint violations (23xxx)
    if (pgCode.startsWith("23")) return ErrorCode.DB_CONSTRAINT;
    // Authorization errors (42xxx)
    if (pgCode === "42501") return ErrorCode.AUTH_FORBIDDEN;
    // Not found (PGRST116 = no rows)
    if (pgCode === "PGRST116") return ErrorCode.DB_NOT_FOUND;
  }
  
  // Check message patterns
  const message = err.message?.toLowerCase() || "";
  if (message.includes("network") || message.includes("fetch")) return ErrorCode.NETWORK;
  if (message.includes("timeout")) return ErrorCode.TIMEOUT;
  if (message.includes("jwt") || message.includes("token")) return ErrorCode.AUTH_SESSION_EXPIRED;
  
  return ErrorCode.UNKNOWN;
}

/**
 * Get user-friendly message for error code
 */
function getUserFriendlyMessage(code: ErrorCode, fallbackMessage?: string): string {
  const messages: Record<ErrorCode, string> = {
    [ErrorCode.DB_CONNECTION]: "Unable to connect to the database. Please try again.",
    [ErrorCode.DB_QUERY]: "A database error occurred. Please try again.",
    [ErrorCode.DB_CONSTRAINT]: "This operation violates data constraints. Please check your input.",
    [ErrorCode.DB_NOT_FOUND]: "The requested data was not found.",
    [ErrorCode.AUTH_UNAUTHORIZED]: "You need to sign in to perform this action.",
    [ErrorCode.AUTH_FORBIDDEN]: "You don't have permission to perform this action.",
    [ErrorCode.AUTH_SESSION_EXPIRED]: "Your session has expired. Please sign in again.",
    [ErrorCode.VALIDATION]: "Please check your input and try again.",
    [ErrorCode.NETWORK]: "Network error. Please check your connection.",
    [ErrorCode.TIMEOUT]: "The request timed out. Please try again.",
    [ErrorCode.UNKNOWN]: fallbackMessage || "An unexpected error occurred. Please try again.",
  };
  
  return messages[code];
}

interface HandleErrorOptions {
  /** Show toast notification to user */
  showToast?: boolean;
  /** Custom toast title */
  toastTitle?: string;
  /** Log to console/logger */
  log?: boolean;
  /** Additional context for logging */
  context?: Record<string, unknown>;
  /** Rethrow the error after handling */
  rethrow?: boolean;
}

/**
 * Centralized error handler for the application
 */
export function handleError(
  error: unknown,
  options: HandleErrorOptions = {}
): AppError {
  const {
    showToast = true,
    toastTitle = "Error",
    log = true,
    context = {},
    rethrow = false,
  } = options;

  // Parse error
  const errorCode = parseSupabaseErrorCode(error);
  const originalMessage = error instanceof Error ? error.message : String(error);
  const userMessage = getUserFriendlyMessage(errorCode, originalMessage);
  
  // Create structured error
  const appError = new AppError(
    userMessage,
    errorCode,
    context,
    error instanceof Error ? error : undefined
  );

  // Log error
  if (log) {
    logger.error(`[${errorCode}] ${originalMessage}`, {
      code: errorCode,
      userMessage,
      originalMessage,
      ...context,
    });
  }

  // Show toast
  if (showToast) {
    // For auth errors, provide more specific guidance
    if (errorCode === ErrorCode.AUTH_SESSION_EXPIRED) {
      toast.error("Session Expired", { 
        description: userMessage,
        action: {
          label: "Sign In",
          onClick: () => window.location.href = "/auth",
        },
      });
    } else {
      toast.error(toastTitle, { description: userMessage });
    }
  }

  // Rethrow if requested
  if (rethrow) {
    throw appError;
  }

  return appError;
}

/**
 * Create a mutation error handler for React Query
 * Provides consistent error handling across all mutations
 */
export function createMutationErrorHandler(
  operation: string,
  context?: Record<string, unknown>
) {
  return (error: Error) => {
    handleError(error, {
      toastTitle: `Error ${operation}`,
      context: { operation, ...context },
    });
  };
}

/**
 * Create a query error handler for React Query
 * Less intrusive than mutation errors (logs but may not always toast)
 */
export function createQueryErrorHandler(
  queryName: string,
  options: { showToast?: boolean } = {}
) {
  return (error: Error) => {
    handleError(error, {
      showToast: options.showToast ?? false,
      toastTitle: `Error loading ${queryName}`,
      context: { queryName },
    });
  };
}

/**
 * Wrap an async function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: HandleErrorOptions = {}
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, options);
    throw error;
  }
}
