import { z } from "zod";

/** Allowed event types that PixelPulse can assert against. */
const EventTypeSchema = z.enum(["ga4", "meta_pixel", "stripe_purchase"]);

/**
 * A single event assertion within a funnel step.
 * Checks that the expected tracking event fires with the correct payload.
 */
const EventAssertionSchema = z.object({
  /** Which tracking system to check */
  eventType: EventTypeSchema,
  /** The event name expected to fire (e.g. "purchase", "PageView") */
  eventName: z.string().min(1, "eventName must not be empty"),
  /** Optional ISO 4217 currency code expected in the event payload */
  currency: z.string().optional(),
  /** Optional numeric value expected in the event payload */
  value: z.number().optional(),
});

/**
 * A single step in the recorded user funnel.
 * Each step has a URL to navigate to and a set of event assertions to verify.
 */
const FunnelStepSchema = z.object({
  /** Absolute URL of the page to navigate to */
  url: z.string().url("url must be a valid URL"),
  /** Human-readable label for this funnel step */
  label: z.string().min(1, "label must not be empty"),
  /** One or more event assertions to verify on this step */
  assertions: z
    .array(EventAssertionSchema)
    .min(1, "each step must have at least one assertion"),
});

/**
 * The full funnel configuration describing the recorded click path
 * and the event assertions to verify at each step.
 */
export const FunnelConfigSchema = z.object({
  steps: z
    .array(FunnelStepSchema)
    .min(1, "funnelConfig must have at least one step"),
});

export type FunnelConfig = z.infer<typeof FunnelConfigSchema>;

/**
 * Schema for creating a new monitor. Validates:
 * - `name`: required non-empty string
 * - `funnelConfig`: valid funnel config with at least one step
 * - `slackWebhookUrl`: optional; if present, must start with https://hooks.slack.com/
 */
export const MonitorCreateSchema = z.object({
  name: z.string().min(1, "name must not be empty"),
  funnelConfig: FunnelConfigSchema,
  slackWebhookUrl: z
    .string()
    .regex(
      /^https:\/\/hooks\.slack\.com\//,
      "slackWebhookUrl must start with https://hooks.slack.com/",
    )
    .optional(),
});

export type MonitorCreateInput = z.infer<typeof MonitorCreateSchema>;
