/**
 * Acceptance tests for task-2-3: step assertion engine.
 *
 * Tests are written BEFORE the implementation.
 */
import { describe, it, expect } from "vitest";
import { assertStep } from "@/lib/engine/assertions";
import type { StepResult } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStepResult(
  overrides: Partial<StepResult> = {},
): StepResult {
  return {
    url: "https://example.com/checkout",
    statusCode: 200,
    headers: {},
    capturedEvents: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GA4 assertions
// ---------------------------------------------------------------------------

describe("task-2-3: assertStep — GA4", () => {
  it("returns event_missing when GA4 event not captured", () => {
    const result = assertStep(makeStepResult({ capturedEvents: [] }), {
      expectedEvents: [{ type: "ga4", eventName: "purchase" }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("event_missing");
  });

  it("returns passed:true when all GA4 events match by name", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [{ type: "ga4", eventName: "purchase" }],
      }),
      {
        expectedEvents: [{ type: "ga4", eventName: "purchase" }],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(true);
    expect(result[0].diagnosisCode).toBeUndefined();
  });

  it("returns duplicate_event when GA4 event fires more than once", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [
          { type: "ga4", eventName: "purchase" },
          { type: "ga4", eventName: "purchase" },
        ],
      }),
      {
        expectedEvents: [{ type: "ga4", eventName: "purchase" }],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("duplicate_event");
  });

  it("returns property_mismatch when dedupKey not found in raw", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [
          {
            type: "ga4",
            eventName: "purchase",
            raw: "gtag('event', 'purchase', {})",
          },
        ],
      }),
      {
        expectedEvents: [
          {
            type: "ga4",
            eventName: "purchase",
            dedupKey: "order_id_xyz_expected",
          },
        ],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("property_mismatch");
  });

  it("returns value_missing when expected value not found in raw", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [
          {
            type: "ga4",
            eventName: "purchase",
            raw: "gtag('event','purchase',{})",
          },
        ],
      }),
      {
        expectedEvents: [{ type: "ga4", eventName: "purchase", value: 99.0 }],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("value_missing");
  });

  it("returns currency_mismatch when expected currency not found in raw", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [
          {
            type: "ga4",
            eventName: "purchase",
            raw: "gtag('event','purchase',{currency:'EUR'})",
          },
        ],
      }),
      {
        expectedEvents: [
          { type: "ga4", eventName: "purchase", currency: "USD" },
        ],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("currency_mismatch");
  });
});

// ---------------------------------------------------------------------------
// Meta Pixel assertions
// ---------------------------------------------------------------------------

describe("task-2-3: assertStep — Meta Pixel", () => {
  it("returns event_missing when meta_pixel event not captured", () => {
    const result = assertStep(makeStepResult({ capturedEvents: [] }), {
      expectedEvents: [{ type: "meta_pixel", eventName: "Purchase" }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("event_missing");
  });

  it("returns passed:true when all meta_pixel events match", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [{ type: "meta_pixel", eventName: "Purchase" }],
      }),
      {
        expectedEvents: [{ type: "meta_pixel", eventName: "Purchase" }],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(true);
    expect(result[0].diagnosisCode).toBeUndefined();
  });

  it("returns duplicate_event when meta_pixel event fires more than once", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [
          { type: "meta_pixel", eventName: "Purchase" },
          { type: "meta_pixel", eventName: "Purchase" },
        ],
      }),
      {
        expectedEvents: [{ type: "meta_pixel", eventName: "Purchase" }],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("duplicate_event");
  });
});

// ---------------------------------------------------------------------------
// Stripe assertions
// ---------------------------------------------------------------------------

describe("task-2-3: assertStep — Stripe", () => {
  it("returns event_missing when no stripe_purchase event is captured", () => {
    const result = assertStep(makeStepResult({ capturedEvents: [] }), {
      expectedEvents: [{ type: "stripe_purchase", eventName: "stripe_init" }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].diagnosisCode).toBe("event_missing");
  });

  it("returns passed:true when stripe_purchase event is present", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [
          { type: "stripe_purchase", eventName: "stripe_init" },
        ],
      }),
      {
        expectedEvents: [
          { type: "stripe_purchase", eventName: "stripe_init" },
        ],
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-event step
// ---------------------------------------------------------------------------

describe("task-2-3: assertStep — multiple expectedEvents", () => {
  it("returns passed:true for all when all events match", () => {
    const result = assertStep(
      makeStepResult({
        capturedEvents: [
          { type: "ga4", eventName: "purchase" },
          { type: "meta_pixel", eventName: "Purchase" },
        ],
      }),
      {
        expectedEvents: [
          { type: "ga4", eventName: "purchase" },
          { type: "meta_pixel", eventName: "Purchase" },
        ],
      },
    );

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.passed)).toBe(true);
  });

  it("returns empty array when expectedEvents is empty", () => {
    const result = assertStep(makeStepResult(), { expectedEvents: [] });
    expect(result).toHaveLength(0);
  });
});
