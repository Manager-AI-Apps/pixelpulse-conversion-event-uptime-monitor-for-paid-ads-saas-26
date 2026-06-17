import Link from "next/link";
import {
  Activity,
  BellRing,
  MousePointerClick,
  LayoutDashboard,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureGrid, type Feature } from "@/components/blocks/feature-grid";
import { Hero } from "@/components/blocks/hero";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES: Feature[] = [
  {
    icon: <MousePointerClick className="size-6" />,
    title: "Visual Funnel Recorder",
    description:
      "Click-record your signup or checkout path once in the Chrome extension. PixelPulse replays it on a schedule with a headless browser — no Playwright expertise required.",
  },
  {
    icon: <Activity className="size-6" />,
    title: "Per-Step Event Assertions",
    description:
      "Verify GA4 events, Meta Pixel (browser + CAPI), Google Ads conversion linker, and Stripe Purchase — checking event name, currency, value, and dedup key at every funnel step.",
  },
  {
    icon: <BellRing className="size-6" />,
    title: "Diagnostic Slack Alerts",
    description:
      "Get a Slack message the moment a pixel breaks — with a real diagnosis: 'Purchase fired without value', 'duplicate via gtag + GTM', or 'CAPI silent fail'. Not a generic 'check failed'.",
  },
  {
    icon: <LayoutDashboard className="size-6" />,
    title: "Uptime Dashboard",
    description:
      "See pass/fail history for every funnel run across all your pixels. Spot regressions by deploy, track MTTD, and share a status link with your agency or contractor.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-base font-semibold tracking-tight">
          PixelPulse
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Hero
        eyebrow={
          <Badge variant="secondary">Conversion pixel monitoring</Badge>
        }
        title="Know the moment your conversion pixel breaks."
        subtitle="PixelPulse continuously simulates your signup and checkout funnel, checking every GA4, Meta Pixel, Google Ads, and Stripe event — so you stop burning ad spend on a broken pixel for weeks."
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/sign-up">Sign up free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </>
        }
      />

      <FeatureGrid features={FEATURES} />
    </main>
  );
}
