/**
 * Snippet install page for a monitor.
 *
 * Shows the one-line <script> tag the engineer pastes into their site,
 * a config-file template for advanced users, and a link to the full docs.
 *
 * Server Component — no auth required for this page (the monitorId is the
 * public install key); auth would be redundant as the snippet itself is public.
 * Re-uses the AppShell so the page looks correct when visited while signed in.
 *
 * The page does NOT read the monitor's funnelConfig or slackWebhookUrl from
 * the DB — it only needs the monitor ID to construct the snippet URL.
 */

import * as React from "react";
import Link from "next/link";
import { Activity, Code2, ExternalLink, Terminal } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
// Page
// ---------------------------------------------------------------------------

export default async function SnippetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const scriptSrc = `https://app.pixelpulse.io/api/snippet/${id}`;
  const scriptTag = `<script src="${scriptSrc}" async></script>`;

  const configTemplate = `// pixel-pulse.config.js
// Optional: place this file at the root of your project to override defaults.
module.exports = {
  monitorId: "${id}",
  beaconEndpoint: "https://app.pixelpulse.io/api/beacon",
  // debug: true,  // Uncomment to enable verbose console output
};`;

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={
        <PageHeader
          title="Install Snippet"
          description={`One-line install for monitor ${id}`}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href={`/monitors/${id}`}>← Back to Monitor</Link>
            </Button>
          }
        />
      }
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        {/* ---------------------------------------------------------------- */}
        {/* Step 1 — One-line install                                         */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-xl font-medium">
              <Code2 className="size-5" />
              Step 1 — Add the snippet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste this <code className="font-mono text-foreground">&lt;script&gt;</code>{" "}
              tag into the <code className="font-mono text-foreground">&lt;head&gt;</code>{" "}
              of every page you want to monitor — or just the checkout / signup
              pages.
            </p>

            {/* script tag display */}
            <div
              className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm text-foreground overflow-x-auto"
              data-testid="snippet-script-tag"
            >
              <pre className="whitespace-pre-wrap break-all">
                {scriptTag}
              </pre>
            </div>

            <p className="text-xs text-muted-foreground">
              Monitor ID:{" "}
              <code className="font-mono tabular-nums">{id}</code>
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <a
                  href={`https://pixelpulse.io/docs/install`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  Full install guide
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Step 2 — Config file template (advanced)                          */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-xl font-medium">
              <Terminal className="size-5" />
              Step 2 (optional) — Config file
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For advanced setups (CSP headers, debug mode, custom endpoints),
              drop a <code className="font-mono text-foreground">pixel-pulse.config.js</code>{" "}
              at the root of your project:
            </p>

            <div
              className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm text-foreground overflow-x-auto"
              data-testid="snippet-config-template"
            >
              <pre className="whitespace-pre-wrap">{configTemplate}</pre>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Security note                                                     */}
        {/* ---------------------------------------------------------------- */}
        <p className="text-xs text-muted-foreground text-center">
          The snippet only contains your monitor ID and the beacon endpoint URL.
          Your funnel configuration and Slack webhook are never exposed.
        </p>
      </div>
    </AppShell>
  );
}
