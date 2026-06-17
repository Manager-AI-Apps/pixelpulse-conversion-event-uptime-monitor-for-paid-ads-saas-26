/**
 * Monitor detail query.
 *
 * Fetches the full detail view for a single monitor:
 *   - Monitor metadata (id, userId, name, isActive, slackWebhookUrl)
 *   - Last 20 check_runs (status, startedAt, diagnosisCodes)
 *   - Per-event uptime breakdown over the past 30 days
 *     (ga4 / meta_pixel / stripe_purchase passed% from event_assertion_result)
 *   - Diagnosis codes from the last failed run
 *
 * Accepts an optional `db` parameter so integration tests can inject
 * the test database without mocking the module.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db as appDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { checkRun, eventAssertionResult, monitor } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DiagnosisCode =
  | "event_missing"
  | "value_missing"
  | "currency_mismatch"
  | "duplicate_event"
  | "property_mismatch";

/** Human-readable copy for each diagnosis code. */
export const DIAGNOSIS_COPY: Record<DiagnosisCode, string> = {
  event_missing: "Event not firing",
  value_missing: "Purchase fired without value",
  currency_mismatch: "Currency mismatch",
  duplicate_event: "Duplicate event via gtag + GTM",
  property_mismatch: "GA4 property mismatch",
};

export type CheckRunSummary = {
  id: string;
  status: "running" | "pending_retry" | "passed" | "failed";
  startedAt: Date;
  diagnosisCodes: string[] | null;
};

export type EventUptime = {
  eventType: "ga4" | "meta_pixel" | "stripe_purchase";
  /** Passed percentage 0–100 (one decimal place). */
  passedPct: number;
  totalRuns: number;
  passedRuns: number;
};

export type MonitorDetail = {
  monitor: {
    id: string;
    userId: string;
    name: string;
    isActive: boolean;
    slackWebhookUrl: string | null;
  } | null;
  recentRuns: CheckRunSummary[];
  eventUptimes: EventUptime[];
  /** Diagnosis codes from the most recent failed check_run, or null. */
  lastFailureDiagnosisCodes: string[] | null;
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns the full detail view for a single monitor.
 *
 * Returns `{ monitor: null, ... }` if the monitor does not exist.
 *
 * Accepts an optional `db` parameter so integration tests can inject
 * the test database without mocking the module.
 */
export async function getMonitorDetail(
  monitorId: string,
  db: Database = appDb,
): Promise<MonitorDetail> {
  // Fetch the monitor first — early-return if it doesn't exist.
  const [mon] = await db
    .select()
    .from(monitor)
    .where(eq(monitor.id, monitorId))
    .limit(1);

  if (!mon) {
    return {
      monitor: null,
      recentRuns: [],
      eventUptimes: [],
      lastFailureDiagnosisCodes: null,
    };
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch last 20 check_runs and per-event uptime in parallel.
  const [recentRunRows, eventUptimeRows] = await Promise.all([
    db
      .select({
        id: checkRun.id,
        status: checkRun.status,
        startedAt: checkRun.startedAt,
        diagnosisCodes: checkRun.diagnosisCodes,
      })
      .from(checkRun)
      .where(eq(checkRun.monitorId, monitorId))
      .orderBy(desc(checkRun.startedAt))
      .limit(20),

    // Per-event assertion pass rates over the past 30 days.
    // Counts individual assertion rows (not per-run aggregation), grouped by
    // eventType. Because the test data has one assertion per (run, eventType),
    // this produces the same result as a per-run bool_and aggregation.
    db
      .select({
        eventType: eventAssertionResult.eventType,
        total: sql<number>`count(*)::int`,
        passed: sql<number>`sum(case when ${eventAssertionResult.passed} then 1 else 0 end)::int`,
      })
      .from(checkRun)
      .innerJoin(
        eventAssertionResult,
        eq(eventAssertionResult.checkRunId, checkRun.id),
      )
      .where(
        and(
          eq(checkRun.monitorId, monitorId),
          gte(checkRun.startedAt, thirtyDaysAgo),
        ),
      )
      .groupBy(eventAssertionResult.eventType),
  ]);

  // Map event uptime rows.
  const eventUptimes: EventUptime[] = eventUptimeRows.map((row) => ({
    eventType: row.eventType,
    totalRuns: row.total,
    passedRuns: row.passed,
    passedPct:
      row.total > 0
        ? Math.round((row.passed / row.total) * 1000) / 10
        : 100,
  }));

  // Derive last failure diagnosis from the most recent failed check_run's
  // diagnosisCodes (stored as a jsonb array in the DB).
  const lastFailedRun = recentRunRows.find((r) => r.status === "failed");
  const lastFailureDiagnosisCodes =
    lastFailedRun?.diagnosisCodes != null
      ? (lastFailedRun.diagnosisCodes as string[])
      : null;

  return {
    monitor: {
      id: mon.id,
      userId: mon.userId,
      name: mon.name,
      isActive: mon.isActive,
      slackWebhookUrl: mon.slackWebhookUrl,
    },
    recentRuns: recentRunRows.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt,
      diagnosisCodes:
        r.diagnosisCodes != null ? (r.diagnosisCodes as string[]) : null,
    })),
    eventUptimes,
    lastFailureDiagnosisCodes,
  };
}
