import { supabase } from "@/integrations/supabase/client";

/**
 * Llamada a una RPC que `src/integrations/supabase/types.ts` todavía no conoce.
 *
 * El archivo de tipos está desactualizado desde 0722-156b: no conoce ninguna de las RPC de
 * cobranzas (ni `exchange_rate_mode`, ni los TC por cuota, ni `exchange_rate_history`). No se
 * edita a mano — se regenera con la herramienta oficial contra el proyecto destino, y recién
 * entonces este puente se borra y las llamadas quedan tipadas.
 *
 * **Por qué es una función y no `const rpc = supabase.rpc`:** `rpc` es un método del
 * prototipo del cliente y por dentro hace `this.rest.rpc(...)`. Guardarlo en una constante lo
 * desprende del cliente, así que al invocarlo `this` queda `undefined` y **toda** llamada
 * falla con `can't access property "rest", this is undefined`. Acá se llama siempre como
 * método sobre `supabase`, que es lo que conserva el receptor.
 *
 * (La forma inline que convivía con el puente roto —`await (supabase.rpc as unknown as F)(…)`—
 * sí funcionaba, porque unos paréntesis sobre un acceso a propiedad no desprenden nada. Por eso
 * el problema no saltaba en todas las llamadas, y costó encontrarlo.)
 *
 * Los tipos de PostgREST no viajan: el llamador sabe qué devuelve su RPC y lo castea.
 */
export interface RpcResult<T = unknown> {
  data: T;
  error: { message?: string; code?: string } | null;
}

export function rpcUntyped<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  const client = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult<T>>;
  };
  return client.rpc(fn, args);
}
