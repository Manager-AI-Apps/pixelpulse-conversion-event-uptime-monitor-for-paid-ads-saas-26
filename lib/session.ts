import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { ApiError } from "@/lib/api-error";

/**
 * Reads the Better Auth session from the incoming request.
 * Runs on the Node runtime (server-side pages, route handlers) — never in
 * middleware (edge runtime cannot load the Drizzle/pg adapter).
 *
 * @throws {ApiError} with code "unauthorized" when no valid session exists.
 * @returns The authenticated session (includes `session` and `user`).
 */
export async function getRequiredSession(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    throw new ApiError("unauthorized", "Authentication required.");
  }

  return session;
}
