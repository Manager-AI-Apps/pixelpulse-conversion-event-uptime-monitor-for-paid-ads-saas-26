/**
 * Acceptance tests for task-2-4:
 *   - lib/engine/orchestrator.ts: runMonitorCheck()
 *   - app/api/cron/run-checks/route.ts: POST handler
 *
 * Tests are written BEFORE the implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { createTestDb } from "@/tests/helpers/test-db";
import { user, monitor, checkRun } from "@/lib/db/schema";
import * as dbModule from "@/lib/db";
import { replayFunnel } from "@/lib/engine/replay";
import { runMonitorCheck } from "@/lib/engine/orchestrator";
import { POST } from "@/app/api/cron/run-checks/route";

// ---------------------------------------------------------------------------
// Hoisted mocks — these run before module imports
// ---------------------------------------------------------------------------

// Mock the default db export so no Postgres connection is attempted at import time
vi.mock("@/lib/db", () => ({ db: {} }));

// Mock replayFunnel so integration tests can control its behaviour
vi.mock("@/lib/engine/replay", () => ({
  replayFunnel: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: "u-task-2-4",
  name: "Test User",
  email: "task24@example.com",
};

/**
 * A minimal funnel config that satisfies lib/engine/types FunnelConfigSchema:
 *   steps[].url (https), steps[].expectedEvents (array)
 */
const VALID_FUNNEL_CONFIG = {
  steps: [
    {
      url: "https://example.com/checkout",
      expectedEvents: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Test database lifecycle
// ---------------------------------------------------------------------------

let testDb: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  testDb = await createTestDb();
  // Point the mocked @/lib/db at the real in-process pglite instance
  (dbModule as unknown as { db: unknown }).db = testDb.db;
  vi.clearAllMocks();
});

afterEach(async () => {
  await testDb?.close();
});

// ---------------------------------------------------------------------------
// Unit test: cron route rejects wrong secret
// ---------------------------------------------------------------------------

describe("task-2-4: cron route authentication", () => {
  it("rejects wrong x-cron-secret with 401 (timingSafeEqual implementation)", async () => {
    // The route reads CRON_SECRET via requireEnv — provide a known value
    process.env.CRON_SECRET = "correct-cron-secret-xyztest";

    const req = new NextRequest("http://localhost/api/cron/run-checks", {
      method: "POST",
      headers: { "x-cron-secret": "wrong-secret" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    delete process.env.CRON_SECRET;
  });

  it("rejects missing x-cron-secret header with 401", async () => {
    process.env.CRON_SECRET = "correct-cron-secret-xyztest";

    const req = new NextRequest("http://localhost/api/cron/run-checks", {
      method: "POST",
      // No header supplied
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    delete process.env.CRON_SECRET;
  });
});

// ---------------------------------------------------------------------------
// Integration test: orchestrator skips duplicate running check
// ---------------------------------------------------------------------------

describe("task-2-4: orchestrator duplicate run guard", () => {
  it("skips inserting a new check_run when status=running already exists", async () => {
    // Create required parent rows (FK: monitor → user → check_run)
    await testDb.db.insert(user).values(TEST_USER);

    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: TEST_USER.id,
        name: "Duplicate Guard Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    // Pre-insert a 'running' check_run to simulate an in-progress run
    await testDb.db.insert(checkRun).values({
      monitorId: mon.id,
      status: "running",
    });

    // Call orchestrator — should detect the running check_run and return early
    await runMonitorCheck(mon.id, { db: testDb.db });

    // Assert: still only one check_run row (no duplicate was inserted)
    const runs = await testDb.db
      .select()
      .from(checkRun)
      .where(eq(checkRun.monitorId, mon.id));

    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("running"); // original row, unchanged
  });
});

// ---------------------------------------------------------------------------
// Integration test: pending_retry on first failure, failed on second
// ---------------------------------------------------------------------------

describe("task-2-4: orchestrator retry logic", () => {
  it("sets pending_retry on first failure; failed on second call with isRetry=true", async () => {
    // Create parent rows
    await testDb.db.insert(user).values(TEST_USER);

    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: TEST_USER.id,
        name: "Retry Logic Monitor",
        funnelConfig: VALID_FUNNEL_CONFIG,
        isActive: true,
      })
      .returning();

    // Mock replayFunnel to always throw (simulates a persistent network error)
    vi.mocked(replayFunnel).mockRejectedValue(
      new Error("Simulated network failure"),
    );

    // ---- First call (isRetry=false, the default) ----
    await runMonitorCheck(mon.id, { db: testDb.db, isRetry: false });

    const runsAfterFirst = await testDb.db
      .select()
      .from(checkRun)
      .where(eq(checkRun.monitorId, mon.id));

    // Exactly one check_run created, status=pending_retry
    expect(runsAfterFirst).toHaveLength(1);
    expect(runsAfterFirst[0].status).toBe("pending_retry");

    // ---- Second call (isRetry=true, cron marks as confirmed failure) ----
    await runMonitorCheck(mon.id, { db: testDb.db, isRetry: true });

    const runsAfterSecond = await testDb.db
      .select()
      .from(checkRun)
      .where(eq(checkRun.monitorId, mon.id));

    // Two check_run rows: first (pending_retry) + second (failed)
    expect(runsAfterSecond).toHaveLength(2);

    const failedRun = runsAfterSecond.find((r) => r.status === "failed");
    expect(failedRun).toBeDefined();
    expect(failedRun?.isRetry).toBe(true);
  });
});
