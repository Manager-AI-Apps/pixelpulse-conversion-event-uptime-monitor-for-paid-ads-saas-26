/**
 * lib/engine/replay.ts
 *
 * Fetch-based funnel replay engine for PixelPulse.
 *
 * For each step URL this module:
 *  1. Validates the URL — must be https, must not point to private IP ranges.
 *  2. GETs the URL following redirects and captures the response headers.
 *  3. Parses the HTML response for known tracking beacon patterns:
 *       • GA4:          www.google-analytics.com/g/collect beacons,
 *                       dataLayer.push({'event': ...}) calls,
 *                       gtag('event', ...) calls
 *       • Meta Pixel:   fbq('track', ...) calls,
 *                       www.facebook.com/tr pixel beacon URLs
 *       • Stripe:       api.stripe.com/v1 references,
 *                       Stripe(...) / loadStripe(...) initialisation calls
 *  4. Returns a typed StepResult whose capturedEvents is an array of
 *     CapturedEvent objects.
 */

import type { FunnelStep, StepResult, CapturedEvent } from "./types";

// ---------------------------------------------------------------------------
// Private-range IP regex
// Matches hostnames that are loopback, link-local, or RFC-1918 private.
// Also matches the bare IPv6 loopback "::1".
// ---------------------------------------------------------------------------

const PRIVATE_HOST_REGEX =
  /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|::1|\[::1\])$/;

/**
 * Validate a step URL before any network request.
 *
 * Throws a descriptive Error if:
 *   • The string is not a parseable URL
 *   • The scheme is not `https:`
 *   • The hostname matches a private/loopback/link-local IP range
 *     (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1)
 *
 * Returns the parsed `URL` object on success.
 */
export function validateStepUrl(urlString: string): URL {
  if (!urlString) {
    throw new Error("URL must not be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: "${urlString}"`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `URL must use the https scheme (got "${parsed.protocol}"): ${urlString}`,
    );
  }

  const hostname = parsed.hostname;

  if (PRIVATE_HOST_REGEX.test(hostname)) {
    throw new Error(
      `URL hostname "${hostname}" resolves to a private/loopback IP range and is not permitted`,
    );
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// HTML beacon detection
// ---------------------------------------------------------------------------

/**
 * Detect GA4 events from:
 *   • gtag('event', '<name>', ...)
 *   • dataLayer.push({ 'event': '<name>', ... })
 *   • www.google-analytics.com/g/collect beacon URL presence
 */
function detectGa4Events(html: string): CapturedEvent[] {
  const events: CapturedEvent[] = [];

  // gtag('event', 'eventName', ...)
  const gtagRe = /gtag\s*\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = gtagRe.exec(html)) !== null) {
    events.push({ type: "ga4", eventName: m[1], raw: m[0] });
  }

  // dataLayer.push({ 'event': 'eventName' })
  // Uses a simple look-ahead to capture the event name value.
  const dlRe =
    /dataLayer\s*\.push\s*\(\s*\{[^}]*?['"]event['"]\s*:\s*['"]([^'"]+)['"]/g;
  while ((m = dlRe.exec(html)) !== null) {
    events.push({ type: "ga4", eventName: m[1], raw: m[0] });
  }

  // Beacon URL presence (script src or inline URL reference)
  if (html.includes("www.google-analytics.com/g/collect")) {
    events.push({
      type: "ga4",
      eventName: "beacon",
      raw: "www.google-analytics.com/g/collect",
    });
  }

  return events;
}

/**
 * Detect Meta Pixel events from:
 *   • fbq('track', '<name>', ...)  — inline JS calls
 *   • www.facebook.com/tr beacon URL presence
 */
function detectMetaPixelEvents(html: string): CapturedEvent[] {
  const events: CapturedEvent[] = [];

  // fbq('track', 'eventName', ...) or fbq("track", "eventName", ...)
  const fbqRe = /fbq\s*\(\s*['"]track['"]\s*,\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = fbqRe.exec(html)) !== null) {
    events.push({ type: "meta_pixel", eventName: m[1], raw: m[0] });
  }

  // Pixel beacon URL (noscript img or fetch reference)
  if (html.includes("www.facebook.com/tr")) {
    events.push({
      type: "meta_pixel",
      eventName: "beacon",
      raw: "www.facebook.com/tr",
    });
  }

  return events;
}

/**
 * Detect Stripe activity from:
 *   • api.stripe.com/v1 URL references in the HTML
 *   • new Stripe(...) / loadStripe(...) initialization calls
 */
function detectStripeEvents(html: string): CapturedEvent[] {
  const events: CapturedEvent[] = [];

  if (html.includes("api.stripe.com/v1")) {
    events.push({
      type: "stripe_purchase",
      eventName: "stripe_api_call",
      raw: "api.stripe.com/v1",
    });
  }

  // Stripe JS SDK initialization patterns
  const stripeInitRe = /(?:new\s+Stripe|loadStripe)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = stripeInitRe.exec(html)) !== null) {
    events.push({
      type: "stripe_purchase",
      eventName: "stripe_init",
      raw: m[0],
    });
  }

  return events;
}

/**
 * Parse a raw HTML string and return all detected tracking events.
 */
function detectEvents(html: string): CapturedEvent[] {
  return [
    ...detectGa4Events(html),
    ...detectMetaPixelEvents(html),
    ...detectStripeEvents(html),
  ];
}

// ---------------------------------------------------------------------------
// Main replay entrypoint
// ---------------------------------------------------------------------------

/**
 * Replay a sequence of funnel steps.
 *
 * For each step the function:
 *  1. Validates the URL with validateStepUrl().
 *  2. GETs the URL (following redirects), capturing status + headers.
 *  3. Detects GA4 / Meta Pixel / Stripe patterns in the HTML response.
 *  4. Returns a StepResult for each step (never throws for fetch errors —
 *     those are reported in the StepResult.error field).
 *
 * Throws immediately (before any fetch) if any step URL fails validation.
 */
export async function replayFunnel(steps: FunnelStep[]): Promise<StepResult[]> {
  // Validate all URLs upfront — fail fast, no partial fetches on config errors
  for (const step of steps) {
    validateStepUrl(step.url);
  }

  const results: StepResult[] = [];

  for (const step of steps) {
    try {
      const response = await fetch(step.url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "PixelPulse/1.0 (+https://pixelpulse.app; synthetic-monitor)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      const html = await response.text();

      // Collect response headers into a plain record
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      results.push({
        url: step.url,
        statusCode: response.status,
        headers,
        capturedEvents: detectEvents(html),
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      results.push({
        url: step.url,
        statusCode: 0,
        headers: {},
        capturedEvents: [],
        error: message,
      });
    }
  }

  return results;
}
