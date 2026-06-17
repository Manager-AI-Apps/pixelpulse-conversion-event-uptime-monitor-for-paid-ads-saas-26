/**
 * Monitor detail page.
 *
 * Shows:
 *   - Per-event uptime StatCards (ga4 / meta_pixel / stripe_purchase, 30-day)
 *   - '25–30% of ad spend at risk' callout
 *   - Last failure diagnosis copy
 *   - DataTable of the last 20 check_runs
 *   - 'Run Now' button that POSTs to /api/monitors/[id]/run
 *
 * Server Component — authenticates via auth.api.getSession, ownership-checks
 * the monitor, then fetches detail from getMonitorDetail.
 */

import * as React from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

import { auth } from "@/lib/auth";
import {
  getMonitorDetail,
  DIAGNOSIS_COPY,
  type DiagnosisCode,
  type CheckRunSummary,
} from "@/lib/queries/monitor-detail";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { StatCard } from "@/components/blocks/stat-card";
import { DataTable, type Column } from "@/components/blocks/data-table";
import { EmptyState } from "@/components/blocks/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Nav (shared with dashboard)
// ---------------------------------------------------------------------------

const NAV = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: <Activity className="size-4" />,
  },
];

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CheckRunSummary["status"] }) {
  const map: Record<
    CheckRunSummary["status"],
    {
      label: string;
      variant: "default" | "destructive" | "secondary" | "outline";
    }
  > = {
    passed: { label: "Passed", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
    running: { label: "Running", variant: "outline" },
    pending_retry: { label: "Retrying", variant: "secondary" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const CHECK_RUN_COLUMNS: Column<CheckRunSummary>[] = [
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "startedAt",
    header: "Started",
    cell: (row) =>
      row.startedAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
  },
  {
    key: "diagnosisCodes",
    header: "Diagnoses",
    cell: (row) => {
      if (!row.diagnosisCodes || row.diagnosisCodes.length === 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <span className="text-sm">
          {row.diagnosisCodes
            .map((c) => DIAGNOSIS_COPY[c as DiagnosisCode] ?? c)
            .join(", ")}
        </span>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MonitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Authentication — runs on Node runtime, never on the edge.
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    redirect("/sign-in");
  }

  const detail = await getMonitorDetail(id);

  // Ownership check: 404 if not found or belongs to a different user.
  if (!detail.monitor || detail.monitor.userId !== session.user.id) {
    notFound();
  }

  const { monitor, recentRuns, eventUptimes, lastFailureDiagnosisCodes } =
    detail;

  // Build uptime stat cards for each event type found in the data.

  // Ensure all three canonical event types are represented (100% if no data).
  const EVENT_TYPES = [
    { key: "ga4" as const, label: "GA4 Events" },
    { key: "meta_pixel" as const, label: "Meta Pixel" },
    { key: "stripe_purchase" as const, label: "Stripe Purchase" },
  ];

  const uptimeByType = new Map(eventUptimes.map((e) => [e.eventType, e]));

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={
        <PageHeader
          title={monitor.name}
          description={`Monitor ID: ${monitor.id}`}
          actions={
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">← Back</Link>
              </Button>
              {/* Run Now — plain HTML form POST; no client JS required */}
              <form
                method="POST"
                action={`/api/monitors/${monitor.id}/run`}
              >
                <Button type="submit" size="sm">
                  Run Now
                </Button>
              </form>
            </div>
          }
        />
      }
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* ---------------------------------------------------------------- */}
        {/* Per-event uptime StatCards (30-day window)                       */}
        {/* ---------------------------------------------------------------- */}
        <section aria-label="30-day event uptime">
          <h2 className="font-display text-xl font-medium mb-3">
            30-Day Event Uptime
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {EVENT_TYPES.map(({ key, label }) => {
              const uptime = uptimeByType.get(key);
              const pct = uptime?.passedPct ?? 100;
              const hint =
                uptime != null
                  ? `${uptime.passedRuns}/${uptime.totalRuns} assertions passed`
                  : "No data in window";
              return (
                <StatCard
                  key={key}
                  label={label}
                  value={`${pct}%`}
                  hint={hint}
                />
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Static ad-spend-at-risk callout                                  */}
        {/* ---------------------------------------------------------------- */}
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400" />
              Ad Spend at Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Research shows that{" "}
              <strong className="text-foreground">25–30% of ad spend</strong>{" "}
              is wasted when conversion events silently break — bidding
              algorithms optimise against bad data for weeks before anyone
              notices. PixelPulse catches it within 15 minutes.
            </p>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Last failure diagnosis copy                                       */}
        {/* ---------------------------------------------------------------- */}
        {lastFailureDiagnosisCodes && lastFailureDiagnosisCodes.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium text-destructive">
                <XCircle className="size-4" />
                Last Failure Diagnosis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {lastFailureDiagnosisCodes.map((code) => (
                  <li
                    key={code}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <span className="size-1.5 rounded-full bg-destructive shrink-0" />
                    {DIAGNOSIS_COPY[code as DiagnosisCode] ?? code}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Recent check runs DataTable                                       */}
        {/* ---------------------------------------------------------------- */}
        <section aria-label="Recent check runs">
          <h2 className="font-display text-xl font-medium mb-3">
            Recent Check Runs
          </h2>
          <DataTable
            columns={CHECK_RUN_COLUMNS}
            rows={recentRuns}
            getRowKey={(row) => row.id}
            empty={
              <EmptyState
                title="No runs yet"
                description="Click 'Run Now' to trigger your first check."
                action={
                  <form
                    method="POST"
                    action={`/api/monitors/${monitor.id}/run`}
                  >
                    <Button type="submit" size="sm">
                      <CheckCircle className="mr-1.5 size-4" />
                      Run Now
                    </Button>
                  </form>
                }
              />
            }
          />
        </section>
      </div>
    </AppShell>
  );
}
