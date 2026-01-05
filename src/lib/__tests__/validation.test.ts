import { describe, it, expect } from "vitest";
import {
  requiredString,
  optionalString,
  email,
  phone,
  url,
  firstName,
  lastName,
  companyName,
  signinPassword,
  signupPassword,
  positiveNumber,
  nonNegativeNumber,
  amount,
  hours,
  requiredDate,
  taxId,
  code,
  initials,
  uuid,
  optionalUuid,
  checkbox,
  description,
  notes,
  address,
  currency,
  companyEmail,
  getFirstZodError,
  safeValidate,
} from "../validation";
import { z } from "zod";

describe("requiredString", () => {
  it("fails for empty string", () => {
    const schema = requiredString("Name");
    expect(schema.safeParse("").success).toBe(false);
  });

  it("fails for whitespace only", () => {
    const schema = requiredString("Name");
    expect(schema.safeParse("   ").success).toBe(false);
  });

  it("passes for valid string", () => {
    const schema = requiredString("Name");
    const result = schema.safeParse("John");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("John");
  });

  it("trims whitespace", () => {
    const schema = requiredString("Name");
    const result = schema.safeParse("  John  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("John");
  });

  it("uses custom field name in error", () => {
    const schema = requiredString("Company");
    const result = schema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe("Company is required");
    }
  });
});

describe("optionalString", () => {
  it("passes for empty string", () => {
    const schema = optionalString();
    expect(schema.safeParse("").success).toBe(true);
  });

  it("passes for undefined", () => {
    const schema = optionalString();
    expect(schema.safeParse(undefined).success).toBe(true);
  });

  it("passes for valid string", () => {
    const schema = optionalString();
    const result = schema.safeParse("test");
    expect(result.success).toBe(true);
  });
});

describe("email", () => {
  it("fails for invalid format", () => {
    const schema = email();
    expect(schema.safeParse("notanemail").success).toBe(false);
    expect(schema.safeParse("missing@").success).toBe(false);
  });

  it("passes for valid email", () => {
    const schema = email();
    expect(schema.safeParse("user@example.com").success).toBe(true);
  });

  it("allows empty when not required", () => {
    const schema = email();
    expect(schema.safeParse("").success).toBe(true);
  });

  it("fails for empty when required", () => {
    const schema = email({ required: true });
    expect(schema.safeParse("").success).toBe(false);
  });

  it("fails for email > 255 chars", () => {
    const schema = email();
    const longEmail = "a".repeat(250) + "@test.com";
    expect(schema.safeParse(longEmail).success).toBe(false);
  });
});

describe("phone", () => {
  it("passes for valid phone", () => {
    const schema = phone();
    expect(schema.safeParse("+1-555-123-4567").success).toBe(true);
  });

  it("fails for phone > 20 chars", () => {
    const schema = phone();
    expect(schema.safeParse("123456789012345678901").success).toBe(false);
  });

  it("allows empty string", () => {
    const schema = phone();
    expect(schema.safeParse("").success).toBe(true);
  });
});

describe("url", () => {
  it("passes for valid URL", () => {
    const schema = url();
    expect(schema.safeParse("https://example.com").success).toBe(true);
  });

  it("fails for invalid URL", () => {
    const schema = url();
    expect(schema.safeParse("not-a-url").success).toBe(false);
  });

  it("allows empty string", () => {
    const schema = url();
    expect(schema.safeParse("").success).toBe(true);
  });
});

describe("firstName / lastName", () => {
  it("fails for empty", () => {
    expect(firstName().safeParse("").success).toBe(false);
    expect(lastName().safeParse("").success).toBe(false);
  });

  it("passes for valid name", () => {
    expect(firstName().safeParse("John").success).toBe(true);
    expect(lastName().safeParse("Doe").success).toBe(true);
  });

  it("fails for name > 100 chars", () => {
    const longName = "a".repeat(101);
    expect(firstName().safeParse(longName).success).toBe(false);
    expect(lastName().safeParse(longName).success).toBe(false);
  });
});

describe("companyName", () => {
  it("fails for empty", () => {
    expect(companyName().safeParse("").success).toBe(false);
  });

  it("passes for valid name", () => {
    expect(companyName().safeParse("Acme Corp").success).toBe(true);
  });

  it("fails for name > 200 chars", () => {
    expect(companyName().safeParse("a".repeat(201)).success).toBe(false);
  });
});

describe("password validations", () => {
  it("signinPassword fails for < 6 chars", () => {
    expect(signinPassword().safeParse("12345").success).toBe(false);
  });

  it("signinPassword passes for >= 6 chars", () => {
    expect(signinPassword().safeParse("123456").success).toBe(true);
  });

  it("signupPassword fails for < 8 chars", () => {
    expect(signupPassword().safeParse("1234567").success).toBe(false);
  });

  it("signupPassword passes for >= 8 chars", () => {
    expect(signupPassword().safeParse("12345678").success).toBe(true);
  });

  it("both fail for > 100 chars", () => {
    const longPass = "a".repeat(101);
    expect(signinPassword().safeParse(longPass).success).toBe(false);
    expect(signupPassword().safeParse(longPass).success).toBe(false);
  });
});

describe("positiveNumber", () => {
  it("fails for zero", () => {
    expect(positiveNumber().safeParse(0).success).toBe(false);
  });

  it("fails for negative", () => {
    expect(positiveNumber().safeParse(-1).success).toBe(false);
  });

  it("passes for positive", () => {
    expect(positiveNumber().safeParse(1).success).toBe(true);
    expect(positiveNumber().safeParse(0.001).success).toBe(true);
  });

  it("uses custom field name in error", () => {
    const result = positiveNumber("Amount").safeParse(0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain("Amount");
    }
  });
});

describe("nonNegativeNumber", () => {
  it("passes for zero", () => {
    expect(nonNegativeNumber().safeParse(0).success).toBe(true);
  });

  it("fails for negative", () => {
    expect(nonNegativeNumber().safeParse(-1).success).toBe(false);
  });

  it("passes for positive", () => {
    expect(nonNegativeNumber().safeParse(100).success).toBe(true);
  });
});

describe("amount", () => {
  it("passes for zero", () => {
    expect(amount().safeParse(0).success).toBe(true);
  });

  it("fails for negative", () => {
    expect(amount().safeParse(-1).success).toBe(false);
  });
});

describe("hours", () => {
  it("passes for zero", () => {
    expect(hours().safeParse(0).success).toBe(true);
  });

  it("fails for negative", () => {
    expect(hours().safeParse(-1).success).toBe(false);
  });

  it("passes for valid hours", () => {
    expect(hours().safeParse(8).success).toBe(true);
    expect(hours().safeParse(1000).success).toBe(true);
  });

  it("fails for > 1000", () => {
    expect(hours().safeParse(1001).success).toBe(false);
  });
});

describe("requiredDate", () => {
  it("fails for undefined", () => {
    expect(requiredDate().safeParse(undefined).success).toBe(false);
  });

  it("passes for valid date", () => {
    expect(requiredDate().safeParse(new Date()).success).toBe(true);
  });
});

describe("taxId", () => {
  it("fails for empty", () => {
    expect(taxId().safeParse("").success).toBe(false);
  });

  it("passes for valid ID", () => {
    expect(taxId().safeParse("123456789").success).toBe(true);
  });

  it("fails for > 50 chars", () => {
    expect(taxId().safeParse("a".repeat(51)).success).toBe(false);
  });
});

describe("code", () => {
  it("allows empty when not required", () => {
    expect(code().safeParse("").success).toBe(true);
  });

  it("fails for empty when required", () => {
    expect(code({ required: true }).safeParse("").success).toBe(false);
  });

  it("respects custom maxLength", () => {
    expect(code({ maxLength: 5 }).safeParse("123456").success).toBe(false);
    expect(code({ maxLength: 5 }).safeParse("12345").success).toBe(true);
  });
});

describe("initials", () => {
  it("allows empty", () => {
    expect(initials().safeParse("").success).toBe(true);
  });

  it("passes for <= 4 chars", () => {
    expect(initials().safeParse("JD").success).toBe(true);
    expect(initials().safeParse("ABCD").success).toBe(true);
  });

  it("fails for > 4 chars", () => {
    expect(initials().safeParse("ABCDE").success).toBe(false);
  });
});

describe("uuid", () => {
  it("fails for invalid UUID", () => {
    expect(uuid().safeParse("not-a-uuid").success).toBe(false);
    expect(uuid().safeParse("123").success).toBe(false);
  });

  it("passes for valid UUID", () => {
    expect(uuid().safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
  });

  it("optionalUuid allows empty", () => {
    expect(optionalUuid().safeParse("").success).toBe(true);
    expect(optionalUuid().safeParse(undefined).success).toBe(true);
  });
});

describe("checkbox", () => {
  it("defaults to false", () => {
    const schema = checkbox();
    expect(schema.parse(undefined)).toBe(false);
  });

  it("uses custom default", () => {
    const schema = checkbox(true);
    expect(schema.parse(undefined)).toBe(true);
  });

  it("accepts boolean values", () => {
    expect(checkbox().safeParse(true).success).toBe(true);
    expect(checkbox().safeParse(false).success).toBe(true);
  });
});

describe("description / notes", () => {
  it("allows empty", () => {
    expect(description().safeParse("").success).toBe(true);
    expect(notes().safeParse("").success).toBe(true);
  });

  it("description default max is 1000", () => {
    expect(description().safeParse("a".repeat(1001)).success).toBe(false);
    expect(description().safeParse("a".repeat(1000)).success).toBe(true);
  });

  it("notes default max is 2000", () => {
    expect(notes().safeParse("a".repeat(2001)).success).toBe(false);
    expect(notes().safeParse("a".repeat(2000)).success).toBe(true);
  });

  it("respects custom maxLength", () => {
    expect(description(100).safeParse("a".repeat(101)).success).toBe(false);
    expect(notes(100).safeParse("a".repeat(101)).success).toBe(false);
  });
});

describe("address", () => {
  it("allows empty", () => {
    expect(address().safeParse("").success).toBe(true);
  });

  it("fails for > 500 chars", () => {
    expect(address().safeParse("a".repeat(501)).success).toBe(false);
  });
});

describe("currency", () => {
  it("passes for USD and BOB", () => {
    expect(currency().safeParse("USD").success).toBe(true);
    expect(currency().safeParse("BOB").success).toBe(true);
  });

  it("fails for other currencies", () => {
    expect(currency().safeParse("EUR").success).toBe(false);
  });
});

describe("companyEmail", () => {
  it("passes for correct domain", () => {
    const schema = companyEmail("acme.com");
    expect(schema.safeParse("user@acme.com").success).toBe(true);
    expect(schema.safeParse("USER@ACME.COM").success).toBe(true);
  });

  it("fails for wrong domain", () => {
    const schema = companyEmail("acme.com");
    expect(schema.safeParse("user@other.com").success).toBe(false);
  });

  it("fails for invalid email format", () => {
    const schema = companyEmail("acme.com");
    expect(schema.safeParse("notanemail").success).toBe(false);
  });
});

describe("getFirstZodError", () => {
  it("returns first error message", () => {
    const schema = z.object({
      name: z.string().min(1, "Name required"),
      email: z.string().email("Invalid email"),
    });
    const result = schema.safeParse({ name: "", email: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getFirstZodError(result.error)).toBe("Name required");
    }
  });

  it("returns fallback for empty errors", () => {
    const error = new z.ZodError([]);
    expect(getFirstZodError(error)).toBe("Validation error");
  });
});

describe("safeValidate", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns success with data for valid input", () => {
    const result = safeValidate(schema, { name: "John" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("John");
    }
  });

  it("returns error message for invalid input", () => {
    const result = safeValidate(schema, { name: "" });
    expect(result.success).toBe(false);
    expect("error" in result).toBe(true);
  });
});
