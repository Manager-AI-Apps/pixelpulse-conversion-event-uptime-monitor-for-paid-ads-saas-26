/**
 * Acceptance tests for task-2-5:
 *   - lib/slack/alert.ts: sendSlackAlert()
 *
 * Tests are written BEFORE the implementation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { sendSlackAlert } from "@/lib/slack/alert";

// ---------------------------------------------------------------------------
// Unit test: URL validation
// ---------------------------------------------------------------------------

describe("task-2-5: sendSlackAlert URL validation", () => {
  it("throws if webhookUrl is not hooks.slack.com", async () => {
    await expect(
      sendSlackAlert("https://evil.com/hook", "test", ["event_missing"]),
    ).rejects.toThrow();
  });

  it("throws if webhookUrl has wrong subdomain", async () => {
    await expect(
      sendSlackAlert(
        "https://hooks.slack.com.evil.com/services/T/B/x",
        "test",
        ["event_missing"],
      ),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Unit test: Block Kit message content
// ---------------------------------------------------------------------------

describe("task-2-5: sendSlackAlert Block Kit message", () => {
  const VALID_WEBHOOK = "https://hooks.slack.com/services/T/B/x";

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "ok",
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts Block Kit message with diagnosis copy for value_missing", async () => {
    await sendSlackAlert(VALID_WEBHOOK, "MyMonitor", ["value_missing"]);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(VALID_WEBHOOK);
    expect(init?.method).toBe("POST");

    const body = JSON.parse(init?.body as string);
    // Verify it's a Block Kit message with blocks array
    expect(Array.isArray(body.blocks)).toBe(true);
    // The body string should contain the diagnosis copy
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toContain("Purchase fired without value");
    expect(bodyStr).toContain("MyMonitor");
  });

  it("posts Block Kit message with all diagnosis codes", async () => {
    await sendSlackAlert(VALID_WEBHOOK, "AllCodesMonitor", [
      "event_missing",
      "value_missing",
      "currency_mismatch",
      "duplicate_event",
      "property_mismatch",
    ]);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [, init] = fetchMock.mock.calls[0];
    const bodyStr = init?.body as string;

    expect(bodyStr).toContain("Event not firing");
    expect(bodyStr).toContain("Purchase fired without value");
    expect(bodyStr).toContain("Currency mismatch");
    expect(bodyStr).toContain("Duplicate event via gtag + GTM");
    expect(bodyStr).toContain("GA4 property mismatch");
  });

  it("retries on 5xx response and succeeds on second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "ok",
      });
    vi.stubGlobal("fetch", fetchMock);

    // Should not throw — it retried and succeeded
    await expect(
      sendSlackAlert(VALID_WEBHOOK, "RetryMonitor", ["event_missing"]),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries on persistent 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    vi.stubGlobal("fetch", fetchMock);

    // Max 2 retries: total 3 attempts (1 initial + 2 retries)
    await expect(
      sendSlackAlert(VALID_WEBHOOK, "FailMonitor", ["event_missing"]),
    ).rejects.toThrow();

    // 1 initial + 2 retries = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
