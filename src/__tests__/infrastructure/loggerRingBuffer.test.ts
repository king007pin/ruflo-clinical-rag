import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetLogBufferForTests,
  getRecentLogs,
  logger,
} from "../../lib/logger";

const ORIGINAL_ENV = { ...process.env };

function silenceConsole(): void {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("logger ring buffer (W85)", () => {
  beforeEach(() => {
    __resetLogBufferForTests();
    silenceConsole();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    __resetLogBufferForTests();
  });

  it("caps buffer at LOG_RING_BUFFER_SIZE and evicts FIFO", () => {
    process.env.LOG_RING_BUFFER_SIZE = "3";
    logger.info("a");
    logger.info("b");
    logger.info("c");
    logger.info("d");
    logger.info("e");
    const entries = getRecentLogs();
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.message)).toEqual(["c", "d", "e"]);
  });

  it("filters entries older than LOG_TTL_MS on read", () => {
    process.env.LOG_TTL_MS = "1000";
    const realNow = Date.now;
    const t0 = realNow.call(Date);
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(t0);
    logger.info("old-entry");
    spy.mockReturnValue(t0 + 5000);
    logger.info("fresh-entry");
    const entries = getRecentLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("fresh-entry");
  });

  it("scrubs PHI before entries land in the buffer", () => {
    logger.info("seen by Dr. Jane Smith", { contact: "call 555-123-4567" });
    const entries = getRecentLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("seen by [NAME]");
    expect(entries[0].meta).toEqual({ contact: "call [PHONE]" });
    expect(JSON.stringify(entries[0])).not.toContain("555-123-4567");
    expect(JSON.stringify(entries[0])).not.toContain("Jane Smith");
  });

  it("falls back to defaults on invalid LOG_RING_BUFFER_SIZE values", () => {
    process.env.LOG_RING_BUFFER_SIZE = "not-a-number";
    // Should not throw and should accept many entries (default 1000).
    for (let i = 0; i < 25; i++) logger.info(`line-${i}`);
    expect(getRecentLogs()).toHaveLength(25);

    __resetLogBufferForTests();
    process.env.LOG_RING_BUFFER_SIZE = "-5";
    for (let i = 0; i < 10; i++) logger.info(`neg-${i}`);
    expect(getRecentLogs()).toHaveLength(10);
  });

  it("caps LOG_RING_BUFFER_SIZE at the 10_000 ceiling", () => {
    process.env.LOG_RING_BUFFER_SIZE = "999999999";
    // Push 10_001 entries; buffer must not exceed 10_000.
    for (let i = 0; i < 10_001; i++) logger.info(`x-${i}`);
    const entries = getRecentLogs();
    expect(entries.length).toBeLessThanOrEqual(10_000);
    expect(entries.length).toBe(10_000);
    // FIFO eviction: oldest (`x-0`) must be gone.
    expect(entries[0].message).toBe("x-1");
  });

  it("returns a read-only snapshot from getRecentLogs", () => {
    logger.info("alpha");
    logger.info("beta");
    const snap1 = getRecentLogs();
    expect(snap1.map((e) => e.message)).toEqual(["alpha", "beta"]);
    // Mutating the returned array must not affect subsequent reads.
    snap1.pop();
    snap1.push({ ts: 0, level: "info", message: "injected" });
    const snap2 = getRecentLogs();
    expect(snap2.map((e) => e.message)).toEqual(["alpha", "beta"]);
    expect(snap2).not.toBe(snap1);
  });
});
