/**
 * Acceptance tests for task-2-2: fetch-based funnel replay engine.
 *
 * Tests are written BEFORE the implementation files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateStepUrl, replayFunnel } from "@/lib/engine/replay";
import type { FunnelStep } from "@/lib/engine/types";

// ---------------------------------------------------------------------------
// validateStepUrl — URL safety validation
// ---------------------------------------------------------------------------

describe("task-2-2: validateStepUrl rejects private IP ranges and non-https", () => {
  it("rejects http scheme for example.com", () => {
    expect(() => validateStepUrl("http://example.com")).toThrow();
  });

  it("rejects 169.254.x (AWS metadata / link-local)", () => {
    expect(() =>
      validateStepUrl("http://169.254.169.254/latest/meta-data/"),
    ).toThrow();
  });

  it("rejects https://169.254.169.254 even with correct scheme", () => {
    expect(() =>
      validateStepUrl("https://169.254.169.254/latest/meta-data/"),
    ).toThrow();
  });

  it("rejects 192.168.x (private class C)", () => {
    expect(() => validateStepUrl("http://192.168.1.1")).toThrow();
  });

  it("rejects https 192.168.x (private class C)", () => {
    expect(() => validateStepUrl("https://192.168.1.1")).toThrow();
  });

  it("rejects 10.x (private class A)", () => {
    expect(() => validateStepUrl("https://10.0.0.1")).toThrow();
    expect(() => validateStepUrl("https://10.255.255.255")).toThrow();
  });

  it("rejects 172.16-31.x (private class B)", () => {
    expect(() => validateStepUrl("https://172.16.0.1")).toThrow();
    expect(() => validateStepUrl("https://172.31.255.255")).toThrow();
  });

  it("does NOT reject 172.15.x or 172.32.x (outside private range)", () => {
    // These are public IPs — should not throw
    expect(() => validateStepUrl("https://172.15.0.1")).not.toThrow();
    expect(() => validateStepUrl("https://172.32.0.1")).not.toThrow();
  });

  it("rejects 127.x (loopback)", () => {
    expect(() => validateStepUrl("https://127.0.0.1")).toThrow();
    expect(() => validateStepUrl("https://127.0.0.2")).toThrow();
  });

  it("rejects ::1 (IPv6 loopback)", () => {
    expect(() => validateStepUrl("https://[::1]")).toThrow();
  });

  it("accepts https://example.com (public domain)", () => {
    expect(() => validateStepUrl("https://example.com")).not.toThrow();
    const url = validateStepUrl("https://example.com");
    expect(url.href).toContain("example.com");
  });

  it("accepts https://api.stripe.com (public domain)", () => {
    expect(() => validateStepUrl("https://api.stripe.com/v1")).not.toThrow();
  });

  it("throws on invalid URL strings", () => {
    expect(() => validateStepUrl("not-a-url")).toThrow();
    expect(() => validateStepUrl("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// replayFunnel — full step replay
// ---------------------------------------------------------------------------

describe("task-2-2: replayFunnel returns StepResult array with typed capturedEvents", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => `
          <!DOCTYPE html>
          <html>
          <head><title>Checkout</title></head>
          <body>
            <script>
              !function(f,b,e,v,n,t,s){/* Meta Pixel base code */}(window,'fbq');
              fbq('init', '123456789');
              fbq('track', 'Purchase', {currency: 'USD', value: 99.00, order_id: 'abc123'});
            </script>
          </body>
          </html>
        `,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects meta_pixel 'Purchase' event from fbq inline script", async () => {
    const steps: FunnelStep[] = [
      {
        url: "https://example.com/checkout",
        label: "Checkout",
        expectedEvents: [],
      },
    ];

    const results = await replayFunnel(steps);

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result.url).toBe("https://example.com/checkout");
    expect(result.statusCode).toBe(200);
    expect(result.capturedEvents.length).toBeGreaterThanOrEqual(1);

    const metaPixelEvents = result.capturedEvents.filter(
      (e) => e.type === "meta_pixel",
    );
    expect(metaPixelEvents.length).toBeGreaterThanOrEqual(1);
    expect(metaPixelEvents[0].eventName).toBe("Purchase");
  });

  it("returns a StepResult with typed capturedEvents array", async () => {
    const steps: FunnelStep[] = [
      {
        url: "https://example.com/checkout",
        expectedEvents: [],
      },
    ];

    const results = await replayFunnel(steps);

    const [result] = results;
    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("statusCode");
    expect(result).toHaveProperty("headers");
    expect(result).toHaveProperty("capturedEvents");
    expect(Array.isArray(result.capturedEvents)).toBe(true);
  });

  it("detects GA4 dataLayer events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => `
          <html><body>
          <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            dataLayer.push({'event': 'purchase', 'value': 99.00});
          </script>
          </body></html>
        `,
      }),
    );

    const results = await replayFunnel([
      { url: "https://example.com/thanks", expectedEvents: [] },
    ]);

    const ga4Events = results[0].capturedEvents.filter((e) => e.type === "ga4");
    expect(ga4Events.length).toBeGreaterThanOrEqual(1);
    const eventNames = ga4Events.map((e) => e.eventName);
    expect(eventNames).toContain("purchase");
  });

  it("handles fetch error gracefully with error field in result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure")),
    );

    const results = await replayFunnel([
      { url: "https://example.com/broken", expectedEvents: [] },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].error).toBeTruthy();
    expect(results[0].statusCode).toBe(0);
    expect(results[0].capturedEvents).toEqual([]);
  });

  it("replayFunnel rejects private-IP steps without fetching", async () => {
    await expect(
      replayFunnel([{ url: "https://192.168.1.1/checkout", expectedEvents: [] }]),
    ).rejects.toThrow();
  });
});
