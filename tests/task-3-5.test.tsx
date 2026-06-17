/**
 * Acceptance tests for task-3-5:
 *   - GET /api/snippet/[monitorId] returns JS snippet (no sensitive data)
 *   - app/monitors/[id]/snippet/page.tsx renders install instructions
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/snippet/[monitorId]/route";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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
  usePathname: () => "/monitors/mock-id/snippet",
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
// Shared test constant
// ---------------------------------------------------------------------------

const MONITOR_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Task-3-5 acceptance test 1:
//   snippet endpoint returns JS with monitorId but not funnelConfig or
//   slackWebhookUrl or hooks.slack.com
// ---------------------------------------------------------------------------

describe("task-3-5: snippet endpoint content safety", () => {
  it("returns application/javascript Content-Type", async () => {
    const req = new NextRequest(
      `http://localhost/api/snippet/${MONITOR_ID}`,
      { method: "GET" },
    );

    const res = await GET(req, {
      params: Promise.resolve({ monitorId: MONITOR_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/javascript");
  });

  it("response body contains monitorId but not funnelConfig or slackWebhookUrl or hooks.slack.com", async () => {
    const req = new NextRequest(
      `http://localhost/api/snippet/${MONITOR_ID}`,
      { method: "GET" },
    );

    const res = await GET(req, {
      params: Promise.resolve({ monitorId: MONITOR_ID }),
    });

    const body = await res.text();

    // Must contain the monitorId
    expect(body).toContain(MONITOR_ID);

    // Must NOT expose sensitive config fields
    expect(body).not.toContain("funnelConfig");
    expect(body).not.toContain("slackWebhookUrl");
    expect(body).not.toContain("hooks.slack.com");
  });

  it("returns 400 for invalid (non-UUID) monitorId", async () => {
    const req = new NextRequest(
      "http://localhost/api/snippet/not-a-uuid",
      { method: "GET" },
    );

    const res = await GET(req, {
      params: Promise.resolve({ monitorId: "not-a-uuid" }),
    });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Task-3-5 acceptance test 2:
//   snippet page renders install instructions (script src + monitor ID)
// ---------------------------------------------------------------------------

describe("task-3-5: snippet page renders install instructions", () => {
  it("shows script src and monitor ID", async () => {
    const { default: SnippetPage } = await import(
      "@/app/monitors/[id]/snippet/page"
    );

    const element = await SnippetPage({
      params: Promise.resolve({ id: MONITOR_ID }),
    });

    render(element);

    // The page must contain a script src reference
    const html = document.body.innerHTML;
    expect(html.toLowerCase()).toContain("script");
    expect(html).toContain(MONITOR_ID);
  });
});
