import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock the DB and secret vault dependencies
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireRole: vi.fn(),
}));

import { db } from "@/db";
import { requireRole } from "@/lib/auth-guard";
import { GET as getCases, POST as postCases } from "../../app/api/cases/route";
import { POST as postFeedback } from "../../app/api/feedback/route";

describe("RBAC and Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Cases Route isolation (W15)", () => {
    it("returns only owner cases for clinician", async () => {
      vi.mocked(requireRole).mockResolvedValue({
        userId: "clinician-user-id",
        sessionId: "session-id",
        role: "clinician",
      });

      const mockCases = [{ id: 1, title: "Clinician Case", createdBy: "clinician-user-id" }];
      const mockLimit = vi.fn().mockResolvedValue(mockCases);
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const req = new NextRequest("https://example.com/api/cases");
      const res = await getCases(req);
      expect(res).toBeInstanceOf(NextResponse);
      const json = await res.json();
      expect(json.cases).toEqual(mockCases);
      expect(mockWhere).toHaveBeenCalled();
    });

    it("returns all cases for admin", async () => {
      vi.mocked(requireRole).mockResolvedValue({
        userId: "admin-user-id",
        sessionId: "session-id",
        role: "admin",
      });

      const mockCases = [
        { id: 1, title: "Clinician Case", createdBy: "clinician-user-id" },
        { id: 2, title: "Other Case", createdBy: "other-user-id" },
      ];
      const mockLimit = vi.fn().mockResolvedValue(mockCases);
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const req = new NextRequest("https://example.com/api/cases");
      const res = await getCases(req);
      expect(res).toBeInstanceOf(NextResponse);
      const json = await res.json();
      expect(json.cases).toEqual(mockCases);
      // Admin query doesn't filter by createdBy
      expect(mockFrom().where).toBeUndefined();
    });

    it("blocks viewers from creating cases", async () => {
      // requireRole should return 403 response
      vi.mocked(requireRole).mockImplementation(async (req, allowedRoles) => {
        if (!allowedRoles.includes("viewer")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return { userId: "viewer-id", sessionId: "s", role: "viewer" } as any;
      });

      const req = new NextRequest("https://example.com/api/cases", {
        method: "POST",
        body: JSON.stringify({
          title: "New Case",
          question: "Q?",
          answer: "A!",
        }),
      });
      const res = await postCases(req);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });
  });

  describe("Feedback route session ownership (W58)", () => {
    it("rejects clinician from submitting feedback on another user's session", async () => {
      vi.mocked(requireRole).mockResolvedValue({
        userId: "clinician-1-id",
        sessionId: "session-id",
        role: "clinician",
      });

      // Mock querySessions query: session exists but belongs to clinician-2-id
      const mockSession = { id: 101, userId: "clinician-2-id" };
      const mockWhere = vi.fn().mockResolvedValue([mockSession]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const req = new NextRequest("https://example.com/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: 101,
          rating: 5,
          helpful: true,
        }),
      });

      const res = await postFeedback(req);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });

    it("allows clinician to submit feedback on their own session", async () => {
      vi.mocked(requireRole).mockResolvedValue({
        userId: "clinician-1-id",
        sessionId: "session-id",
        role: "clinician",
      });

      // Mock querySessions query
      const mockSession = { id: 101, userId: "clinician-1-id" };
      const mockWhere = vi.fn().mockResolvedValue([mockSession]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

      const req = new NextRequest("https://example.com/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: 101,
          rating: 5,
          helpful: true,
        }),
      });

      const res = await postFeedback(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });
});
