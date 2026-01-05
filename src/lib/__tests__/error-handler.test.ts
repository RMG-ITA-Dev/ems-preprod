import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AppError,
  ErrorCode,
  handleError,
  createMutationErrorHandler,
  createQueryErrorHandler,
  withErrorHandling,
} from "../error-handler";
import { toast } from "sonner";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe("AppError", () => {
  it("creates error with message and code", () => {
    const error = new AppError("Test error", ErrorCode.DB_QUERY);
    expect(error.message).toBe("Test error");
    expect(error.code).toBe(ErrorCode.DB_QUERY);
    expect(error.name).toBe("AppError");
  });

  it("stores context", () => {
    const context = { userId: "123", action: "save" };
    const error = new AppError("Test", ErrorCode.UNKNOWN, context);
    expect(error.context).toEqual(context);
  });

  it("stores original error", () => {
    const original = new Error("Original");
    const error = new AppError("Wrapped", ErrorCode.UNKNOWN, undefined, original);
    expect(error.originalError).toBe(original);
  });

  it("defaults to UNKNOWN code", () => {
    const error = new AppError("Test");
    expect(error.code).toBe(ErrorCode.UNKNOWN);
  });
});

describe("handleError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows toast by default", () => {
    handleError(new Error("Test"));
    expect(toast.error).toHaveBeenCalled();
  });

  it("respects showToast: false", () => {
    handleError(new Error("Test"), { showToast: false });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("uses custom toast title", () => {
    handleError(new Error("Test"), { toastTitle: "Custom Title" });
    expect(toast.error).toHaveBeenCalledWith("Custom Title", expect.anything());
  });

  it("returns AppError", () => {
    const result = handleError(new Error("Test"));
    expect(result).toBeInstanceOf(AppError);
  });

  it("parses 401 as unauthorized", () => {
    const error = { status: 401, message: "Unauthorized" };
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
  });

  it("parses 403 as forbidden", () => {
    const error = { status: 403, message: "Forbidden" };
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.AUTH_FORBIDDEN);
  });

  it("parses 404 as not found", () => {
    const error = { status: 404, message: "Not found" };
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.DB_NOT_FOUND);
  });

  it("parses PostgreSQL connection errors", () => {
    const error = { code: "08001", message: "Connection failed" };
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.DB_CONNECTION);
  });

  it("parses PostgreSQL constraint violations", () => {
    const error = { code: "23505", message: "Unique violation" };
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.DB_CONSTRAINT);
  });

  it("parses PGRST116 as not found", () => {
    const error = { code: "PGRST116", message: "No rows" };
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.DB_NOT_FOUND);
  });

  it("detects network errors from message", () => {
    const error = new Error("Network error occurred");
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.NETWORK);
  });

  it("detects timeout from message", () => {
    const error = new Error("Request timeout");
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.TIMEOUT);
  });

  it("detects JWT/token errors", () => {
    const error = new Error("JWT expired");
    const result = handleError(error, { showToast: false });
    expect(result.code).toBe(ErrorCode.AUTH_SESSION_EXPIRED);
  });

  it("rethrows when rethrow: true", () => {
    expect(() => {
      handleError(new Error("Test"), { rethrow: true, showToast: false });
    }).toThrow(AppError);
  });
});

describe("createMutationErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a function", () => {
    const handler = createMutationErrorHandler("saving");
    expect(typeof handler).toBe("function");
  });

  it("handler calls handleError with operation in title", () => {
    const handler = createMutationErrorHandler("saving client");
    handler(new Error("Test"));
    expect(toast.error).toHaveBeenCalledWith(
      "Error saving client",
      expect.anything()
    );
  });

  it("includes context in error handling", () => {
    const handler = createMutationErrorHandler("saving", { clientId: "123" });
    const result = handler(new Error("Test"));
    // Handler doesn't return, but we can verify toast was called
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("createQueryErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a function", () => {
    const handler = createQueryErrorHandler("clients");
    expect(typeof handler).toBe("function");
  });

  it("does not show toast by default", () => {
    const handler = createQueryErrorHandler("clients");
    handler(new Error("Test"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows toast when showToast: true", () => {
    const handler = createQueryErrorHandler("clients", { showToast: true });
    handler(new Error("Test"));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("withErrorHandling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns result on success", async () => {
    const result = await withErrorHandling(async () => "success", {
      showToast: false,
    });
    expect(result).toBe("success");
  });

  it("handles and rethrows errors", async () => {
    await expect(
      withErrorHandling(
        async () => {
          throw new Error("Test error");
        },
        { showToast: false }
      )
    ).rejects.toThrow("Test error");
  });

  it("shows toast on error by default", async () => {
    try {
      await withErrorHandling(async () => {
        throw new Error("Test");
      });
    } catch {
      // Expected
    }
    expect(toast.error).toHaveBeenCalled();
  });
});
