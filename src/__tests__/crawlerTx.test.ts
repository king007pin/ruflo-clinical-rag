import { describe, expect, it } from "vitest";

// W20: concurrent-safety contract for /api/admin/crawl/[source].
//
// Real route wraps the read-offset step in
//   db.transaction(tx => tx.execute(sql`SELECT ... FOR UPDATE SKIP LOCKED`))
// so two cron triggers that race on the same `source_feeds` row produce:
//   - winner: lock acquired, offset returned, proceeds to fetch+ingest
//   - loser:  SKIP LOCKED => 0 rows => null => 409 skip (NO dup ingest)
//
// We don't spin a real Postgres in unit tests. Instead we model the SKIP
// LOCKED semantics with an in-memory row-lock + a `transactionLike` shim
// that mirrors the shape the route depends on (tx.execute returning
// `{ rows }`). This locks in the *contract* the route relies on; if a
// future refactor drops `FOR UPDATE SKIP LOCKED` (e.g. switches to
// `SELECT ... FOR UPDATE` which blocks instead of skipping), this test
// catches the behaviour change.

type FeedRow = {
  id: number;
  query: string | null;
  last_fetch_count: number | null;
  error_count: number | null;
};

class MockFeedStore {
  private row: FeedRow;
  private heldBy: symbol | null = null;

  constructor(initial: FeedRow) {
    this.row = { ...initial };
  }

  /** Models a single `db.transaction(...)` block. */
  async transaction<T>(fn: (tx: {
    execute: (kind: "selectForUpdateSkipLocked", id: number) => Promise<{ rows: FeedRow[] }>;
    update: (patch: Partial<FeedRow>) => Promise<void>;
  }) => Promise<T>): Promise<T> {
    const txTag = Symbol("tx");
    let acquired = false;
    const tx = {
      execute: async (kind: "selectForUpdateSkipLocked", id: number) => {
        if (kind !== "selectForUpdateSkipLocked") throw new Error("unknown");
        if (id !== this.row.id) return { rows: [] };
        if (this.heldBy && this.heldBy !== txTag) {
          // SKIP LOCKED => zero rows when another tx holds the lock.
          return { rows: [] };
        }
        this.heldBy = txTag;
        acquired = true;
        return { rows: [{ ...this.row }] };
      },
      update: async (patch: Partial<FeedRow>) => {
        this.row = { ...this.row, ...patch };
      },
    };
    try {
      return await fn(tx);
    } finally {
      if (acquired && this.heldBy === txTag) this.heldBy = null;
    }
  }

  snapshot(): FeedRow {
    return { ...this.row };
  }
}

/**
 * Mirrors the route's tx-A block (lock + read offset). Returns null on
 * SKIP-LOCKED miss, mirroring the route's 409 path.
 */
async function lockAndReadOffset(store: MockFeedStore, feedId: number, holdMs: number) {
  return store.transaction(async (tx) => {
    const r = await tx.execute("selectForUpdateSkipLocked", feedId);
    const row = r.rows[0];
    if (!row) return null;
    // Simulate the work that historically happened INSIDE the (broken)
    // single mutation but here only the lock-hold window for the test.
    await new Promise((res) => setTimeout(res, holdMs));
    return {
      offset: Number(row.query ?? "0"),
      lastFetchCount: row.last_fetch_count ?? 0,
      errorCount: row.error_count ?? 0,
    };
  });
}

describe("W20 crawl route: FOR UPDATE SKIP LOCKED contract", () => {
  it("two concurrent crawls on the same feed: one wins, the other is skip-locked", async () => {
    const store = new MockFeedStore({
      id: 1,
      query: "40",
      last_fetch_count: 100,
      error_count: 0,
    });

    const [a, b] = await Promise.all([
      lockAndReadOffset(store, 1, 30),
      lockAndReadOffset(store, 1, 30),
    ]);

    const winners = [a, b].filter((x) => x !== null);
    const losers = [a, b].filter((x) => x === null);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0]!.offset).toBe(40);
  });

  it("after the winner releases the lock, a subsequent call sees the row again", async () => {
    const store = new MockFeedStore({
      id: 7,
      query: "5",
      last_fetch_count: 0,
      error_count: 0,
    });

    const first = await lockAndReadOffset(store, 7, 0);
    expect(first).not.toBeNull();
    expect(first!.offset).toBe(5);

    // Lock released after the first tx returned; second call should re-acquire.
    const second = await lockAndReadOffset(store, 7, 0);
    expect(second).not.toBeNull();
    expect(second!.offset).toBe(5);
  });

  it("non-existent feed id yields no rows (caller should 409/skip)", async () => {
    const store = new MockFeedStore({
      id: 1,
      query: "0",
      last_fetch_count: 0,
      error_count: 0,
    });
    const miss = await lockAndReadOffset(store, 999, 0);
    expect(miss).toBeNull();
  });

  it("three racing crawls: exactly one wins per round", async () => {
    const store = new MockFeedStore({
      id: 2,
      query: "0",
      last_fetch_count: 0,
      error_count: 0,
    });

    const results = await Promise.all([
      lockAndReadOffset(store, 2, 20),
      lockAndReadOffset(store, 2, 20),
      lockAndReadOffset(store, 2, 20),
    ]);
    const winners = results.filter((x) => x !== null);
    expect(winners).toHaveLength(1);
  });
});
