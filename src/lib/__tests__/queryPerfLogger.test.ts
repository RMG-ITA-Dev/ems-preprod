import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withPerfLogging, SLOW_QUERY_THRESHOLD_MS } from '../queryPerfLogger';

describe('withPerfLogging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Default: simulate DEV mode for tests that exercise logging behavior
    vi.stubEnv('DEV', true);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    nowSpy?.mockRestore();
    vi.unstubAllEnvs();
  });

  function mockDuration(durationMs: number): void {
    let calls = 0;
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
      calls += 1;
      return calls === 1 ? 0 : durationMs;
    });
  }

  it('does NOT warn when duration is below the threshold', async () => {
    mockDuration(SLOW_QUERY_THRESHOLD_MS - 1);
    const result = await withPerfLogging(['fast-query'], async () => 'ok');
    expect(result).toBe('ok');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns with duration, queryKey, and row count when above the threshold', async () => {
    mockDuration(SLOW_QUERY_THRESHOLD_MS + 1);
    const result = await withPerfLogging(
      ['slow-query', 'p1'],
      async () => ({ data: [1, 2, 3, 4, 5] }),
      { rowCountSelector: (r) => r.data.length },
    );
    expect(result).toEqual({ data: [1, 2, 3, 4, 5] });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('Slow query');
    expect(message).toContain('5 rows');
    expect(warnSpy.mock.calls[0][1]).toEqual(['slow-query', 'p1']);
  });

  it('skips all measurement and logging when DEV flag is false', async () => {
    vi.stubEnv('DEV', false);
    mockDuration(SLOW_QUERY_THRESHOLD_MS + 100);
    const fn = vi.fn(async () => 'prod-result');
    const result = await withPerfLogging(['any-key'], fn);
    expect(result).toBe('prod-result');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    // performance.now should not have been invoked at all in production mode
    expect(nowSpy).not.toHaveBeenCalled();
  });

  it('warns about a slow failed query and re-throws the error', async () => {
    mockDuration(SLOW_QUERY_THRESHOLD_MS + 200);
    const error = new Error('boom');
    await expect(
      withPerfLogging(['failing-query'], async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('Slow query failed');
    expect(warnSpy.mock.calls[0][1]).toEqual(['failing-query']);
    expect(warnSpy.mock.calls[0][2]).toBe(error);
  });
});
