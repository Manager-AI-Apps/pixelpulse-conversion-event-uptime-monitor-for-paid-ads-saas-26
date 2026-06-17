/**
 * lib/engine/orchestrator.ts
 *
 * Core check-run orchestration for PixelPulse.
 *
 * runMonitorCheck():
 *   1. Skips if a check_run with status='running' already exists (duplicate guard).
 *   2. Inserts a new check_run with status='running'.
 *   3. Parses the stored funnelConfig against FunnelConfigSchema; throws a typed
 *      InvalidFunnelConfigError if the config is malformed.
 *   4. Calls replayFunnel() then assertStep() for every funnel step.
 *   5. On assertion failure:
 *        isRetry=false  → status='pending_retry' (next cron tick retries).
 *        isRetry=true   → status='failed', persists EventAssertionResult rows,
 *                         sends Slack alert if slackWebhookUrl is configured.
 *   6. On success → status='passed', persists result rows.
 */

import { and, eq } from "drizzle-orm";

import { db as defaultDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { checkRun, eventAssertionResult, monitor } from "@/lib/db/schema";
import { FunnelConfigSchema } from "@/lib/engine/types";
import { replayFunnel } from "@/lib/engine/replay";
import { assertStep } from "@/lib/engine/assertions";
import type { EventAssertionResult } from "@/lib/engine/assertions";

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export class InvalidFunnelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFunnelConfigError";
  }
}

// ---------------------------------------------------------------------------
// Slack alert helper
// ---------------------------------------------------------------------------

async function sendSlackAlert(
  webhookUrl: string,
  monitorName: string,
  diagnosisCodes: string[],
): Promise<void> {
  const text =
    diagnosisCodes.length > 0
      ? `🚨 PixelPulse: monitor "${monitorName}" failed — ${diagnosisCodes.join(", ")}`
      : `🚨 PixelPulse: monitor "${monitorName}" failed`;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Swallow Slack errors — the check_run is already persisted correctly.
    // Alerting failures must not obscure the primary result.
  }
}

// ---------------------------------------------------------------------------
// Options type
// ---------------------------------------------------------------------------

export interface RunMonitorCheckOptions {
  /** Whether this is a retry of a previously-failed run. Default: false. */
  isRetry?: boolean;
  /**
   * Database instance to use. Defaults to the application's shared `db`.
   * Pass a test database here in integration tests.
   */
  db?: Database;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Execute one check run for the given monitor.
 *
 * Idempotent: if a check_run with status='running' already exists for this
 * monitor, the function returns immediately without inserting a duplicate.
 */
export async function runMonitorCheck(
  monitorId: string,
  options: RunMonitorCheckOptions = {},
): Promise<void> {
  const _db = options.db ?? defaultDb;
  const isRetry = options.isRetry ?? false;

  // (1) Duplicate-run guard ------------------------------------------------
  const [existingRunning] = await _db
    .select({ id: checkRun.id })
    .from(checkRun)
    .where(
      and(eq(checkRun.monitorId, monitorId), eq(checkRun.status, "running")),
    )
    .limit(1);

  if (existingRunning) {
    return;
  }

  // Fetch the monitor (needed for funnelConfig + slackWebhookUrl)
  const [mon] = await _db
    .select()
    .from(monitor)
    .where(eq(monitor.id, monitorId))
    .limit(1);

  if (!mon) {
    throw new Error(`Monitor not found: ${monitorId}`);
  }

  // (3) Validate funnelConfig -----------------------------------------------
  const configResult = FunnelConfigSchema.safeParse(mon.funnelConfig);
  if (!configResult.success) {
    throw new InvalidFunnelConfigError(
      `Invalid funnel config for monitor ${monitorId}: ${configResult.error.message}`,
    );
  }
  const funnelConfig = configResult.data;

  // (2) Insert check_run with status='running' -------------------------------
  const [run] = await _db
    .insert(checkRun)
    .values({ monitorId, status: "running", isRetry })
    .returning();

  if (!run) {
    throw new Error("Failed to insert check_run");
  }

  // (4) Replay + assert -------------------------------------------------------
  type StepAssertion = EventAssertionResult & { stepIndex: number };

  try {
    const stepResults = await replayFunnel(funnelConfig.steps);

    const allAssertions: StepAssertion[] = [];
    let hasFailed = false;

    for (let i = 0; i < funnelConfig.steps.length; i++) {
      const stepResult = stepResults[i];
      const step = funnelConfig.steps[i];
      if (!stepResult || !step) continue;

      const assertions = assertStep(stepResult, step);
      for (const a of assertions) {
        allAssertions.push({ ...a, stepIndex: i });
        if (!a.passed) hasFailed = true;
      }
    }

    if (hasFailed) {
      // (5) Assertion failure -------------------------------------------------
      if (!isRetry) {
        // First attempt: defer to next cron tick
        await _db
          .update(checkRun)
          .set({ status: "pending_retry", completedAt: new Date() })
          .where(eq(checkRun.id, run.id));
        return;
      }

      // Confirmed failure: persist results + alert -------------------------
      const diagnosisCodes = allAssertions
        .filter((a): a is StepAssertion & { diagnosisCode: string } =>
          !a.passed && a.diagnosisCode !== undefined,
        )
        .map((a) => a.diagnosisCode);

      await _db
        .update(checkRun)
        .set({
          status: "failed",
          completedAt: new Date(),
          diagnosisCodes,
        })
        .where(eq(checkRun.id, run.id));

      await _persistAssertions(_db, run.id, allAssertions);

      if (mon.slackWebhookUrl) {
        await sendSlackAlert(mon.slackWebhookUrl, mon.name, diagnosisCodes);
      }
      return;
    }

    // (6) Success ---------------------------------------------------------------
    await _db
      .update(checkRun)
      .set({ status: "passed", completedAt: new Date() })
      .where(eq(checkRun.id, run.id));

    await _persistAssertions(_db, run.id, allAssertions);
  } catch (err: unknown) {
    // Replay threw (network error, URL validation failure, etc.)
    // Treat the same as an assertion failure for retry/fail logic.
    const _ = err; // Acknowledged; no sensitive details logged to client
    if (!isRetry) {
      await _db
        .update(checkRun)
        .set({ status: "pending_retry", completedAt: new Date() })
        .where(eq(checkRun.id, run.id));
    } else {
      await _db
        .update(checkRun)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(checkRun.id, run.id));
    }
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

type StepAssertion = EventAssertionResult & { stepIndex: number };

async function _persistAssertions(
  _db: Database,
  checkRunId: string,
  assertions: StepAssertion[],
): Promise<void> {
  if (assertions.length === 0) return;

  // Insert in parallel — each row is independent
  await Promise.all(
    assertions.map((a) =>
      _db.insert(eventAssertionResult).values({
        checkRunId,
        stepIndex: a.stepIndex,
        eventType: a.expectedEvent.type,
        passed: a.passed,
        diagnosisCode: a.diagnosisCode ?? null,
        diagnosisDetail: a.message ?? null,
        capturedPayload: a.capturedEvent
          ? {
              eventName: a.capturedEvent.eventName,
              raw: a.capturedEvent.raw ?? null,
            }
          : null,
      }),
    ),
  );
}
