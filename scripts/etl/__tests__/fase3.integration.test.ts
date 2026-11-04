import { describe, expect, it } from "vitest";

// La integración exige un stack Supabase local real y nunca se incorpora a npm test por accidente.
const enabled = process.env.ETL_F3_INTEGRATION === "1";
describe.skipIf(!enabled)("ETL fase 3: integración local opt-in", () => {
  it("requiere el arnés local antes de ejecutar F2→F3", () => {
    expect(process.env.PGHOST).toMatch(/^(127\.0\.0\.1|localhost|::1)$/);
  });
});
