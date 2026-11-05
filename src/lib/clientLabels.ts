// 1028-211: cómo distinguir clientes que, a la vista, son iguales.
//
// Desde ETL 02 la razón social y el NIT pueden repetirse (proyectos, sucursales y fideicomisos
// comparten NIT). A los homónimos se les muestra un número correlativo (#1, #2…) que calcula la
// vista `clients_directory` (`homonym_seq`): sobre TODOS los clientes, por fecha de alta, así que el
// mismo cliente tiene el mismo número en todas las pantallas y para todos los usuarios. Este módulo
// no calcula el número; solo decide DÓNDE mostrarlo y cómo escribirlo.

/** Agrupa por razón social, sin distinguir mayúsculas ni espacios en los bordes (igual que la vista). */
export const byName = (client: { client_legal_name: string }): string =>
  client.client_legal_name.trim().toLowerCase();

/** Agrupa por razón social y NIT: para listas que ya muestran el NIT en otra columna. */
export const byNameAndTaxId = (client: { client_legal_name: string; tax_id: string | null }): string =>
  `${byName(client)}|${client.tax_id ?? ""}`;

/**
 * Ids de los clientes que comparten `groupKey` con al menos otro de la misma lista. Lo usa la lista
 * de clientes, que muestra el número solo cuando nombre y NIT coinciden (si no, ya los distingue la
 * columna NIT).
 */
export function findRepeated<T extends { client_id: string }>(
  clients: T[],
  // NoInfer: T sale de `clients`. Sin esto TS infiere T desde el parámetro de `groupKey` y deja
  // de aceptar objetos con más campos que `client_id`.
  groupKey: (client: NoInfer<T>) => string,
): Set<string> {
  const counts = new Map<string, number>();
  for (const client of clients) {
    const key = groupKey(client);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(clients.filter((client) => (counts.get(groupKey(client)) ?? 0) > 1).map((c) => c.client_id));
}

/**
 * Ordena por número a los homónimos (#1 antes que #2) SIN mover nada más: cada grupo de igual
 * razón social se reacomoda dentro de las posiciones que ya ocupaba. Las listas vienen ordenadas
 * por nombre desde la base, y entre nombres iguales ese orden es arbitrario.
 */
export function orderHomonymsBySeq<T extends { client_id: string; client_legal_name: string }>(
  clients: T[],
  seqOf: (client: T) => number | null | undefined,
): T[] {
  const slotsByName = new Map<string, number[]>();
  clients.forEach((client, index) => {
    const key = byName(client);
    const slots = slotsByName.get(key);
    if (slots) slots.push(index);
    else slotsByName.set(key, [index]);
  });
  const result = [...clients];
  for (const slots of slotsByName.values()) {
    if (slots.length < 2) continue;
    const members = slots
      .map((index) => clients[index])
      .sort((a, b) => (seqOf(a) ?? Number.MAX_SAFE_INTEGER) - (seqOf(b) ?? Number.MAX_SAFE_INTEGER));
    slots.forEach((slot, i) => {
      result[slot] = members[i];
    });
  }
  return result;
}

/** Texto plano para donde no cabe el chip (por ejemplo, un modal): `Nombre · #2`. */
export function clientNameWithSeq(name: string, seq: number | null | undefined): string {
  return seq ? `${name} · #${seq}` : name;
}
