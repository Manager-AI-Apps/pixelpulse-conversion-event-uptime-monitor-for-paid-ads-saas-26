/**
 * Dashboard page — lists the current user's monitors with uptime stats.
 *
 * Server component: reads the session via auth.api.getSession, redirects to
 * /sign-in when there is no valid session, then fetches monitor stats from
 * the database and renders them in a DataTable.
 */

import * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, PlusCircle } from "lucide-react";

import { auth } from "@/lib/auth";
import { getMonitorStats, type MonitorStats } from "@/lib/queries/monitor-stats";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { DataTable, type Column } from "@/components/blocks/data-table";
import { EmptyState } from "@/components/blocks/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Nav
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

function StatusBadge({
  status,
}: {
  status: MonitorStats["lastRunStatus"];
}) {
  if (!status) {
    return <Badge variant="secondary">No runs</Badge>;
  }
  const map: Record<
    NonNullable<MonitorStats["lastRunStatus"]>,
    { label: string; variant: "default" | "destructive" | "secondary" | "outline" }
  > = {
    passed: { label: "Passed", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
    running: { label: "Running", variant: "outline" },
    pending_retry: { label: "Retrying", variant: "secondary" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const COLUMNS: Column<MonitorStats>[] = [
  {
    key: "name",
    header: "Monitor",
    cell: (row) => (
      <Link
        href={`/monitors/${row.monitorId}`}
        className="font-medium text-foreground hover:text-primary transition-colors"
      >
        {row.name}
      </Link>
    ),
  },
  {
    key: "lastRunStatus",
    header: "Last Run",
    cell: (row) => <StatusBadge status={row.lastRunStatus} />,
  },
  {
    key: "uptimePct7d",
    header: "7-day Uptime",
    numeric: true,
    cell: (row) => `${row.uptimePct7d}%`,
  },
  {
    key: "uptimePct30d",
    header: "30-day Uptime",
    numeric: true,
    cell: (row) => `${row.uptimePct30d}%`,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  // Real DB-backed session check — runs on Node runtime, never on the edge.
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    redirect("/sign-in");
  }

  const stats = await getMonitorStats(session.user.id);

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={
        <PageHeader
          title="Monitors"
          description="Track the health of your conversion pixel funnels."
          actions={
            <Button asChild size="sm">
              <Link href="/monitors/new">
                <PlusCircle className="mr-1.5 size-4" />
                Add Monitor
              </Link>
            </Button>
          }
        />
      }
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <DataTable
          columns={COLUMNS}
          rows={stats}
          getRowKey={(row) => row.monitorId}
          empty={
            <EmptyState
              title="No monitors yet"
              description="Add your first monitor to start tracking your conversion pixels."
              action={
                <Button asChild size="sm">
                  <Link href="/monitors/new">
                    <PlusCircle className="mr-1.5 size-4" />
                    Add Monitor
                  </Link>
                </Button>
              }
            />
          }
        />
      </div>
    </AppShell>
  );
}
