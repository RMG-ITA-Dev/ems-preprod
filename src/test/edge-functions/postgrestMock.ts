// In-memory PostgREST-compatible fake for full-handler edge-function tests
// (Phase 4 plan §3.3). Implements exactly the chain surface the
// scheduler-data handler uses (select/eq/or/in/is/lte/gte/order/limit +
// thenable resolution) with SQL-faithful semantics:
//   - eq/lte/gte on a NULL column value exclude the row (three-valued logic)
//   - is(col, null) matches only NULL
//   - or("a.eq.x,b.eq.y") — the only disjunction shape the handler emits
//   - order() supports multi-key with nullsFirst; limit() applies last
// The handler runs UNMODIFIED against this fake, so the visibility
// boundary and query construction are exercised end-to-end.
//
// Phase 6 additions (plan D-P6-13, ADDITIVE and default-off — the
// scheduler-data suites run byte-unaffected, acceptance gate A4):
//   - gt(col, value) — the keyset-pagination cursor filter
//   - opts.serverRowCap — opt-in PostgREST max-rows behavior: the server
//     silently caps every response BELOW the client's limit()
//   - opts.schemaColumns — opt-in schema-aware mode: selecting a column
//     not in the declared table column set fails with a 42703-shaped
//     error (an undeclared table fails 42P01), the way the real server
//     rejects a broken projection — a null-projecting fake would
//     greenlight a wrong cursor column (rev. 6 P1-01)

import type {
  DbClient,
  DbError,
  DbQuery,
} from "../../../supabase/functions/scheduler-data/handler.ts";

type Row = Record<string, unknown>;
export type Fixtures = Record<string, Row[]>;

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
}

export interface QueryLogEntry {
  table: string;
  filters: string[];
}

export interface FakeDbOptions {
  /** Opt-in: server-side max-rows cap applied under any client limit(). */
  serverRowCap?: number;
  /** Opt-in: per-table column sets; unknown selected columns → 42703,
   *  undeclared tables → 42P01. */
  schemaColumns?: Record<string, string[]>;
}

class FakeQuery implements DbQuery {
  private predicates: Array<(row: Row) => boolean> = [];
  private orders: OrderSpec[] = [];
  private limitCount: number | null = null;
  private columns: string[] | null = null;
  private readonly logEntry: QueryLogEntry;

  constructor(
    private rows: Row[],
    private table: string,
    log: QueryLogEntry[],
    private failWith: DbError | null,
    private options: FakeDbOptions
  ) {
    this.logEntry = { table, filters: [] };
    log.push(this.logEntry);
  }

  select(columns: string): DbQuery {
    this.columns = columns.split(",").map((c) => c.trim());
    return this;
  }
  gt(column: string, value: unknown): DbQuery {
    this.logEntry.filters.push(`gt:${column}`);
    this.predicates.push(
      (r) =>
        r[column] !== null &&
        r[column] !== undefined &&
        String(r[column]) > String(value)
    );
    return this;
  }
  eq(column: string, value: unknown): DbQuery {
    this.logEntry.filters.push(`eq:${column}`);
    this.predicates.push((r) => r[column] !== null && r[column] === value);
    return this;
  }
  or(filters: string): DbQuery {
    this.logEntry.filters.push(`or:${filters}`);
    const disjuncts = filters.split(",").map((f) => {
      const [column, op, ...rest] = f.split(".");
      if (op !== "eq") throw new Error(`FakeQuery.or supports only eq, got ${op}`);
      const value = rest.join(".");
      return (r: Row) => r[column] !== null && r[column] === value;
    });
    this.predicates.push((r) => disjuncts.some((d) => d(r)));
    return this;
  }
  in(column: string, values: unknown[]): DbQuery {
    this.logEntry.filters.push(`in:${column}(${values.length})`);
    const set = new Set(values);
    this.predicates.push((r) => r[column] !== null && set.has(r[column]));
    return this;
  }
  is(column: string, value: null): DbQuery {
    this.logEntry.filters.push(`is:${column}`);
    this.predicates.push((r) => r[column] === value);
    return this;
  }
  lte(column: string, value: string): DbQuery {
    this.logEntry.filters.push(`lte:${column}`);
    this.predicates.push(
      (r) => r[column] !== null && r[column] !== undefined && String(r[column]) <= value
    );
    return this;
  }
  gte(column: string, value: string): DbQuery {
    this.logEntry.filters.push(`gte:${column}`);
    this.predicates.push(
      (r) => r[column] !== null && r[column] !== undefined && String(r[column]) >= value
    );
    return this;
  }
  order(
    column: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean }
  ): DbQuery {
    this.orders.push({
      column,
      ascending: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst ?? false,
    });
    return this;
  }
  limit(count: number): DbQuery {
    this.limitCount = count;
    return this;
  }

  private resolve(): { data: Row[] | null; error: DbError | null } {
    if (this.failWith) return { data: null, error: this.failWith };
    // Schema-aware mode (opt-in): reject the projection the way the real
    // server would, instead of null-filling unknown columns.
    const schema = this.options.schemaColumns;
    if (schema) {
      const tableColumns = schema[this.table];
      if (!tableColumns) {
        return {
          data: null,
          error: {
            code: "42P01",
            message: `relation "public.${this.table}" does not exist`,
          },
        };
      }
      for (const c of this.columns ?? []) {
        if (!tableColumns.includes(c)) {
          return {
            data: null,
            error: {
              code: "42703",
              message: `column ${this.table}.${c} does not exist`,
            },
          };
        }
      }
    }
    let out = this.rows.filter((r) => this.predicates.every((p) => p(r)));
    if (this.orders.length) {
      out = [...out].sort((a, b) => {
        for (const o of this.orders) {
          const av = a[o.column] as string | null;
          const bv = b[o.column] as string | null;
          if (av === bv) continue;
          if (av === null || av === undefined)
            return o.nullsFirst ? -1 : 1;
          if (bv === null || bv === undefined)
            return o.nullsFirst ? 1 : -1;
          const cmp = av < bv ? -1 : 1;
          return o.ascending ? cmp : -cmp;
        }
        return 0;
      });
    }
    if (this.limitCount !== null) out = out.slice(0, this.limitCount);
    // Server row cap (opt-in): PostgREST max-rows silently truncates
    // below the client's limit — the exact hazard D-P6-13's keyset
    // pagination must survive.
    if (this.options.serverRowCap !== undefined) {
      out = out.slice(0, this.options.serverRowCap);
    }
    if (this.columns) {
      out = out.map((r) => {
        const projected: Row = {};
        for (const c of this.columns!) projected[c] = r[c] ?? null;
        return projected;
      });
    }
    return { data: out, error: null };
  }

  then<T>(
    onfulfilled: (value: { data: Row[] | null; error: DbError | null }) => T
  ): Promise<T> {
    return Promise.resolve(this.resolve()).then(onfulfilled);
  }
}

export interface FakeDb extends DbClient {
  /** every query issued, in order — for chunking/short-circuit assertions */
  queryLog: QueryLogEntry[];
  /** make the next queries against `table` fail with the given error */
  failTable(table: string, error: DbError): void;
  /** Phase 7 addition (ADDITIVE, default-off): let the first `skip`
   *  queries against `table` succeed, then fail the rest — exercises
   *  error arms on a table's SECOND query (e.g. the staff-timeline
   *  viewer-visibility lookup, PR #233 review round 2). */
  failTableAfter(table: string, error: DbError, skip: number): void;
}

export function createFakeDb(
  fixtures: Fixtures,
  options: FakeDbOptions = {}
): FakeDb {
  const queryLog: QueryLogEntry[] = [];
  const failures = new Map<string, { error: DbError; skip: number }>();
  const failureFor = (table: string): DbError | null => {
    const f = failures.get(table);
    if (!f) return null;
    if (f.skip > 0) {
      f.skip--;
      return null;
    }
    return f.error;
  };
  return {
    queryLog,
    failTable(table: string, error: DbError) {
      failures.set(table, { error, skip: 0 });
    },
    failTableAfter(table: string, error: DbError, skip: number) {
      failures.set(table, { error, skip });
    },
    from(table: string): DbQuery {
      return new FakeQuery(
        fixtures[table] ?? [],
        table,
        queryLog,
        failureFor(table),
        options
      );
    },
  };
}
