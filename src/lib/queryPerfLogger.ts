export const SLOW_QUERY_THRESHOLD_MS = 500;

export interface PerfLoggingOptions<T> {
  rowCountSelector?: (result: T) => number | undefined;
  thresholdMs?: number;
}

/**
 * Times a query function and warns to the console when it exceeds the threshold.
 * Dev-only: returns fn() directly in production with no measurement overhead.
 *
 * Opt-in usage from a queryFn:
 *
 *   queryFn: ({ signal }) => withPerfLogging(
 *     ['my-query', someId],
 *     () => supabase.from('my_table').select(...).abortSignal(signal),
 *     { rowCountSelector: (r) => r.data?.length },
 *   )
 */
export async function withPerfLogging<T>(
  queryKey: unknown[],
  fn: () => Promise<T>,
  options?: PerfLoggingOptions<T>,
): Promise<T> {
  if (!import.meta.env.DEV) return fn();

  const threshold = options?.thresholdMs ?? SLOW_QUERY_THRESHOLD_MS;
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    if (duration > threshold) {
      const rowCount = options?.rowCountSelector?.(result);
      const rowCountSuffix = rowCount !== undefined ? `, ${rowCount} rows` : '';
      console.warn(
        `[perf] Slow query (${duration.toFixed(0)}ms${rowCountSuffix}):`,
        queryKey,
      );
    }
    return result;
  } catch (e) {
    const duration = performance.now() - start;
    if (duration > threshold) {
      console.warn(
        `[perf] Slow query failed (${duration.toFixed(0)}ms):`,
        queryKey,
        e,
      );
    }
    throw e;
  }
}
