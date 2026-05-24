import { describe, expect, it } from "vitest";

import { AUDIT_TARGET_RE, auditTargetSchema } from "../../db/schema";

describe("auditTargetSchema (W81)", () => {
  it("accepts kind:id form", () => {
    const r = auditTargetSchema.safeParse("feed:42");
    expect(r.success).toBe(true);
    expect(AUDIT_TARGET_RE.test("providerId:openai")).toBe(true);
    expect(AUDIT_TARGET_RE.test("user:7f3-abc_DEF")).toBe(true);
  });

  it("rejects targets missing the colon", () => {
    const r = auditTargetSchema.safeParse("legacy-admin");
    expect(r.success).toBe(false);
  });

  it("rejects kinds starting with a digit", () => {
    const r = auditTargetSchema.safeParse("4feed:42");
    expect(r.success).toBe(false);
  });

  it("accepts wildcard scope kind:*", () => {
    const r = auditTargetSchema.safeParse("feeds:*");
    expect(r.success).toBe(true);
  });

  it("rejects empty id segment", () => {
    expect(auditTargetSchema.safeParse("feed:").success).toBe(false);
    expect(auditTargetSchema.safeParse(":42").success).toBe(false);
    expect(auditTargetSchema.safeParse("").success).toBe(false);
  });
});
