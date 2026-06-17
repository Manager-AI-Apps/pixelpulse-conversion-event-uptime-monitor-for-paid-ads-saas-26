/**
 * Acceptance tests for task-2-1: CRUD API routes for monitors.
 *
 * Integration tests that exercise real DB (pglite) with mocked session auth.
 * Tests are written BEFORE the route implementations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { monitor, user } from "@/lib/db/schema";
import * as dbModule from "@/lib/db";
import { getRequiredSession } from "@/lib/session";
import { POST } from "@/app/api/monitors/route";
import { GET as GET_BY_ID } from "@/app/api/monitors/[id]/route";

// ---- Module mocks (hoisted above imports by Vitest) ----

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/session", () => ({ getRequiredSession: vi.fn() }));

// ---- Test state ----

let testDb: Awaited<ReturnType<typeof createTestDb>>;

const USER_1 = { id: "test-user-1", name: "Alice", email: "alice@test.com" };
const USER_2 = { id: "test-user-2", name: "Bob", email: "bob@test.com" };

const VALID_BODY = {
  name: "Checkout Funnel",
  funnelConfig: {
    steps: [
      {
        url: "https://example.com/checkout",
        label: "Checkout",
        assertions: [{ eventType: "ga4", eventName: "purchase" }],
      },
    ],
  },
};

// ---- Helpers ----

function mockUserSession(u: { id: string; name: string; email: string }) {
  vi.mocked(getRequiredSession).mockResolvedValue({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: `sess-${u.id}`,
      userId: u.id,
      token: `tok-${u.id}`,
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as any);
}

// ---- Setup / Teardown ----

beforeEach(async () => {
  testDb = await createTestDb();
  // Point the mock module at the test DB so route handlers use it
  (dbModule as any).db = testDb.db;

  await testDb.db.insert(user).values([
    { id: USER_1.id, name: USER_1.name, email: USER_1.email },
    { id: USER_2.id, name: USER_2.name, email: USER_2.email },
  ]);
});

afterEach(async () => {
  await testDb?.close();
  vi.clearAllMocks();
});

// ---- Acceptance tests ----

describe("task-2-1: CRUD API routes for monitors", () => {
  it("POST /api/monitors persists monitor scoped to user; different user gets 404", async () => {
    mockUserSession(USER_1);

    const req = new NextRequest("http://localhost/api/monitors", {
      method: "POST",
      body: JSON.stringify(VALID_BODY),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = (await res.json()) as {
      id: string;
      userId: string;
      name: string;
    };
    expect(json.id).toBeTruthy();
    expect(json.userId).toBe(USER_1.id);
    expect(json.name).toBe("Checkout Funnel");

    // Verify row in DB with correct userId
    const rows = await testDb.db
      .select()
      .from(monitor)
      .where(eq(monitor.userId, USER_1.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Checkout Funnel");

    // A different user cannot GET this monitor — expects 404
    mockUserSession(USER_2);
    const getReq = new NextRequest(
      `http://localhost/api/monitors/${json.id}`,
      { method: "GET" },
    );
    const getRes = await GET_BY_ID(getReq, {
      params: Promise.resolve({ id: json.id }),
    });
    expect(getRes.status).toBe(404);
  });

  it("POST /api/monitors rejects invalid slackWebhookUrl (non-hooks.slack.com)", async () => {
    mockUserSession(USER_1);

    const req = new NextRequest("http://localhost/api/monitors", {
      method: "POST",
      body: JSON.stringify({
        ...VALID_BODY,
        slackWebhookUrl: "https://evil.com",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
