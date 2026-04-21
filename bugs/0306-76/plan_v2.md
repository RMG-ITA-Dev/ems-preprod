# Bug Fix Plan v2 — 0306-76: NIT field accepts non-numeric characters

---

## Comparison Matrix

| Section | Plan A position | Plan B position | Agreement? | Chosen position | Reason |
|---|---|---|---|---|---|
| **Scope / Files** | `ClientForm.tsx` only | `ClientForm.tsx` + `ClientNew.tsx` + `ClientEdit.tsx` + `en.json` + `es.json` | No | Plan A | Pages are pass-through wrappers that just render `<ClientForm />` — fixing the component fixes both routes automatically. i18n files not needed if Zod messages stay hardcoded (see row below). |
| **Root cause** | `unique_tax_id` Zod rule on line 54, no input attrs on lines 247 & 442 | Same | Yes | Both | Identical diagnosis. |
| **Zod `.regex()`** | Add `.regex(/^\d+$/)` with hardcoded English message | Add `.regex(/^\d+$/)` with i18n key | Partial | Plan A (hardcoded string) | Existing Zod messages in the same schema are hardcoded English strings (`"Client name is required"`). Adding i18n here is scope expansion. |
| **i18n error keys** | Not added | Add new keys to `en.json` / `es.json` | No | Plan A (none) | Unnecessary given the hardcoded-string pattern already in the schema. |
| **onChange silent filter** | Yes — strips non-digits via `replace(/\D/g, "")` | No — validate on submit, show error | No | Plan B (no filter) | Silent stripping surprises users on paste. An explicit Zod error via `<FormMessage>` satisfies the requirement. No-filter is the smaller, safer change. |
| **`inputMode` + `pattern` hints** | Yes | Yes | Yes | Both | Adds mobile UX at zero cost. |
| **Export `formSchema`** | Yes (`export const formSchema`) | Not mentioned | — | Plan A | Required for schema-unit tests. |
| **Test file & approach** | `ClientForm.schema.test.ts` — schema-unit, no render | `ClientForm.test.tsx` — component render tests | No | Plan A (schema-unit) | No DOM/mock dependencies; directly tests the root cause. |
| **Leading-zero NIT** | Open question | Open question | — | **Resolved (Marcelo): allowed** — regex stays `^\d+$` | |
| **Max length** | Open question | Open question | — | **Resolved (Marcelo): 15 digits** — add `.max(15)` | |

---

## Context

**Bug ID:** 0306-76 | **Módulo:** PRINCIPAL-Clientes | **Prioridad:** Baja | **Tester:** lcandia

El campo NIT (`unique_tax_id`) en el formulario de Clientes acepta cualquier cadena de texto,
incluidas letras. La captura muestra el valor `qweeeee` ya persistido en la BD. El fix previene
que esto vuelva a ocurrir desde el frontend; no toca la BD ni limpia registros históricos.

**Alcance:** Solo `src/components/forms/ClientForm.tsx`. Sin migraciones, sin Edge Functions,
sin cambios en páginas, sin cambios en locales.

---

## Root Cause

`src/components/forms/ClientForm.tsx` línea 54:

```ts
unique_tax_id: z.string().min(1, "NIT is required"),
```

Solo valida presencia. No hay regex, no hay `inputMode`, no hay restricción de teclas. Los dos
`<Input>` que renderizan el campo NIT (línea 247 en layout compacto, línea 442 en layout
completo) son inputs de texto plano sin ninguna restricción.

---

## Proposed Fix

Dos capas de validación frontend, en orden de profundidad:

| Capa | Qué hace | Cuándo actúa |
|---|---|---|
| `inputMode="numeric"` + `pattern="[0-9]*"` + `maxLength={15}` | Teclado numérico en móvil; impide tipear más de 15 caracteres | Al enfocar / tipear |
| Zod `.regex(/^\d+$/)` + `.max(15)` | Bloquea el submit y muestra `<FormMessage>` | Al intentar guardar |

Sin filtro `onChange` silencioso: si el usuario ingresa o pega texto con letras, el campo lo
acepta visualmente pero el submit queda bloqueado y `<FormMessage>` muestra el error.

---

## Files to Change

### `src/components/forms/ClientForm.tsx` — único archivo modificado

**Cambio 1 — Exportar el schema** (línea 52):

```diff
-const formSchema = z.object({
+export const formSchema = z.object({
```

**Cambio 2 — Agregar regex y maxLength al campo `unique_tax_id`** (línea 54):

```diff
-  unique_tax_id: z.string().min(1, "NIT is required"),
+  unique_tax_id: z
+    .string()
+    .min(1, "NIT is required")
+    .max(15, "NIT cannot exceed 15 digits")
+    .regex(/^\d+$/, "NIT must contain only digits (0–9)"),
```

**Cambio 3 — Layout compacto** (línea 247):

```diff
-<Input className="h-8 text-sm" placeholder="123456789" {...field} />
+<Input
+  className="h-8 text-sm"
+  placeholder="123456789"
+  inputMode="numeric"
+  pattern="[0-9]*"
+  maxLength={15}
+  {...field}
+/>
```

**Cambio 4 — Layout completo** (línea 442):

```diff
-<Input placeholder="123456789" {...field} />
+<Input
+  placeholder="123456789"
+  inputMode="numeric"
+  pattern="[0-9]*"
+  maxLength={15}
+  {...field}
+/>
```

> `maxLength={15}` en el `<Input>` actúa como primera barrera (el navegador impide tipear más
> de 15 caracteres); el `.max(15)` en Zod cubre el caso de paste o valor prellenado que supere
> el límite.

---

## Tests

**Nuevo archivo:** `src/components/forms/__tests__/ClientForm.schema.test.ts`

```ts
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
```

Run command:

```bash
npx vitest run src/components/forms/__tests__/ClientForm.schema.test.ts
```

---

## Verification Steps

1. `npm run dev`
2. Clientes → Nuevo Cliente → ingresar `qweeeee` en NIT → intentar guardar → `<FormMessage>`
   muestra `"NIT must contain only digits (0–9)"`, submit no se envía.
3. Pegar `abc-123` en el campo → valor queda visible → al intentar guardar aparece el error
   (no hay stripping silencioso).
4. Ingresar `01234567` → guardar → funciona (ceros a la izquierda permitidos).
5. Ingresar `1234567890123456` (16 dígitos) → verificar que el campo no acepta el 16.° carácter
   al tipear; pegar el valor completo → intentar guardar → error `"NIT cannot exceed 15 digits"`.
6. Ingresar `1020182020` → guardar → funciona normalmente.
7. Repetir pasos 2–6 en Clientes → editar cliente existente (layout compacto).
8. En móvil o DevTools emulación: enfocar campo NIT → debe aparecer teclado numérico.
9. `npx vitest run src/components/forms/__tests__/ClientForm.schema.test.ts` → 9 casos en verde.

---

## Regression Risks

| Riesgo | Mitigación |
|---|---|
| Clientes existentes con NIT no-numérico: al editar, Zod rechaza el submit hasta que el usuario corrija el NIT. | Comportamiento esperado — el usuario debe sanear el dato sucio para poder guardar. |
| Clientes existentes con NIT de más de 15 dígitos: mismo bloqueo al editar. | Misma mitigación: el usuario debe corregirlo. |
| Copy-paste con guiones, espacios o letras: el campo los acepta visualmente pero el error aparece al intentar guardar. | `<FormMessage>` guía al usuario. |
| `export const formSchema` convierte un símbolo interno en público. | Sin riesgo real — no es API pública, es solo una exportación TS para tests. |

---

## Out of Scope

- Migraciones de base de datos o constraints en BD
- Edge Functions
- Limpieza de registros existentes con NIT inválido o largo
- Añadir claves i18n para mensajes de error del schema Zod
- Cambios en `src/pages/ClientNew.tsx` o `src/pages/ClientEdit.tsx`
- Cambios en `src/lib/validation.ts` (`taxId()` helper no es usado por este formulario)
- Cambios en el listado de clientes (`Clients.tsx`)
- Validación server-side

---

## Open Questions

Ninguna — todas resueltas por Marcelo antes de la ejecución:

| Pregunta | Respuesta |
|---|---|
| ¿Puede el NIT empezar con cero? | Sí — regex `^\d+$` lo permite. |
| ¿Longitud máxima? | 15 dígitos — `.max(15)` en Zod + `maxLength={15}` en `<Input>`. |

---

## Synthesis Notes

| Decisión | Origen | Tipo |
|---|---|---|
| Zod `.regex(/^\d+$/)` en `unique_tax_id` | Ambos planes (acuerdo) | Consenso |
| `inputMode="numeric"` + `pattern="[0-9]*"` en ambos `<Input>` | Ambos planes (acuerdo) | Consenso |
| `.max(15)` en Zod + `maxLength={15}` en `<Input>` | Resuelto por Marcelo | Decisión humana |
| Regex `^\d+$` (permite leading zero) | Resuelto por Marcelo | Decisión humana |
| Sin filtro `onChange` silencioso | Plan B gana | Plan B |
| Mensajes hardcodeados en inglés (sin i18n) | Plan A — consistente con patrón existente | Plan A |
| Solo `ClientForm.tsx` — no tocar páginas ni locales | Plan A | Plan A |
| `export const formSchema` | Plan A — necesario para schema-unit tests | Plan A |
| Test file `ClientForm.schema.test.ts` (schema-unit, sin render) | Plan A | Plan A |
| 9 casos de test (añadidos: leading-zero, exactamente 15, más de 15) | Plan A base + casos nuevos por resolución de Marcelo | Híbrido |
