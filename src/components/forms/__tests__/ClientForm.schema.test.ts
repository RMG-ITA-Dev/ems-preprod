import { describe, it, expect } from "vitest";
import { buildFormSchema, formSchema } from "@/components/forms/ClientForm";

// Cobranzas Fase 5 (issue #352): el cliente pasó de UN contacto opcional a DOS obligatorios
// —el del cliente y el de cobranza (finanzas)—, así que una ficha válida ya los incluye.
// Desde el 2026-10-20 los dos necesitan además CORREO: el cobro se reclama por correo.
const validBase = {
  client_legal_name: "Acme S.A.",
  unique_tax_id: "1020182020",
  contact_general_name: "Ana Pérez",
  contact_general_email: "ana@acme.test",
  contact_cobranza_name: "Luis Finanzas",
  contact_cobranza_email: "luis@acme.test",
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

describe("ClientForm — los dos contactos son obligatorios (Cobranzas Fase 5)", () => {
  it("rechaza una ficha sin contacto del cliente", () => {
    const r = formSchema.safeParse({ ...validBase, contact_general_name: "" });
    expect(r.success).toBe(false);
  });

  // El de cobranza es el que faltaba antes: sin él, Cobranzas no sabe a quién reclamarle.
  // El correo es tan obligatorio como el nombre: un contacto al que no se le puede escribir no
  // sirve para lo unico que tiene que servir.
  it("rechaza una ficha sin el correo del contacto del cliente", () => {
    const r = formSchema.safeParse({ ...validBase, contact_general_email: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza una ficha sin el correo del contacto de cobranza", () => {
    const r = formSchema.safeParse({ ...validBase, contact_cobranza_email: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza una ficha sin contacto de cobranza", () => {
    const r = formSchema.safeParse({ ...validBase, contact_cobranza_name: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza un nombre que es sólo espacios", () => {
    const r = formSchema.safeParse({ ...validBase, contact_cobranza_name: "   " });
    expect(r.success).toBe(false);
  });
});

describe("ClientForm — contact phone validation", () => {
  // La misma regla corre para los dos contactos: el schema del teléfono es uno solo.
  const phone = (contact_general_phone: string) =>
    formSchema.safeParse({ ...validBase, contact_general_phone });

  it("accepts the placeholder format with country code", () => {
    expect(phone("+591 12345678").success).toBe(true);
  });
  it("accepts plain digits", () => {
    expect(phone("77712345").success).toBe(true);
  });
  it("accepts parentheses and dashes as separators", () => {
    expect(phone("(591) 2-771234").success).toBe(true);
  });
  it("accepts empty string — the phone is optional", () => {
    expect(phone("").success).toBe(true);
  });
  it("accepts the field being absent entirely", () => {
    expect(formSchema.safeParse(validBase).success).toBe(true);
  });
  it("rejects letters (the reported bug: any text was accepted)", () => {
    const result = phone("no tengo");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Phone can only contain digits and + - ( ) or spaces",
    );
  });
  it("rejects separators with no digits at all", () => {
    expect(phone("(( ))").success).toBe(false);
  });
  it("rejects a number that is too short to be a phone", () => {
    const result = phone("12345");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Phone must contain at least 7 digits");
  });
  it("rejects a phone longer than 20 characters", () => {
    const result = phone("+591 1234567890123456789");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Phone cannot exceed 20 characters");
  });
});

describe("ClientForm — los mensajes de los contactos pasan por i18n", () => {
  // Eran texto fijo en español, y el de formato de correo en inglés: según qué fallara, el
  // formulario mezclaba idiomas.
  const t = (k: string) => `T(${k})`;
  it("contacto vacío y correo inválido salen traducidos", () => {
    const schema = buildFormSchema(t);
    const sinNombre = schema.safeParse({ ...validBase, contact_cobranza_name: "" });
    expect(sinNombre.error?.issues[0].message).toBe("T(validation.contactCobranzaRequired)");
    const malCorreo = schema.safeParse({ ...validBase, contact_general_email: "no-es-correo" });
    expect(malCorreo.error?.issues[0].message).toBe("T(validation.emailInvalid)");
  });
});
