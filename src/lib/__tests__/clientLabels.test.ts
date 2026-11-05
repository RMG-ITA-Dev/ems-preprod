// 1028-211: dónde mostrar el número de homónimo y cómo escribirlo. El número lo calcula la vista
// clients_directory (homonym_seq); su semántica se prueba en rls-carril-b-b3c-clientes-encargos.sql.
import { describe, it, expect } from "vitest";
import { byName, byNameAndTaxId, clientNameWithSeq, findRepeated, orderHomonymsBySeq } from "@/lib/clientLabels";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const C = "cccccccc-3333-4333-8333-333333333333";

describe("findRepeated — por nombre", () => {
  it("lista vacía", () => {
    expect(findRepeated([], byName).size).toBe(0);
  });

  it("homónimos sin distinguir mayúsculas ni espacios en los bordes; el único queda fuera", () => {
    const ids = findRepeated(
      [
        { client_id: A, client_legal_name: "Fideicomiso X" },
        { client_id: B, client_legal_name: "  fideicomiso x " },
        { client_id: C, client_legal_name: "Otro" },
      ],
      byName,
    );
    expect([...ids].sort()).toEqual([A, B]);
  });
});

describe("findRepeated — por nombre y NIT", () => {
  it("mismo nombre con NIT distinto no cuenta", () => {
    const ids = findRepeated(
      [
        { client_id: A, client_legal_name: "Fideicomiso X", tax_id: "99001" },
        { client_id: B, client_legal_name: "Fideicomiso X", tax_id: "12345" },
      ],
      byNameAndTaxId,
    );
    expect(ids.size).toBe(0);
  });

  it("mismo nombre y mismo NIT sí", () => {
    const ids = findRepeated(
      [
        { client_id: A, client_legal_name: "Fideicomiso X", tax_id: "99001" },
        { client_id: B, client_legal_name: "fideicomiso x", tax_id: "99001" },
        { client_id: C, client_legal_name: "Fideicomiso X", tax_id: "12345" },
      ],
      byNameAndTaxId,
    );
    expect([...ids].sort()).toEqual([A, B]);
  });

  it("NIT null cuenta como vacío", () => {
    const ids = findRepeated(
      [
        { client_id: A, client_legal_name: "Sin NIT", tax_id: null },
        { client_id: B, client_legal_name: "Sin NIT", tax_id: null },
      ],
      byNameAndTaxId,
    );
    expect(ids.size).toBe(2);
  });
});

describe("orderHomonymsBySeq", () => {
  it("ordena a los homónimos por número sin mover a los demás", () => {
    const list = [
      { client_id: "a", client_legal_name: "Acme" },
      { client_id: "x2", client_legal_name: "Fideicomiso X" },
      { client_id: "x1", client_legal_name: "fideicomiso x " },
      { client_id: "m", client_legal_name: "Marca" },
      { client_id: "x3", client_legal_name: "Fideicomiso X" },
    ];
    const seq: Record<string, number | null> = { a: null, x1: 1, x2: 2, x3: 3, m: null };
    expect(orderHomonymsBySeq(list, (c) => seq[c.client_id]).map((c) => c.client_id)).toEqual([
      "a", "x1", "x2", "m", "x3",
    ]);
  });

  it("sin número conocido, el homónimo va al final de su grupo; no muta la entrada", () => {
    const list = [
      { client_id: "x9", client_legal_name: "X" },
      { client_id: "x1", client_legal_name: "X" },
    ];
    const out = orderHomonymsBySeq(list, (c) => (c.client_id === "x1" ? 1 : undefined));
    expect(out.map((c) => c.client_id)).toEqual(["x1", "x9"]);
    expect(list.map((c) => c.client_id)).toEqual(["x9", "x1"]);
  });
});

describe("clientNameWithSeq", () => {
  it("agrega el número solo si existe", () => {
    expect(clientNameWithSeq("Fideicomiso X", 2)).toBe("Fideicomiso X · #2");
    expect(clientNameWithSeq("Acme", null)).toBe("Acme");
    expect(clientNameWithSeq("Acme", undefined)).toBe("Acme");
  });
});
