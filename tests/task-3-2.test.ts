/**
 * Acceptance tests for task-3-2: getMonitorStats query + dashboard page.
 *
 * Integration tests that exercise real DB (pglite) with actual query logic.
 * Tests are written BEFORE the implementation.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { monitor, checkRun, user } from "@/lib/db/schema";
import { getMonitorStats } from "@/lib/queries/monitor-stats";

// ---- Test state ----

let testDb: Awaited<ReturnType<typeof createTestDb>>;

const USER_1 = { id: "user-1", name: "Alice", email: "alice@test.com" };
const USER_2 = { id: "user-2", name: "Bob", email: "bob@test.com" };

// ---- Setup / Teardown ----

beforeEach(async () => {
  testDb = await createTestDb();
});

afterEach(async () => {
  await testDb?.close();
});

// ---- Acceptance tests ----

describe("task-3-2: getMonitorStats", () => {
  it("returns correct uptime percentages (8 passed + 2 failed = 80%)", async () => {
    // Insert user
    await testDb.db.insert(user).values([
      { id: USER_1.id, name: USER_1.name, email: USER_1.email },
    ]);

    // Insert a monitor for USER_1
    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "Checkout Funnel",
        funnelConfig: { steps: [] },
      })
      .returning();

    // Insert 8 passed + 2 failed check_runs within the past 7 days
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const runValues: Array<{
      monitorId: string;
      status: "passed" | "failed";
      startedAt: Date;
      completedAt: Date;
    }> = [];

    for (let i = 0; i < 8; i++) {
      runValues.push({
        monitorId: mon.id,
        status: "passed",
        startedAt: threeDaysAgo,
        completedAt: threeDaysAgo,
      });
    }
    for (let i = 0; i < 2; i++) {
      runValues.push({
        monitorId: mon.id,
        status: "failed",
        startedAt: threeDaysAgo,
        completedAt: threeDaysAgo,
      });
    }

    await testDb.db.insert(checkRun).values(runValues);

    const stats = await getMonitorStats(USER_1.id, testDb.db);

    expect(stats).toHaveLength(1);
    expect(stats[0].monitorId).toBe(mon.id);
    expect(stats[0].name).toBe("Checkout Funnel");
    expect(stats[0].uptimePct7d).toBe(80);
  });

  it("scopes to userId — does not return other user's monitors", async () => {
    // Insert two users
    await testDb.db.insert(user).values([
      { id: USER_1.id, name: USER_1.name, email: USER_1.email },
      { id: USER_2.id, name: USER_2.name, email: USER_2.email },
    ]);

    // Insert a monitor for each user
    const [mon1] = await testDb.db
      .insert(monitor)
      .values({
        userId: USER_1.id,
        name: "User1 Monitor",
        funnelConfig: { steps: [] },
      })
      .returning();

    await testDb.db.insert(monitor).values({
      userId: USER_2.id,
      name: "User2 Monitor",
      funnelConfig: { steps: [] },
    });

    const stats1 = await getMonitorStats(USER_1.id, testDb.db);
    expect(stats1).toHaveLength(1);
    expect(stats1[0].monitorId).toBe(mon1.id);
    expect(stats1[0].name).toBe("User1 Monitor");

    const stats2 = await getMonitorStats(USER_2.id, testDb.db);
    expect(stats2).toHaveLength(1);
    expect(stats2[0].name).toBe("User2 Monitor");

    // Confirm userId1 stats does not include userId2's monitor
    const monitorIds1 = stats1.map((s) => s.monitorId);
    const monitorIds2 = stats2.map((s) => s.monitorId);
    expect(monitorIds1).not.toEqual(expect.arrayContaining(monitorIds2));
  });
});
