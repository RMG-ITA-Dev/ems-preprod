import { formSchema } from "@/components/forms/ClientForm";

const validBase = {
  client_legal_name: "Acme S.A.",
  unique_tax_id: "1020182020",
  is_active: true,
};

describe("ClientForm — unique_tax_id validation (BUG 0306-76)", () => {
  it("accepts all-digit NIT", () => {
    expect(formSchema.safeParse(validBase).success).toBe(true);
  });
  it("accepts single-digit NIT", () => {
    expect(formSchema.safeParse({ ...validBase, unique_tax_id: "0" }).success).toBe(true);
  });
  it("accepts NIT starting with zero", () => {
    expect(formSchema.safeParse({ ...validBase, unique_tax_id: "01234567" }).success).toBe(true);
  });
  it("accepts NIT of exactly 15 digits", () => {
    expect(formSchema.safeParse({ ...validBase, unique_tax_id: "123456789012345" }).success).toBe(true);
  });
  it("rejects NIT longer than 15 digits", () => {
    const result = formSchema.safeParse({ ...validBase, unique_tax_id: "1234567890123456" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("NIT cannot exceed 15 digits");
  });
  it("rejects alphabetic NIT", () => {
    const result = formSchema.safeParse({ ...validBase, unique_tax_id: "qweeeee" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("NIT must contain only digits (0–9)");
  });
  it("rejects alphanumeric NIT", () => {
    const result = formSchema.safeParse({ ...validBase, unique_tax_id: "123abc" });
    expect(result.success).toBe(false);
  });
  it("rejects NIT with spaces", () => {
    const result = formSchema.safeParse({ ...validBase, unique_tax_id: "123 456" });
    expect(result.success).toBe(false);
  });
  it("rejects empty NIT with required message", () => {
    const result = formSchema.safeParse({ ...validBase, unique_tax_id: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("NIT is required");
  });
});
