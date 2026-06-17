/**
 * Monitor statistics query.
 *
 * Computes per-monitor uptime percentages and last run status for a given user,
 * using the composite index on (monitorId, startedAt desc) for efficiency.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { checkRun, monitor } from "@/lib/db/schema";

export type MonitorStats = {
  monitorId: string;
  name: string;
  isActive: boolean;
  lastRunStatus: "running" | "pending_retry" | "passed" | "failed" | null;
  /** Uptime percentage 0–100 in the past 7 days (100 if no runs in window). */
  uptimePct7d: number;
  /** Uptime percentage 0–100 in the past 30 days (100 if no runs in window). */
  uptimePct30d: number;
  createdAt: Date;
};

/**
 * Returns aggregated stats for all monitors belonging to the given user.
 *
 * - `uptimePct7d`: percentage of passed check_runs in the past 7 days
 *   (0–100; 100 if no runs in window).
 * - `uptimePct30d`: same but 30-day window.
 * - `lastRunStatus`: status of the most recent check_run.
 *
 * Accepts an optional `db` parameter so integration tests can inject
 * the test database without mocking the module.
 */
export async function getMonitorStats(
  userId: string,
  db: Database = appDb,
): Promise<MonitorStats[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all monitors for this user
  const monitors = await db
    .select()
    .from(monitor)
    .where(eq(monitor.userId, userId))
    .orderBy(desc(monitor.createdAt));

  if (monitors.length === 0) {
    return [];
  }

  const monitorIds = monitors.map((m) => m.id);

  // Aggregate check_run stats per monitor in the 7-day window
  const stats7dRows = await db
    .select({
      monitorId: checkRun.monitorId,
      total: sql<number>`count(*)::int`,
      passed: sql<number>`sum(case when ${checkRun.status} = 'passed' then 1 else 0 end)::int`,
    })
    .from(checkRun)
    .where(
      and(
        inArray(checkRun.monitorId, monitorIds),
        gte(checkRun.startedAt, sevenDaysAgo),
      ),
    )
    .groupBy(checkRun.monitorId);

  // Aggregate check_run stats per monitor in the 30-day window
  const stats30dRows = await db
    .select({
      monitorId: checkRun.monitorId,
      total: sql<number>`count(*)::int`,
      passed: sql<number>`sum(case when ${checkRun.status} = 'passed' then 1 else 0 end)::int`,
    })
    .from(checkRun)
    .where(
      and(
        inArray(checkRun.monitorId, monitorIds),
        gte(checkRun.startedAt, thirtyDaysAgo),
      ),
    )
    .groupBy(checkRun.monitorId);

  // Fetch the most recent check_run per monitor for lastRunStatus
  // Use a lateral or subquery approach — fetch all runs and take first per group
  const latestRunRows = await db
    .selectDistinctOn([checkRun.monitorId], {
      monitorId: checkRun.monitorId,
      status: checkRun.status,
    })
    .from(checkRun)
    .where(inArray(checkRun.monitorId, monitorIds))
    .orderBy(checkRun.monitorId, desc(checkRun.startedAt));

  // Build lookup maps
  const map7d = new Map(stats7dRows.map((r) => [r.monitorId, r]));
  const map30d = new Map(stats30dRows.map((r) => [r.monitorId, r]));
  const mapLatest = new Map(latestRunRows.map((r) => [r.monitorId, r]));

  return monitors.map((m) => {
    const s7 = map7d.get(m.id);
    const s30 = map30d.get(m.id);
    const latest = mapLatest.get(m.id);

    const uptimePct7d =
      s7 && s7.total > 0
        ? Math.round((s7.passed / s7.total) * 1000) / 10
        : 100;

    const uptimePct30d =
      s30 && s30.total > 0
        ? Math.round((s30.passed / s30.total) * 1000) / 10
        : 100;

    return {
      monitorId: m.id,
      name: m.name,
      isActive: m.isActive,
      lastRunStatus:
        (latest?.status as MonitorStats["lastRunStatus"]) ?? null,
      uptimePct7d,
      uptimePct30d,
      createdAt: m.createdAt,
    };
  });
}
