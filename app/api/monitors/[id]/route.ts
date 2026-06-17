import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { handleRoute, ApiError } from "@/lib/api-error";
import { getRequiredSession } from "@/lib/session";
import { db } from "@/lib/db";
import { monitor } from "@/lib/db/schema";
import { MonitorCreateSchema } from "@/lib/validators/monitor";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/monitors/[id]
 * Returns a single monitor owned by the authenticated user.
 * Returns 404 if the monitor does not exist or belongs to a different user.
 */
export const GET = handleRoute(
  async (req: NextRequest, ctx: RouteContext) => {
    const { user } = await getRequiredSession(req);
    const { id } = await ctx.params;

    const [row] = await db
      .select()
      .from(monitor)
      .where(and(eq(monitor.id, id), eq(monitor.userId, user.id)));

    if (!row) {
      throw new ApiError("not_found", "Monitor not found.");
    }

    return NextResponse.json(row);
  },
);

/**
 * PUT /api/monitors/[id]
 * Updates a monitor owned by the authenticated user.
 * Validates input with MonitorCreateSchema (includes FunnelConfigSchema).
 * Returns 404 if the monitor does not exist or belongs to a different user.
 */
export const PUT = handleRoute(
  async (req: NextRequest, ctx: RouteContext) => {
    const { user } = await getRequiredSession(req);
    const { id } = await ctx.params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError("bad_request", "Request body must be valid JSON.");
    }

    const parsed = MonitorCreateSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      throw new ApiError(
        "bad_request",
        firstIssue?.message ?? "Invalid request body.",
      );
    }

    const { name, funnelConfig, slackWebhookUrl } = parsed.data;

    const [updated] = await db
      .update(monitor)
      .set({
        name,
        funnelConfig,
        slackWebhookUrl: slackWebhookUrl ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(monitor.id, id), eq(monitor.userId, user.id)))
      .returning();

    if (!updated) {
      throw new ApiError("not_found", "Monitor not found.");
    }

    return NextResponse.json(updated);
  },
);

/**
 * DELETE /api/monitors/[id]
 * Deletes a monitor owned by the authenticated user.
 * Returns 404 if the monitor does not exist or belongs to a different user.
 * Returns 204 No Content on success.
 */
export const DELETE = handleRoute(
  async (req: NextRequest, ctx: RouteContext) => {
    const { user } = await getRequiredSession(req);
    const { id } = await ctx.params;

    const [deleted] = await db
      .delete(monitor)
      .where(and(eq(monitor.id, id), eq(monitor.userId, user.id)))
      .returning();

    if (!deleted) {
      throw new ApiError("not_found", "Monitor not found.");
    }

    return new NextResponse(null, { status: 204 });
  },
);
