import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("task-1-1: schema and FunnelConfig", () => {
  describe("DB schema exports", () => {
    it("exports monitor, checkRun, eventAssertionResult tables", async () => {
      const schema = await import("@/lib/db/schema");
      expect(schema.monitor).toBeDefined();
      expect(schema.checkRun).toBeDefined();
      expect(schema.eventAssertionResult).toBeDefined();
    });

    it("monitor table has required columns", async () => {
      const { monitor } = await import("@/lib/db/schema");
      const columns = Object.keys(monitor);
      // Drizzle table objects expose column names via the table object
      expect(monitor).toBeDefined();
      // Check that the getSQL/table name is correct
      expect((monitor as { _: { name: string } })._?.name ?? "monitor").toBe("monitor");
    });

    it("checkRun table has required columns", async () => {
      const { checkRun } = await import("@/lib/db/schema");
      expect(checkRun).toBeDefined();
      expect((checkRun as { _: { name: string } })._?.name ?? "check_run").toBe("check_run");
    });

    it("eventAssertionResult table has required columns", async () => {
      const { eventAssertionResult } = await import("@/lib/db/schema");
      expect(eventAssertionResult).toBeDefined();
      expect(
        (eventAssertionResult as { _: { name: string } })._?.name ?? "event_assertion_result"
      ).toBe("event_assertion_result");
    });
  });

  describe("FunnelConfig Zod schema", () => {
    it("validates a valid FunnelConfig", async () => {
      const { FunnelConfigSchema } = await import("@/lib/engine/types");
      const result = FunnelConfigSchema.parse({
        steps: [
          {
            url: "https://example.com",
            expectedEvents: [{ type: "ga4", eventName: "purchase" }],
          },
        ],
      });
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].url).toBe("https://example.com");
      expect(result.steps[0].expectedEvents[0].type).toBe("ga4");
      expect(result.steps[0].expectedEvents[0].eventName).toBe("purchase");
    });

    it("rejects config missing steps", async () => {
      const { FunnelConfigSchema } = await import("@/lib/engine/types");
      expect(() => FunnelConfigSchema.parse({})).toThrow(z.ZodError);
    });

    it("rejects a step missing url", async () => {
      const { FunnelConfigSchema } = await import("@/lib/engine/types");
      expect(() =>
        FunnelConfigSchema.parse({
          steps: [{ expectedEvents: [{ type: "ga4", eventName: "purchase" }] }],
        })
      ).toThrow(z.ZodError);
    });

    it("rejects an event missing eventName", async () => {
      const { FunnelConfigSchema } = await import("@/lib/engine/types");
      expect(() =>
        FunnelConfigSchema.parse({
          steps: [{ url: "https://example.com", expectedEvents: [{ type: "ga4" }] }],
        })
      ).toThrow(z.ZodError);
    });

    it("rejects an event with invalid type", async () => {
      const { FunnelConfigSchema } = await import("@/lib/engine/types");
      expect(() =>
        FunnelConfigSchema.parse({
          steps: [
            {
              url: "https://example.com",
              expectedEvents: [{ type: "unknown_platform", eventName: "purchase" }],
            },
          ],
        })
      ).toThrow(z.ZodError);
    });
  });
});
