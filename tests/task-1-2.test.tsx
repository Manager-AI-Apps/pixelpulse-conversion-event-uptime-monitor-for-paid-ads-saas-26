/**
 * Acceptance tests for task-1-2: sign-in and sign-up pages.
 *
 * Tests run BEFORE the implementation files are created — confirms correct
 * failure mode first, then green once the pages are written.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock next/navigation (useRouter used in client components)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Mock Better Auth client so we don't hit the network
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn().mockResolvedValue({ error: null }),
      social: vi.fn().mockResolvedValue({}),
    },
    signUp: {
      email: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

describe("task-1-2: sign-up page", () => {
  it("renders Email, Password, Sign up text", async () => {
    const { default: SignUpPage } = await import("@/app/sign-up/page");
    render(<SignUpPage />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    // Button label
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });
});

describe("task-1-2: sign-in page", () => {
  it("renders Email, Password, Sign in text", async () => {
    const { default: SignInPage } = await import("@/app/sign-in/page");
    render(<SignInPage />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    // Button label — use role so we don't cross-match the "Sign up" link
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
