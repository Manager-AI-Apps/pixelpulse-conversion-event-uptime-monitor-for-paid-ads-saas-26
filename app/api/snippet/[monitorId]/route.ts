import { NextRequest } from "next/server";

import { handleRoute, ApiError } from "@/lib/api-error";

type RouteContext = { params: Promise<{ monitorId: string }> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/snippet/[monitorId]
 *
 * Returns a small JavaScript snippet (Content-Type: application/javascript)
 * that engineers paste into their site via a <script src="..."> tag.
 *
 * The snippet only exposes:
 *   - the monitorId (UUID)
 *   - the PixelPulse beacon endpoint URL
 *
 * It deliberately does NOT expose funnelConfig, slackWebhookUrl, or any
 * other monitor configuration.
 *
 * No authentication required — the ID itself is the access credential for
 * this public endpoint (read-only, no sensitive data).
 */
export const GET = handleRoute(
  async (_req: NextRequest, ctx: RouteContext) => {
    const { monitorId } = await ctx.params;

    if (!UUID_REGEX.test(monitorId)) {
      throw new ApiError("bad_request", "Invalid monitor ID — must be a UUID.");
    }

    const beaconBase = "https://app.pixelpulse.io";
    const beaconEndpoint = `${beaconBase}/api/beacon`;

    // The snippet is intentionally minimal: only the monitorId and the beacon
    // URL are referenced. No config, secrets, or internal API responses leak.
    const snippet = `/* PixelPulse — Conversion Event Uptime Monitor */
(function (pid, endpoint) {
  "use strict";
  if (typeof window === "undefined") { return; }
  window.__PIXELPULSE__ = window.__PIXELPULSE__ || {};
  window.__PIXELPULSE__.monitorId = pid;
  var s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = endpoint + "?pid=" + encodeURIComponent(pid) +
    "&t=" + Date.now() + "&url=" + encodeURIComponent(location.href);
  document.head.appendChild(s);
}("${monitorId}", "${beaconEndpoint}"));
`;

    return new Response(snippet, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
