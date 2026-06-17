/**
 * POST /api/monitors/[id]/run
 *
 * Triggers an immediate, manual check run for the specified monitor.
 * Scoped to the authenticated user — returns 404 if the monitor belongs to
 * a different user.
 *
 * Returns 409 if a check_run with status='running' already exists for this
 * monitor (duplicate-run guard at the HTTP layer).
 *
 * Fires runMonitorCheck asynchronously (fire-and-forget) and returns 202
 * immediately — does NOT await the long-running browser replay.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { handleRoute, ApiError } from "@/lib/api-error";
import { getRequiredSession } from "@/lib/session";
import { db } from "@/lib/db";
import { checkRun, monitor } from "@/lib/db/schema";
import { runMonitorCheck } from "@/lib/engine/orchestrator";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = handleRoute(
  async (req: NextRequest, ctx: RouteContext) => {
    const { user } = await getRequiredSession(req);
    const { id } = await ctx.params;

    // Ensure the monitor exists and belongs to this user (ownership scope)
    const [mon] = await db
      .select({ id: monitor.id })
      .from(monitor)
      .where(and(eq(monitor.id, id), eq(monitor.userId, user.id)))
      .limit(1);

    if (!mon) {
      throw new ApiError("not_found", "Monitor not found.");
    }

    // Check for an in-progress run before firing a new one
    const [existingRunning] = await db
      .select({ id: checkRun.id })
      .from(checkRun)
      .where(and(eq(checkRun.monitorId, id), eq(checkRun.status, "running")))
      .limit(1);

    if (existingRunning) {
      throw new ApiError(
        "conflict",
        "A check run is already in progress for this monitor.",
      );
    }

    // Fire-and-forget: start the check without awaiting so this response
    // returns before any potential timeout from the browser replay.
    void runMonitorCheck(id);

    return NextResponse.json({ ok: true, monitorId: id }, { status: 202 });
  },
);
