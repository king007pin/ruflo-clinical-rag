import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createSession,
  loadSession,
  revokeSession,
  updateSessionLastSeen,
} from "../../lib/auth/sessions";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../lib/auth/ip-ua-hash", () => ({
  hashClientFingerprint: vi
    .fn()
    .mockImplementation(async (v) => (v ? `hash-${v}` : null)),
}));

import { db } from "@/db";

describe("Stateful Sessions database helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates session in DB and returns it", async () => {
    const mockSession = { id: "s-uuid", userId: "u-uuid", expiresAt: new Date() };
    const mockReturning = vi.fn().mockResolvedValue([mockSession]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const res = await createSession("u-uuid", "127.0.0.1", "Mozilla");
    expect(res).toEqual(mockSession);
    expect(db.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-uuid",
        ipHash: "hash-127.0.0.1",
        uaHash: "hash-Mozilla",
      }),
    );
  });

  it("loads valid active session", async () => {
    const mockSession = {
      id: "s-uuid",
      userId: "u-uuid",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    };
    const mockWhere = vi.fn().mockResolvedValue([{ session: mockSession, role: "clinician" }]);
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const res = await loadSession("s-uuid");
    expect(res).toEqual({ ...mockSession, role: "clinician" });
    expect(db.select).toHaveBeenCalled();
  });

  it("returns null when session is not found", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const res = await loadSession("s-missing");
    expect(res).toBeNull();
  });

  it("revokes session in DB", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

    await revokeSession("s-uuid");
    expect(db.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
