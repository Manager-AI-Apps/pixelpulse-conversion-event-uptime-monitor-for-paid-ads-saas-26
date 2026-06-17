/**
 * POST /api/cron/run-checks
 *
 * Triggered by an external scheduler (e.g. Render cron job) every 15 minutes.
 * Authenticates via a shared secret in the `x-cron-secret` header, then runs
 * pending monitor checks.
 *
 * Auth: crypto.timingSafeEqual() comparison of the incoming header value against
 * the CRON_SECRET environment variable — prevents timing-oracle attacks.
 *
 * Monitor logic:
 *   • Active monitors that have a recent `pending_retry` check_run are run with
 *     isRetry=true so a confirmed failure triggers a Slack alert.
 *   • All other active monitors are run normally (isRetry=false).
 */

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { ApiError, handleRoute } from "@/lib/api-error";
import { requireEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { checkRun, monitor } from "@/lib/db/schema";
import { runMonitorCheck } from "@/lib/engine/orchestrator";

export const POST = handleRoute(async (req: NextRequest) => {
  // Rate-limit: allow max 30 calls per minute (generous for cron + manual tests)
  const { ok: rateLimitOk } = rateLimit("cron:run-checks", 30, 60_000);
  if (!rateLimitOk) {
    throw new ApiError("rate_limited", "Too many requests to the cron endpoint.");
  }

  // ---------------------------------------------------------------------------
  // Authenticate using timing-safe comparison to prevent brute-force timing attacks
  // ---------------------------------------------------------------------------
  const incomingSecret = req.headers.get("x-cron-secret") ?? "";
  const cronSecret = requireEnv("CRON_SECRET");

  let secretValid = false;
  try {
    const incomingBuf = Buffer.from(incomingSecret);
    const expectedBuf = Buffer.from(cronSecret);
    // timingSafeEqual requires equal-length buffers; unequal length is always invalid
    if (incomingBuf.length === expectedBuf.length) {
      secretValid = crypto.timingSafeEqual(incomingBuf, expectedBuf);
    }
  } catch {
    secretValid = false;
  }

  if (!secretValid) {
    throw new ApiError("unauthorized", "Invalid or missing cron secret.");
  }

  // ---------------------------------------------------------------------------
  // Find active monitors + determine which ones are in pending_retry
  // ---------------------------------------------------------------------------
  const [activeMonitors, pendingRetryRuns] = await Promise.all([
    db.select().from(monitor).where(eq(monitor.isActive, true)),
    db
      .select({ monitorId: checkRun.monitorId })
      .from(checkRun)
      .where(eq(checkRun.status, "pending_retry")),
  ]);

  const pendingRetryIds = new Set(pendingRetryRuns.map((r) => r.monitorId));

  // ---------------------------------------------------------------------------
  // Run all active monitors (fire-and-collect errors so one failure doesn't
  // abort the whole batch)
  // ---------------------------------------------------------------------------
  const results = await Promise.allSettled(
    activeMonitors.map((mon) =>
      runMonitorCheck(mon.id, {
        isRetry: pendingRetryIds.has(mon.id),
      }),
    ),
  );

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason));

  return NextResponse.json({
    ok: true,
    monitorsChecked: activeMonitors.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});
