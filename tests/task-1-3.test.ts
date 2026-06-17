import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { MonitorCreateSchema } from "@/lib/validators/monitor";

const validFunnelConfig = {
  steps: [
    {
      url: "https://example.com/checkout",
      label: "Checkout Page",
      assertions: [
        {
          eventType: "ga4" as const,
          eventName: "purchase",
          currency: "USD",
          value: 99.99,
        },
      ],
    },
  ],
};

const validMonitor = {
  name: "My Checkout Funnel",
  funnelConfig: validFunnelConfig,
};

describe("MonitorCreateSchema", () => {
  it("accepts a valid monitor without slackWebhookUrl", () => {
    const result = MonitorCreateSchema.parse(validMonitor);
    expect(result.name).toBe("My Checkout Funnel");
    expect(result.slackWebhookUrl).toBeUndefined();
  });

  it("accepts valid hooks.slack.com URL", () => {
    const result = MonitorCreateSchema.parse({
      ...validMonitor,
      slackWebhookUrl: "https://hooks.slack.com/services/T/B/x",
    });
    expect(result.slackWebhookUrl).toBe(
      "https://hooks.slack.com/services/T/B/x",
    );
  });

  it("rejects non-hooks.slack.com webhook URL", () => {
    expect(() =>
      MonitorCreateSchema.parse({
        ...validMonitor,
        slackWebhookUrl: "https://evil.com/hook",
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing name", () => {
    const { name: _name, ...rest } = validMonitor;
    expect(() => MonitorCreateSchema.parse(rest)).toThrow(ZodError);
  });

  it("rejects empty funnelConfig steps", () => {
    expect(() =>
      MonitorCreateSchema.parse({
        ...validMonitor,
        funnelConfig: { steps: [] },
      }),
    ).toThrow(ZodError);
  });
});
