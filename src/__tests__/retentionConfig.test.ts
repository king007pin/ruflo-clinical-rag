import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveRetentionDays } from "../app/api/cron/retention/_resolve";

function silenceLogger(): void {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
}

describe("resolveRetentionDays (W83)", () => {
  beforeEach(() => {
    silenceLogger();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers the per-table env var when set", () => {
    const got = resolveRetentionDays("30", "120", 90, { label: "t" });
    expect(got).toBe(30);
  });

  it("falls back to PHI_RETENTION_DAYS when per-table unset", () => {
    const got = resolveRetentionDays(undefined, "120", 90, { label: "t" });
    expect(got).toBe(120);
  });

  it("falls back to the hard default when neither env var is set", () => {
    const got = resolveRetentionDays(undefined, undefined, 90, { label: "t" });
    expect(got).toBe(90);
  });

  it("clamps values below 7 up to 7 (silently)", () => {
    const got = resolveRetentionDays("3", undefined, 90, { label: "t" });
    expect(got).toBe(7);
  });

  it("clamps values above 3650 down to 3650 (silently)", () => {
    const got = resolveRetentionDays("99999", undefined, 90, { label: "t" });
    expect(got).toBe(3650);
  });

  it("ignores NaN / non-positive and continues the fallback chain", () => {
    expect(resolveRetentionDays("not-a-number", "45", 90, { label: "t" })).toBe(45);
    expect(resolveRetentionDays("0", "45", 90, { label: "t" })).toBe(45);
    expect(resolveRetentionDays("-5", undefined, 90, { label: "t" })).toBe(90);
  });
});
