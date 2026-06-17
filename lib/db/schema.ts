/**
 * Drizzle schema.
 *
 * The four tables below (`user`, `session`, `account`, `verification`) are the
 * Better Auth model. Better Auth validates this shape on every query and 500s
 * at runtime if any required column is missing, so they ship pre-defined and
 * correct — do NOT trim "unused" columns (the OAuth token fields on `account`,
 * `ipAddress`/`userAgent` on `session`) even for email+password-only apps.
 *
 * App-specific tables: add them BELOW the Better Auth block during the
 * schema-translation task (translate db_schema.reference.json into Drizzle
 * code here). Keep the Better Auth tables intact.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Better Auth tables — required shape. Do not modify column names/types.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: false }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: false }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: false }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// App tables — add below this line during schema translation.
// ---------------------------------------------------------------------------

// monitor: a funnel that the user wants to keep an eye on
export const monitor = pgTable(
  "monitor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Serialised FunnelConfig (validated at the application layer) */
    funnelConfig: jsonb("funnel_config").notNull(),
    slackWebhookUrl: text("slack_webhook_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: false }).notNull().defaultNow(),
  },
  (t) => [index("idx_monitor_userId").on(t.userId)],
);

// check_run: a single execution of a monitor's funnel
export const checkRun = pgTable(
  "check_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitor.id, { onDelete: "cascade" }),
    /** running | pending_retry | passed | failed */
    status: text("status")
      .notNull()
      .$type<"running" | "pending_retry" | "passed" | "failed">(),
    startedAt: timestamp("started_at", { withTimezone: false }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: false }),
    /** Array of diagnosis code strings */
    diagnosisCodes: jsonb("diagnosis_codes"),
    isRetry: boolean("is_retry").notNull().default(false),
  },
  (t) => [
    index("idx_check_run_monitor_started").on(t.monitorId, sql`${t.startedAt} desc`),
    // CHECK constraint: status must be one of the allowed values
    { check: sql`${t.status} in ('running','pending_retry','passed','failed')` },
  ],
);

// event_assertion_result: per-event assertion outcome within a check_run
export const eventAssertionResult = pgTable(
  "event_assertion_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkRunId: uuid("check_run_id")
      .notNull()
      .references(() => checkRun.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    /** ga4 | meta_pixel | stripe_purchase */
    eventType: text("event_type")
      .notNull()
      .$type<"ga4" | "meta_pixel" | "stripe_purchase">(),
    passed: boolean("passed").notNull(),
    diagnosisCode: text("diagnosis_code"),
    diagnosisDetail: text("diagnosis_detail"),
    capturedPayload: jsonb("captured_payload"),
  },
  (t) => [
    index("idx_ear_checkRunId_eventType").on(t.checkRunId, t.eventType),
    index("idx_ear_checkRunId_passed").on(t.checkRunId, t.passed),
    // CHECK constraint: eventType must be one of the allowed values
    { check: sql`${t.eventType} in ('ga4','meta_pixel','stripe_purchase')` },
  ],
);
