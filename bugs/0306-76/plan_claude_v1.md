 Bug Fix Plan — 0306-76: NIT field accepts non-numeric characters (Frontend
  only)

 Context

 Bug ID: 0306-76 | Módulo: PRINCIPAL-Clientes | Prioridad: Baja

 El campo NIT (unique_tax_id) en el formulario de Clientes acepta cualquier
  cadena de texto, incluyendo letras. El NIT debe contener únicamente
 dígitos (0–9). La captura muestra el valor qweeeee guardado en la BD — el
 fix evita que esto vuelva a ocurrir desde el frontend.

 Alcance: Solo cambios en el frontend. Sin migraciones de BD, sin Edge
 Functions.

 ---
 Root Cause

 src/components/forms/ClientForm.tsx línea 54:

 unique_tax_id: z.string().min(1, "NIT is required"),

 Solo valida que no esté vacío. No hay regex, ni inputMode, ni filtro de
 teclas. El <Input> en línea 247 (layout compacto) y línea 442 (layout
 completo) son inputs de texto plano sin restricción alguna.

 ---
 Proposed Fix

 Tres capas de validación frontend, en orden de profundidad:

 ┌─────────────────────────┬─────────────────────────────┬────────────┐
 │          Capa           │          Qué hace           │  Cuándo    │
 │                         │                             │   actúa    │
 ├─────────────────────────┼─────────────────────────────┼────────────┤
 │ inputMode="numeric" +   │ Teclado numérico en móvil;  │ Al enfocar │
 │ pattern="[0-9]*"        │ hint al navegador           │  el campo  │
 ├─────────────────────────┼─────────────────────────────┼────────────┤
 │                         │ Elimina silenciosamente     │ En tiempo  │
 │ onChange filter         │ cualquier carácter          │ real       │
 │                         │ no-dígito al tipear         │            │
 ├─────────────────────────┼─────────────────────────────┼────────────┤
 │                         │ Bloquea el submit y muestra │ Al         │
 │ Zod .regex(/^\d+$/)     │  <FormMessage>              │ intentar   │
 │                         │                             │ guardar    │
 └─────────────────────────┴─────────────────────────────┴────────────┘

 Las tres capas juntas dan cobertura completa: experiencia de tipeo limpia
 + mensaje de error explícito si el usuario pega texto con letras.

 ---
 Files to Change

 src/components/forms/ClientForm.tsx

 1. Schema — línea 54 (añadir .regex()):

 -  unique_tax_id: z.string().min(1, "NIT is required"),
 +  unique_tax_id: z
 +    .string()
 +    .min(1, "NIT is required")
 +    .regex(/^\d+$/, "NIT must contain only digits (0–9)"),

 2. Export del schema (línea 52 — agregar export para poder testearlo):

 -const formSchema = z.object({
 +export const formSchema = z.object({

 3. Layout compacto — línea 247 (campo NIT):

 -<Input className="h-8 text-sm" placeholder="123456789" {...field} />
 +<Input
 +  className="h-8 text-sm"
 +  placeholder="123456789"
 +  inputMode="numeric"
 +  pattern="[0-9]*"
 +  {...field}
 +  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
 +/>

 4. Layout completo — línea 442 (campo NIT):

 -<Input placeholder="123456789" {...field} />
 +<Input
 +  placeholder="123456789"
 +  inputMode="numeric"
 +  pattern="[0-9]*"
 +  {...field}
 +  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
 +/>

 ▎ Nota sobre el onChange override: {...field} se esparce primero para que
 ▎ el onChange explícito lo sobreescriba. El handler llama a field.onChange
 ▎  (no al evento nativo) para mantener integración con react-hook-form. El
 ▎  .replace(/\D/g, "") elimina cualquier carácter que no sea dígito antes
 ▎ de actualizar el valor.

 ---
 Tests to Add

 Nuevo archivo: src/components/forms/__tests__/ClientForm.schema.test.ts

 Tests unitarios sobre el schema Zod exportado (sin render de componente):

 import { formSchema } from "@/components/forms/ClientForm";

 // Caso base válido para reutilizar
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
     expect(formSchema.safeParse({ ...validBase, unique_tax_id: "0"
 }).success).toBe(true);
   });
   it("rejects alphabetic NIT", () => {
     const result = formSchema.safeParse({ ...validBase, unique_tax_id:
 "qweeeee" });
     expect(result.success).toBe(false);
     expect(result.error?.issues[0].message).toBe("NIT must contain only
 digits (0–9)");
   });
   it("rejects alphanumeric NIT", () => {
     const result = formSchema.safeParse({ ...validBase, unique_tax_id:
 "123abc" });
     expect(result.success).toBe(false);
   });
   it("rejects NIT with spaces", () => {
     const result = formSchema.safeParse({ ...validBase, unique_tax_id:
 "123 456" });
     expect(result.success).toBe(false);
   });
   it("rejects empty NIT with required message", () => {
     const result = formSchema.safeParse({ ...validBase, unique_tax_id: ""
 });
     expect(result.success).toBe(false);
     expect(result.error?.issues[0].message).toBe("NIT is required");
   });
 });

 ---
 Verification Steps

 1. npm run dev
 2. Clientes → Nuevo Cliente → ingresar qweeeee en NIT → el campo lo
 rechaza en tiempo real (letras no aparecen)
 3. Pegar abc123 en el campo → resultado debe ser 123 (letras eliminadas
 automáticamente)
 4. Intentar guardar con NIT vacío → error "NIT is required"
 5. Guardar con NIT 1020182020 → funciona normalmente
 6. Clientes → editar cliente existente (layout compacto) → mismo
 comportamiento
 7. Ejecutar tests:

 npx vitest run src/components/forms/__tests__/ClientForm.schema.test.ts

 ---
 Regression Risks

 Riesgo: Clientes existentes con NIT no-numérico en la BD: al editar, el
   campo poblará el valor inválido y el onChange lo limpiará
   automáticamente, forzando al usuario a ingresar un NIT correcto antes de

   guardar.
 Mitigación: Comportamiento esperado — la edición de datos sucios requiere
   corrección.
 ────────────────────────────────────────
 Riesgo: Copy-paste desde fuentes con formato (guiones, espacios)
 Mitigación: El onChange filter los elimina silenciosamente — el usuario ve

   solo dígitos.

 ---
 Out of Scope

 - Migraciones de base de datos o constraints en BD
 - Edge Functions
 - Limpieza de registros existentes con NIT no-numérico
 - Longitud máxima del NIT (sin requerimiento explícito en el bug)
 - Actualizar el helper taxId() en src/lib/validation.ts (no es usado por
 este formulario)

 ---
 Open Questions

 1. ¿El NIT boliviano puede empezar con 0? El regex actual ^\d+$ lo
 permite. Si el negocio lo prohíbe, cambiar a /^[1-9]\d*$/.
 2. ¿Longitud máxima? El NIT boliviano suele tener 8–13 dígitos. Si se
 desea restringir, agregar .max(13, "NIT cannot exceed 13 digits") al
 schema.