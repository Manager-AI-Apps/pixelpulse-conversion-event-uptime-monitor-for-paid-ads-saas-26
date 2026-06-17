/**
 * Acceptance tests for task-2-6:
 *   - app/api/monitors/[id]/run/route.ts: POST handler
 *   - app/api/monitors/[id]/results/route.ts: GET handler
 *
 * Integration tests — real pglite DB, mocked auth session and orchestrator.
 * Tests are written BEFORE the implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { NextRequest } from "next/server";
import { user, monitor, checkRun, eventAssertionResult } from "@/lib/db/schema";
import * as dbModule from "@/lib/db";
import { getRequiredSession } from "@/lib/session";
import { POST as POST_RUN } from "@/app/api/monitors/[id]/run/route";
import { GET as GET_RESULTS } from "@/app/api/monitors/[id]/results/route";

// ---------------------------------------------------------------------------
// Module mocks (hoisted above imports by Vitest)
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/session", () => ({ getRequiredSession: vi.fn() }));
// Mock the orchestrator so runMonitorCheck doesn't actually execute
vi.mock("@/lib/engine/orchestrator", () => ({
  runMonitorCheck: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const USER_1 = { id: "u2-6-alice", name: "Alice", email: "alice-2-6@test.com" };
const USER_2 = { id: "u2-6-bob", name: "Bob", email: "bob-2-6@test.com" };

const VALID_FUNNEL_CONFIG = {
  steps: [{ url: "https://example.com/checkout", expectedEvents: [] }],
};

function mockSession(u: { id: string; name: string; email: string }) {
  vi.mocked(getRequiredSession).mockResolvedValue({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: `sess-${u.id}`,
      userId: u.id,
      token: `tok-${u.id}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as ReturnType<typeof getRequiredSession> extends Promise<infer T> ? T : never);
}

// ---------------------------------------------------------------------------
// Test database lifecycle
// ---------------------------------------------------------------------------

let testDb: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  testDb = await createTestDb();
  (dbModule as { db: unknown }).db = testDb.db;

  await testDb.db.insert(user).values([
    { id: USER_1.id, name: USER_1.name, email: USER_1.email },
    { id: USER_2.id, name: USER_2.name, email: USER_2.email },
  ]);
});

afterEach(async () => {
  await testDb?.close();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/monitors/[id]/run
// ---------------------------------------------------------------------------

describe("task-2-6: POST /api/monitors/[id]/run", () => {
  it("returns 409 when run already in progress", async () => {
    mockSession(USER_1);

    // Insert a monitor owned by USER_1
    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "Running Guard Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    // Pre-insert a 'running' check_run to simulate an in-progress run
    await testDb.db.insert(checkRun).values({
      monitorId: mon.id,
      status: "running",
    });

    const req = new NextRequest(
      `http://localhost/api/monitors/${mon.id}/run`,
      { method: "POST" },
    );

    const res = await POST_RUN(req, {
      params: Promise.resolve({ id: mon.id }),
    });

    expect(res.status).toBe(409);
  });

  it("returns 202 and triggers runMonitorCheck when no run in progress", async () => {
    mockSession(USER_1);

    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "Trigger Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    const req = new NextRequest(
      `http://localhost/api/monitors/${mon.id}/run`,
      { method: "POST" },
    );

    const res = await POST_RUN(req, {
      params: Promise.resolve({ id: mon.id }),
    });

    expect(res.status).toBe(202);
  });

  it("returns 404 if monitor belongs to different user", async () => {
    // Insert monitor for USER_1
    mockSession(USER_1);
    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "Scoped Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    // Now try to trigger run as USER_2
    mockSession(USER_2);
    const req = new NextRequest(
      `http://localhost/api/monitors/${mon.id}/run`,
      { method: "POST" },
    );

    const res = await POST_RUN(req, {
      params: Promise.resolve({ id: mon.id }),
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/monitors/[id]/results
// ---------------------------------------------------------------------------

describe("task-2-6: GET /api/monitors/[id]/results", () => {
  it("returns scoped check_runs with assertions", async () => {
    mockSession(USER_1);

    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "Results Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    const [run] = await testDb.db
      .insert(checkRun)
      .values({ monitorId: mon.id, status: "passed" })
      .returning();

    await testDb.db.insert(eventAssertionResult).values({
      checkRunId: run.id,
      stepIndex: 0,
      eventType: "ga4",
      passed: true,
    });

    const req = new NextRequest(
      `http://localhost/api/monitors/${mon.id}/results`,
      { method: "GET" },
    );

    const res = await GET_RESULTS(req, {
      params: Promise.resolve({ id: mon.id }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as Array<{
      id: string;
      assertions: Array<{ eventType: string }>;
    }>;
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe(run.id);
    expect(Array.isArray(json[0].assertions)).toBe(true);
    expect(json[0].assertions).toHaveLength(1);
    expect(json[0].assertions[0].eventType).toBe("ga4");
  });

  it("returns 404 when monitor belongs to different user", async () => {
    mockSession(USER_1);
    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "Private Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    // USER_2 cannot see USER_1's monitor
    mockSession(USER_2);
    const req = new NextRequest(
      `http://localhost/api/monitors/${mon.id}/results`,
      { method: "GET" },
    );

    const res = await GET_RESULTS(req, {
      params: Promise.resolve({ id: mon.id }),
    });

    expect(res.status).toBe(404);
  });

  it("returns at most 10 check_runs per monitor", async () => {
    mockSession(USER_1);

    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "Limit Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    // Insert 12 check_runs
    for (let i = 0; i < 12; i++) {
      await testDb.db.insert(checkRun).values({
        monitorId: mon.id,
        status: "passed",
      });
    }

    const req = new NextRequest(
      `http://localhost/api/monitors/${mon.id}/results`,
      { method: "GET" },
    );

    const res = await GET_RESULTS(req, {
      params: Promise.resolve({ id: mon.id }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as unknown[];
    expect(json).toHaveLength(10);
  });
});
