import { describe, it, expect } from "vitest";
import { cn, formatAmount } from "../utils";

describe("cn (class name merger)", () => {
  it("merges multiple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", true && "conditional")).toBe("base conditional");
    expect(cn("base", false && "conditional")).toBe("base");
  });

  it("deduplicates Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles undefined and null values", () => {
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
    expect(cn("foo", null, "bar")).toBe("foo bar");
  });

  it("handles empty strings", () => {
    expect(cn("foo", "", "bar")).toBe("foo bar");
  });

  it("handles arrays of classes", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("handles objects with boolean values", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });
});

describe("formatAmount", () => {
  describe("Spanish locale (es)", () => {
    it("formats numbers with dot thousand separator", () => {
      expect(formatAmount(1234567, "es")).toBe("1.234.567");
    });

    it("rounds decimal numbers", () => {
      expect(formatAmount(1234.56, "es")).toBe("1.235");
      expect(formatAmount(1234.49, "es")).toBe("1.234");
    });

    it("handles zero", () => {
      expect(formatAmount(0, "es")).toBe("0");
    });

    it("handles negative numbers", () => {
      expect(formatAmount(-1234, "es")).toBe("-1.234");
    });
  });

  describe("English locale (en)", () => {
    it("formats numbers with comma thousand separator", () => {
      expect(formatAmount(1234567, "en")).toBe("1,234,567");
    });

    it("rounds decimal numbers", () => {
      expect(formatAmount(1234.56, "en")).toBe("1,235");
      expect(formatAmount(1234.49, "en")).toBe("1,234");
    });

    it("handles zero", () => {
      expect(formatAmount(0, "en")).toBe("0");
    });

    it("handles negative numbers", () => {
      expect(formatAmount(-1234, "en")).toBe("-1,234");
    });
  });

  it("defaults to Spanish locale", () => {
    expect(formatAmount(1234567)).toBe("1.234.567");
  });
});
