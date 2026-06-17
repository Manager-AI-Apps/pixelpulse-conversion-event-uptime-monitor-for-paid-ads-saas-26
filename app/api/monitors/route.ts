import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { handleRoute, ApiError } from "@/lib/api-error";
import { getRequiredSession } from "@/lib/session";
import { db } from "@/lib/db";
import { monitor } from "@/lib/db/schema";
import { MonitorCreateSchema } from "@/lib/validators/monitor";

/**
 * GET /api/monitors
 * Returns all monitors owned by the authenticated user.
 */
export const GET = handleRoute(async (req: NextRequest) => {
  const { user } = await getRequiredSession(req);

  const monitors = await db
    .select()
    .from(monitor)
    .where(eq(monitor.userId, user.id));

  return NextResponse.json(monitors);
});

/**
 * POST /api/monitors
 * Creates a new monitor for the authenticated user.
 * Validates input with MonitorCreateSchema (includes FunnelConfigSchema).
 * Returns 201 with the created monitor.
 */
export const POST = handleRoute(async (req: NextRequest) => {
  const { user } = await getRequiredSession(req);

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

  const [created] = await db
    .insert(monitor)
    .values({
      userId: user.id,
      name,
      funnelConfig,
      slackWebhookUrl: slackWebhookUrl ?? null,
      isActive: true,
    })
    .returning();

  if (!created) {
    throw new ApiError("internal", "Failed to create monitor.");
  }

  return NextResponse.json(created, { status: 201 });
});
