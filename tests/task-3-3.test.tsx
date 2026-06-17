/**
 * Acceptance tests for task-3-3: new monitor creation form.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: vi.fn() }),
  usePathname: () => "/monitors/new",
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

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button aria-label="Toggle theme" />,
}));

// Mock AppShell to avoid sidebar/portal complexity in jsdom
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

describe("task-3-3: new monitor creation form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("monitor creation form renders step fields", async () => {
    const { default: NewMonitorPage } = await import(
      "@/app/monitors/new/page"
    );
    render(<NewMonitorPage />);

    // Step 1 field labels must be present
    expect(screen.getByText(/monitor name/i)).toBeTruthy();
    expect(screen.getByText(/slack webhook/i)).toBeTruthy();

    // Add Step button must be present (for adding funnel steps)
    expect(screen.getByRole("button", { name: /add step/i })).toBeTruthy();
  });

  it("form rejects non-hooks.slack.com webhook client-side", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    const { default: NewMonitorPage } = await import(
      "@/app/monitors/new/page"
    );
    render(<NewMonitorPage />);

    // Fill in the monitor name
    const nameInput = screen.getByLabelText(/monitor name/i);
    fireEvent.change(nameInput, { target: { value: "My Monitor" } });

    // Fill in an invalid Slack webhook URL
    const webhookInput = screen.getByLabelText(/slack webhook url/i);
    fireEvent.change(webhookInput, {
      target: { value: "https://evil.com" },
    });

    // Click the submit button
    const submitBtn = screen.getByRole("button", { name: /create monitor/i });
    fireEvent.click(submitBtn);

    // Validation error mentioning hooks.slack.com must appear
    await waitFor(() => {
      expect(screen.getByText(/hooks\.slack\.com/i)).toBeTruthy();
    });

    // Fetch must NOT have been called — validation failed client-side
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
