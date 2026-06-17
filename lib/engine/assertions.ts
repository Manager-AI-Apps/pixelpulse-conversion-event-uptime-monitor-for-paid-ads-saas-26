/**
 * lib/engine/assertions.ts
 *
 * Step assertion engine for PixelPulse.
 *
 * Given a StepResult (captured events from replay) and the expected events for
 * a given funnel step, this module runs typed assertions and returns a
 * structured EventAssertionResult[] indicating what passed, what failed, and
 * an actionable diagnosis code for each failure.
 *
 * Supported assertion types:
 *   • ga4          — checks eventName, currency, value, dedupKey
 *   • meta_pixel   — checks eventName, currency, value
 *   • stripe_purchase — checks event presence only
 *
 * Diagnosis codes:
 *   event_missing      — expected event was not captured at all
 *   duplicate_event    — expected event fired more than once (dedup issue)
 *   value_missing      — a value was expected but not found in captured data
 *   currency_mismatch  — expected currency not matched in captured data
 *   property_mismatch  — a secondary property (e.g. dedupKey) was not matched
 */

import type { StepResult, CapturedEvent, ExpectedEvent } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DiagnosisCode =
  | "event_missing"
  | "value_missing"
  | "currency_mismatch"
  | "duplicate_event"
  | "property_mismatch";

export interface EventAssertionResult {
  /** Whether this assertion passed */
  passed: boolean;
  /** Set when passed is false; describes the category of failure */
  diagnosisCode?: DiagnosisCode;
  /** The expected event specification that was checked */
  expectedEvent: ExpectedEvent;
  /** The captured event that was matched (if any) */
  capturedEvent?: CapturedEvent;
  /** Human-readable failure message for Slack alerts */
  message?: string;
}

// ---------------------------------------------------------------------------
// Raw-string helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a currency code (e.g. "USD") appears in a raw event string.
 * Looks for the currency as a quoted string value in the raw source.
 */
function rawContainsCurrency(raw: string, currency: string): boolean {
  // Match patterns like: currency: 'USD', "currency":"USD", currency:'USD'
  const escaped = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`currency["\\s]*[:\\s]*["']${escaped}["']`, "i").test(raw) ||
    // Also check bare quoted value e.g. 'USD' somewhere after "currency"
    raw.includes(`'${currency}'`) ||
    raw.includes(`"${currency}"`);
}

/**
 * Check whether a numeric value appears in a raw event string.
 * Looks for the value as a JSON-style field.
 */
function rawContainsValue(raw: string, value: number): boolean {
  // Match patterns like: value: 99, value: 99.00, "value":99
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`value["\\s]*[:\\s]*${escaped}(?:[^\\d]|$)`).test(raw);
}

/**
 * Check whether a dedupKey string appears in a raw event string.
 */
function rawContainsDedupKey(raw: string, dedupKey: string): boolean {
  return raw.includes(dedupKey);
}

// ---------------------------------------------------------------------------
// Per-type assertion logic
// ---------------------------------------------------------------------------

/**
 * Assert a GA4 expected event against the captured events for the step.
 * Checks: eventName, currency (in raw), value (in raw), dedupKey (in raw).
 */
function assertGa4Event(
  expected: ExpectedEvent,
  capturedEvents: CapturedEvent[],
): EventAssertionResult {
  const matches = capturedEvents.filter(
    (e) => e.type === "ga4" && e.eventName === expected.eventName,
  );

  if (matches.length === 0) {
    return {
      passed: false,
      diagnosisCode: "event_missing",
      expectedEvent: expected,
      message: `GA4 event "${expected.eventName}" was not captured`,
    };
  }

  if (matches.length > 1) {
    return {
      passed: false,
      diagnosisCode: "duplicate_event",
      expectedEvent: expected,
      capturedEvent: matches[0],
      message: `GA4 event "${expected.eventName}" fired ${matches.length} times (expected once)`,
    };
  }

  const matched = matches[0];
  const raw = matched.raw ?? "";

  // Check value presence — only if expected specifies a value
  if (expected.value !== undefined) {
    if (!rawContainsValue(raw, expected.value)) {
      return {
        passed: false,
        diagnosisCode: "value_missing",
        expectedEvent: expected,
        capturedEvent: matched,
        message: `GA4 event "${expected.eventName}" fired but value ${expected.value} not found`,
      };
    }
  }

  // Check currency — only if expected specifies one
  if (expected.currency !== undefined) {
    if (!rawContainsCurrency(raw, expected.currency)) {
      return {
        passed: false,
        diagnosisCode: "currency_mismatch",
        expectedEvent: expected,
        capturedEvent: matched,
        message: `GA4 event "${expected.eventName}" fired but expected currency "${expected.currency}" not matched`,
      };
    }
  }

  // Check dedupKey — only if expected specifies one
  if (expected.dedupKey !== undefined) {
    if (!rawContainsDedupKey(raw, expected.dedupKey)) {
      return {
        passed: false,
        diagnosisCode: "property_mismatch",
        expectedEvent: expected,
        capturedEvent: matched,
        message: `GA4 event "${expected.eventName}" fired but dedupKey "${expected.dedupKey}" not found`,
      };
    }
  }

  return { passed: true, expectedEvent: expected, capturedEvent: matched };
}

/**
 * Assert a Meta Pixel expected event against the captured events for the step.
 * Checks: eventName, currency (in raw), value (in raw).
 */
function assertMetaPixelEvent(
  expected: ExpectedEvent,
  capturedEvents: CapturedEvent[],
): EventAssertionResult {
  const matches = capturedEvents.filter(
    (e) => e.type === "meta_pixel" && e.eventName === expected.eventName,
  );

  if (matches.length === 0) {
    return {
      passed: false,
      diagnosisCode: "event_missing",
      expectedEvent: expected,
      message: `Meta Pixel event "${expected.eventName}" was not captured`,
    };
  }

  if (matches.length > 1) {
    return {
      passed: false,
      diagnosisCode: "duplicate_event",
      expectedEvent: expected,
      capturedEvent: matches[0],
      message: `Meta Pixel event "${expected.eventName}" fired ${matches.length} times (expected once)`,
    };
  }

  const matched = matches[0];
  const raw = matched.raw ?? "";

  if (expected.value !== undefined) {
    if (!rawContainsValue(raw, expected.value)) {
      return {
        passed: false,
        diagnosisCode: "value_missing",
        expectedEvent: expected,
        capturedEvent: matched,
        message: `Meta Pixel event "${expected.eventName}" fired but value ${expected.value} not found`,
      };
    }
  }

  if (expected.currency !== undefined) {
    if (!rawContainsCurrency(raw, expected.currency)) {
      return {
        passed: false,
        diagnosisCode: "currency_mismatch",
        expectedEvent: expected,
        capturedEvent: matched,
        message: `Meta Pixel event "${expected.eventName}" fired but expected currency "${expected.currency}" not matched`,
      };
    }
  }

  if (expected.dedupKey !== undefined) {
    if (!rawContainsDedupKey(raw, expected.dedupKey)) {
      return {
        passed: false,
        diagnosisCode: "property_mismatch",
        expectedEvent: expected,
        capturedEvent: matched,
        message: `Meta Pixel event "${expected.eventName}" fired but dedupKey "${expected.dedupKey}" not found`,
      };
    }
  }

  return { passed: true, expectedEvent: expected, capturedEvent: matched };
}

/**
 * Assert a Stripe Purchase expected event against the captured events.
 * Only checks event presence — Stripe sends server-side so detailed properties
 * are not available from HTML beacon detection.
 */
function assertStripePurchaseEvent(
  expected: ExpectedEvent,
  capturedEvents: CapturedEvent[],
): EventAssertionResult {
  const matches = capturedEvents.filter(
    (e) => e.type === "stripe_purchase" && e.eventName === expected.eventName,
  );

  if (matches.length === 0) {
    return {
      passed: false,
      diagnosisCode: "event_missing",
      expectedEvent: expected,
      message: `Stripe event "${expected.eventName}" was not captured`,
    };
  }

  return { passed: true, expectedEvent: expected, capturedEvent: matches[0] };
}

// ---------------------------------------------------------------------------
// Exported assertion runner
// ---------------------------------------------------------------------------

/**
 * Run all assertions for a single funnel step.
 *
 * @param stepResult  - The StepResult from the replay engine, containing
 *                      the list of captured tracking events.
 * @param step        - An object containing the expectedEvents for this step.
 *                      Matches the shape of FunnelStep.
 * @returns           An EventAssertionResult for each expectedEvent, preserving
 *                    declaration order.
 */
export function assertStep(
  stepResult: StepResult,
  step: { expectedEvents: ExpectedEvent[] },
): EventAssertionResult[] {
  const { capturedEvents } = stepResult;
  const { expectedEvents } = step;

  return expectedEvents.map((expected) => {
    switch (expected.type) {
      case "ga4":
        return assertGa4Event(expected, capturedEvents);
      case "meta_pixel":
        return assertMetaPixelEvent(expected, capturedEvents);
      case "stripe_purchase":
        return assertStripePurchaseEvent(expected, capturedEvents);
      default: {
        // TypeScript exhaustivity guard — should never reach here at runtime
        const _exhaustive: never = expected.type;
        return {
          passed: false,
          diagnosisCode: "event_missing" as DiagnosisCode,
          expectedEvent: expected,
          message: `Unknown event type: ${String(_exhaustive)}`,
        };
      }
    }
  });
}
