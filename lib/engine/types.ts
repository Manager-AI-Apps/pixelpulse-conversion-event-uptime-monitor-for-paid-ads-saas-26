import { z } from "zod";

// ---------------------------------------------------------------------------
// Event assertion types
// ---------------------------------------------------------------------------

export const EVENT_TYPES = ["ga4", "meta_pixel", "stripe_purchase"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ExpectedEventSchema = z.object({
  /** The event platform/type to check */
  type: z.enum(EVENT_TYPES),
  /** The event name to assert (e.g. "purchase", "CompleteRegistration") */
  eventName: z.string().min(1),
  /** Optional: expected currency (e.g. "USD") */
  currency: z.string().optional(),
  /** Optional: expected value (e.g. 99.00) */
  value: z.number().optional(),
  /** Optional: dedup key field name to check */
  dedupKey: z.string().optional(),
});

export type ExpectedEvent = z.infer<typeof ExpectedEventSchema>;

// ---------------------------------------------------------------------------
// Funnel step
// ---------------------------------------------------------------------------

export const FunnelStepSchema = z.object({
  /** The full URL to navigate to for this step */
  url: z.string().url(),
  /** Optional human-readable label for this step */
  label: z.string().optional(),
  /** List of events expected to fire on this step */
  expectedEvents: z.array(ExpectedEventSchema).min(0),
  /** Optional: selector to click after landing (for recorded interactions) */
  clickSelector: z.string().optional(),
  /** Optional: form fields to fill — map of CSS selector → value */
  fillFields: z.record(z.string(), z.string()).optional(),
  /** Optional: milliseconds to wait after actions on this step */
  waitMs: z.number().int().min(0).optional(),
});

export type FunnelStep = z.infer<typeof FunnelStepSchema>;

// ---------------------------------------------------------------------------
// Top-level FunnelConfig
// ---------------------------------------------------------------------------

export const FunnelConfigSchema = z.object({
  /** Ordered list of funnel steps to execute */
  steps: z.array(FunnelStepSchema).min(1),
  /** Optional: viewport dimensions for the headless browser */
  viewport: z
    .object({
      width: z.number().int().min(320).default(1280),
      height: z.number().int().min(240).default(800),
    })
    .optional(),
});

export type FunnelConfig = z.infer<typeof FunnelConfigSchema>;
