/**
 * Acceptance tests for task-3-1: landing page with PixelPulse branding.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/link to avoid router context requirements
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// Mock ThemeToggle since it may rely on context
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button aria-label="Toggle theme" />,
}));

// Mock HeroMesh (canvas/webgl not available in jsdom)
vi.mock("@/components/ui/hero-mesh", () => ({
  HeroMesh: () => <div data-testid="hero-mesh" />,
}));

describe("task-3-1: landing page", () => {
  it("renders product name PixelPulse and Sign up CTA", async () => {
    const { default: LandingPage } = await import("@/app/page");
    render(<LandingPage />);

    // Product name must appear
    expect(screen.getAllByText(/PixelPulse/i).length).toBeGreaterThan(0);

    // Sign up CTA must be present
    expect(
      screen.getAllByRole("link", { name: /sign up/i }).length
    ).toBeGreaterThan(0);
  });
});
