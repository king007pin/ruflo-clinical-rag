/**
 * W87 — quorum-gating.ts.
 * Handles wallclock-bounded quorum gating for Round 1 and Round 2.
 * When set, the swarm proceeds to the next stage as soon as
 * ceil(QUORUM_RATIO × N) agents return OR ROUND_WALLCLOCK_MS elapses, whichever
 * comes first. Slow agents keep running in background but synthesis no longer waits.
 */
export const LATENCY_V2 = process.env.LATENCY_V2 !== "0";
export const QUORUM_RATIO = 0.6;
export const ROUND1_WALLCLOCK_MS = 30_000;
// Raised 35s→50s: gives latency-hedged debate agents headroom to land before
// the quorum cuts them (routes run maxDuration=300, so ample room remains).
export const ROUND2_WALLCLOCK_MS = 50_000;

export async function awaitWithQuorum<T>(
  promises: Array<Promise<T>>,
  quorumCount: number,
  wallclockMs: number,
): Promise<Array<T | undefined>> {
  const results: Array<T | undefined> = new Array(promises.length).fill(undefined);
  if (promises.length === 0) return results;

  let completed = 0;
  const indexed = promises.map((p, i) =>
    p.then(
      (v) => {
        results[i] = v;
        completed += 1;
      },
      () => {
        completed += 1;
      },
    ),
  );

  await new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    const timer = setTimeout(done, wallclockMs);
    void Promise.all(indexed).then(() => {
      clearTimeout(timer);
      done();
    });
    indexed.forEach((p) =>
      p.then(() => {
        if (completed >= quorumCount) {
          clearTimeout(timer);
          done();
        }
      }),
    );
  });

  return results;
}
