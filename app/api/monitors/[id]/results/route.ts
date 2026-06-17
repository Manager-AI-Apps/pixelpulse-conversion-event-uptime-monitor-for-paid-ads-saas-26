/**
 * GET /api/monitors/[id]/results
 *
 * Returns the last 10 check_runs for the specified monitor, each enriched
 * with its event_assertion_result rows.
 *
 * Scoped to the authenticated user — returns 404 if the monitor belongs to
 * a different user or does not exist.
 *
 * Response shape:
 *   Array<CheckRun & { assertions: EventAssertionResult[] }>
 *   Ordered by startedAt DESC (most-recent first), limit 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { handleRoute, ApiError } from "@/lib/api-error";
import { getRequiredSession } from "@/lib/session";
import { db } from "@/lib/db";
import { checkRun, eventAssertionResult, monitor } from "@/lib/db/schema";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = handleRoute(
  async (req: NextRequest, ctx: RouteContext) => {
    const { user } = await getRequiredSession(req);
    const { id } = await ctx.params;

    // Enforce ownership scope
    const [mon] = await db
      .select({ id: monitor.id })
      .from(monitor)
      .where(and(eq(monitor.id, id), eq(monitor.userId, user.id)))
      .limit(1);

    if (!mon) {
      throw new ApiError("not_found", "Monitor not found.");
    }

    // Fetch the last 10 check_runs ordered by most recent first
    const runs = await db
      .select()
      .from(checkRun)
      .where(eq(checkRun.monitorId, id))
      .orderBy(desc(checkRun.startedAt))
      .limit(10);

    if (runs.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch assertion results for all runs in parallel
    const assertionsPerRun = await Promise.all(
      runs.map((run) =>
        db
          .select()
          .from(eventAssertionResult)
          .where(eq(eventAssertionResult.checkRunId, run.id)),
      ),
    );

    const result = runs.map((run, i) => ({
      ...run,
      assertions: assertionsPerRun[i] ?? [],
    }));

    return NextResponse.json(result);
  },
);
