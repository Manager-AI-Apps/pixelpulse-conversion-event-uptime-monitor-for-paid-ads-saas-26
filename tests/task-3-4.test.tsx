/**
 * Acceptance tests for task-3-4: monitor detail page.
 *
 * - Integration test: getMonitorDetail returns per-event uptime breakdown
 * - Unit test: monitor detail page renders diagnosis copy
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createTestDb } from "@/tests/helpers/test-db";
import { user, monitor, checkRun, eventAssertionResult } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest before any imports)
// ---------------------------------------------------------------------------

// Provide a simple mock for the monitor-detail module.
// The integration test bypasses it via vi.importActual.
// The unit test uses vi.mocked(getMonitorDetail).mockResolvedValueOnce(...).
vi.mock("@/lib/queries/monitor-detail", () => ({
  getMonitorDetail: vi.fn(),
  DIAGNOSIS_COPY: {
    event_missing: "Event not firing",
    value_missing: "Purchase fired without value",
    currency_mismatch: "Currency mismatch",
    duplicate_event: "Duplicate event via gtag + GTM",
    property_mismatch: "GA4 property mismatch",
  },
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    children,
    header,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
  }) => (
    <div data-testid="app-shell">
      {header}
      {children}
    </div>
  ),
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button aria-label="Toggle theme" />,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/monitors/mock-id",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockReturnValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: "user-1", name: "Alice", email: "alice@test.com" },
        session: { id: "sess-1" },
      }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import the mocked top-level export (used by unit test)
// ---------------------------------------------------------------------------

import { getMonitorDetail } from "@/lib/queries/monitor-detail";

// ---------------------------------------------------------------------------
// Integration tests: exercises the REAL getMonitorDetail function
// ---------------------------------------------------------------------------

let testDb: Awaited<ReturnType<typeof createTestDb>>;

describe("task-3-4: getMonitorDetail per-event uptime", () => {
  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await testDb?.close();
    vi.clearAllMocks();
  });

  it("returns correct passed% per eventType", async () => {
    // Use the REAL implementation, bypassing the vi.mock above
    const { getMonitorDetail: realGetMonitorDetail } =
      await vi.importActual<typeof import("@/lib/queries/monitor-detail")>(
        "@/lib/queries/monitor-detail",
      );

    // Insert user
    await testDb.db.insert(user).values([
      { id: "user-1", name: "Alice", email: "alice@test.com" },
    ]);

    // Insert a monitor
    const [mon] = await testDb.db
      .insert(monitor)
      .values({
        userId: "user-1",
        name: "Checkout Funnel",
        funnelConfig: { steps: [] },
      })
      .returning();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Insert 4 check_runs
    const runs = await testDb.db
      .insert(checkRun)
      .values([
        { monitorId: mon.id, status: "passed", startedAt: oneDayAgo },
        { monitorId: mon.id, status: "passed", startedAt: oneDayAgo },
        { monitorId: mon.id, status: "failed", startedAt: oneDayAgo },
        { monitorId: mon.id, status: "failed", startedAt: oneDayAgo },
      ])
      .returning();

    // Insert event_assertion_results:
    // ga4:        2 passed / 4 total → 50%
    // meta_pixel: 3 passed / 4 total → 75%
    await testDb.db.insert(eventAssertionResult).values([
      // run 0: both pass
      {
        checkRunId: runs[0].id,
        stepIndex: 0,
        eventType: "ga4",
        passed: true,
      },
      {
        checkRunId: runs[0].id,
        stepIndex: 0,
        eventType: "meta_pixel",
        passed: true,
      },
      // run 1: both pass
      {
        checkRunId: runs[1].id,
        stepIndex: 0,
        eventType: "ga4",
        passed: true,
      },
      {
        checkRunId: runs[1].id,
        stepIndex: 0,
        eventType: "meta_pixel",
        passed: true,
      },
      // run 2: ga4 fails, meta_pixel passes
      {
        checkRunId: runs[2].id,
        stepIndex: 0,
        eventType: "ga4",
        passed: false,
      },
      {
        checkRunId: runs[2].id,
        stepIndex: 0,
        eventType: "meta_pixel",
        passed: true,
      },
      // run 3: both fail
      {
        checkRunId: runs[3].id,
        stepIndex: 0,
        eventType: "ga4",
        passed: false,
      },
      {
        checkRunId: runs[3].id,
        stepIndex: 0,
        eventType: "meta_pixel",
        passed: false,
      },
    ]);

    const detail = await realGetMonitorDetail(mon.id, testDb.db);

    const ga4 = detail.eventUptimes.find((e) => e.eventType === "ga4");
    const meta = detail.eventUptimes.find((e) => e.eventType === "meta_pixel");

    expect(ga4).toBeDefined();
    expect(meta).toBeDefined();
    expect(ga4?.passedPct).toBe(50);
    expect(meta?.passedPct).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Unit test: page rendering with mocked data
// ---------------------------------------------------------------------------

describe("task-3-4: monitor detail page renders diagnosis copy", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Purchase fired without value' for value_missing diagnosis", async () => {
    const mockDetail = {
      monitor: {
        id: "mock-monitor-id",
        userId: "user-1",
        name: "Test Monitor",
        isActive: true,
        slackWebhookUrl: null,
      },
      recentRuns: [
        {
          id: "run-1",
          status: "failed" as const,
          startedAt: new Date("2024-01-01T00:00:00Z"),
          diagnosisCodes: ["value_missing"],
        },
      ],
      eventUptimes: [
        {
          eventType: "ga4" as const,
          passedPct: 85,
          totalRuns: 20,
          passedRuns: 17,
        },
      ],
      lastFailureDiagnosisCodes: ["value_missing"],
    };

    // Override getMonitorDetail for this one test
    vi.mocked(getMonitorDetail).mockResolvedValueOnce(mockDetail);

    const { default: MonitorDetailPage } = await import(
      "@/app/monitors/[id]/page"
    );

    const element = await MonitorDetailPage({
      params: Promise.resolve({ id: "mock-monitor-id" }),
    });
    render(element);

    expect(screen.getAllByText(/purchase fired without value/i).length).toBeGreaterThan(0);
  });
});
