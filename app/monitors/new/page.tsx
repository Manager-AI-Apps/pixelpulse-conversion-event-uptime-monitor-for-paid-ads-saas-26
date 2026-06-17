"use client";

/**
 * New Monitor page — multi-section form to create a PixelPulse monitor.
 *
 * Section 1 (Step 1): Monitor name + optional Slack webhook URL.
 * Section 2 (Step 2): Funnel steps, each with a URL, label, and one or more
 *   event assertions (GA4 / Meta Pixel / Stripe Purchase).
 *
 * Client-side validation with Zod + react-hook-form before any API call.
 * On success POSTs to /api/monitors and redirects to /dashboard.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useFormContext, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Activity, PlusCircle, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Form schema (local — handles empty-string optionals that the API schema
// rejects as undefined; we transform before submission).
// ---------------------------------------------------------------------------

const EVENT_TYPES = ["ga4", "meta_pixel", "stripe_purchase"] as const;
type EventType = (typeof EVENT_TYPES)[number];

const AssertionFormSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  eventName: z.string().min(1, "Event name is required"),
  value: z.string().optional(),
  currency: z.string().optional(),
});

const StepFormSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  label: z.string().min(1, "Step label is required"),
  assertions: z
    .array(AssertionFormSchema)
    .min(1, "At least one event assertion is required"),
});

/**
 * Client-side validation schema. Treats an empty slackWebhookUrl string as
 * "not provided" (mapped to undefined before the API call). If the field is
 * non-empty it must start with https://hooks.slack.com/.
 */
const MonitorFormSchema = z.object({
  name: z.string().min(1, "Monitor name is required"),
  slackWebhookUrl: z.string().refine(
    (v) =>
      v === "" || /^https:\/\/hooks\.slack\.com\//.test(v),
    "Slack webhook URL must start with https://hooks.slack.com/",
  ),
  steps: z
    .array(StepFormSchema)
    .min(1, "At least one funnel step is required"),
});

type MonitorFormValues = z.infer<typeof MonitorFormSchema>;

// ---------------------------------------------------------------------------
// Blank defaults
// ---------------------------------------------------------------------------

const DEFAULT_ASSERTION: MonitorFormValues["steps"][number]["assertions"][number] =
  {
    eventType: "ga4",
    eventName: "",
    value: "",
    currency: "",
  };

const DEFAULT_STEP: MonitorFormValues["steps"][number] = {
  url: "",
  label: "",
  assertions: [{ ...DEFAULT_ASSERTION }],
};

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
// AssertionEditor sub-component
// ---------------------------------------------------------------------------

function AssertionEditor({
  stepIndex,
  assertionIndex,
  canRemove,
  onRemove,
}: {
  stepIndex: number;
  assertionIndex: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const form = useFormContext<MonitorFormValues>();

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Event {assertionIndex + 1}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label="Remove assertion"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Event Type */}
        <FormField
          control={form.control}
          name={
            `steps.${stepIndex}.assertions.${assertionIndex}.eventType` as `steps.0.assertions.0.eventType`
          }
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="ga4">GA4</SelectItem>
                  <SelectItem value="meta_pixel">Meta Pixel</SelectItem>
                  <SelectItem value="stripe_purchase">
                    Stripe Purchase
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Event Name */}
        <FormField
          control={form.control}
          name={
            `steps.${stepIndex}.assertions.${assertionIndex}.eventName` as `steps.0.assertions.0.eventName`
          }
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event Name</FormLabel>
              <FormControl>
                <Input placeholder="purchase" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Value */}
        <FormField
          control={form.control}
          name={
            `steps.${stepIndex}.assertions.${assertionIndex}.value` as `steps.0.assertions.0.value`
          }
          render={({ field }) => (
            <FormItem>
              <FormLabel>Value (optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="29.99"
                  type="number"
                  min="0"
                  step="0.01"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Currency */}
        <FormField
          control={form.control}
          name={
            `steps.${stepIndex}.assertions.${assertionIndex}.currency` as `steps.0.assertions.0.currency`
          }
          render={({ field }) => (
            <FormItem>
              <FormLabel>Currency (optional)</FormLabel>
              <FormControl>
                <Input placeholder="USD" maxLength={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepEditor sub-component
// ---------------------------------------------------------------------------

function StepEditor({
  stepIndex,
  canRemove,
  onRemove,
}: {
  stepIndex: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const form = useFormContext<MonitorFormValues>();

  // Manage assertions for this step via watch + setValue to avoid
  // TypeScript issues with deeply nested useFieldArray paths.
  const steps = form.watch("steps");
  const assertions = steps[stepIndex]?.assertions ?? [];

  function addAssertion() {
    const current = form.getValues("steps");
    const updated = current.map((step, i) =>
      i === stepIndex
        ? { ...step, assertions: [...step.assertions, { ...DEFAULT_ASSERTION }] }
        : step,
    );
    form.setValue("steps", updated, { shouldDirty: true });
  }

  function removeAssertion(assertionIndex: number) {
    const current = form.getValues("steps");
    const updated = current.map((step, i) =>
      i === stepIndex
        ? {
            ...step,
            assertions: step.assertions.filter((_, j) => j !== assertionIndex),
          }
        : step,
    );
    form.setValue("steps", updated, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="rounded-lg border border-border p-5 space-y-4">
      {/* Step header row */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          Step {stepIndex + 1}
        </span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label="Remove step"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">Remove step</span>
          </Button>
        )}
      </div>

      {/* URL + Label */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`steps.${stepIndex}.url` as `steps.0.url`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Step URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://example.com/checkout"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`steps.${stepIndex}.label` as `steps.0.label`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Step Label</FormLabel>
              <FormControl>
                <Input placeholder="Checkout Page" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <Separator />

      {/* Assertions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Event Assertions
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addAssertion}
          >
            <PlusCircle className="mr-1.5 size-3.5" />
            Add Assertion
          </Button>
        </div>

        {assertions.map((_, assertionIndex) => (
          <AssertionEditor
            key={assertionIndex}
            stepIndex={stepIndex}
            assertionIndex={assertionIndex}
            canRemove={assertions.length > 1}
            onRemove={() => removeAssertion(assertionIndex)}
          />
        ))}

        {/* Assertion array-level error */}
        {form.formState.errors.steps?.[stepIndex]?.assertions?.message && (
          <p className="text-sm text-destructive">
            {form.formState.errors.steps[stepIndex]?.assertions?.message}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewMonitorPage() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<MonitorFormValues>({
    resolver: zodResolver(MonitorFormSchema),
    defaultValues: {
      name: "",
      slackWebhookUrl: "",
      steps: [{ ...DEFAULT_STEP, assertions: [{ ...DEFAULT_ASSERTION }] }],
    },
  });

  const {
    fields: stepFields,
    append: appendStep,
    remove: removeStep,
  } = useFieldArray({
    control: form.control,
    name: "steps",
  });

  const onSubmit = React.useCallback(
    async (values: MonitorFormValues) => {
      setServerError(null);
      setSubmitting(true);

      try {
        const payload = {
          name: values.name,
          slackWebhookUrl:
            values.slackWebhookUrl === "" ? undefined : values.slackWebhookUrl,
          funnelConfig: {
            steps: values.steps.map((step) => ({
              url: step.url,
              label: step.label,
              assertions: step.assertions.map((a) => ({
                eventType: a.eventType as EventType,
                eventName: a.eventName,
                ...(a.value !== "" && a.value !== undefined
                  ? { value: Number(a.value) }
                  : {}),
                ...(a.currency !== "" && a.currency !== undefined
                  ? { currency: a.currency }
                  : {}),
              })),
            })),
          },
        };

        const res = await fetch("/api/monitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let message = "Failed to create monitor. Please try again.";
          try {
            const data = (await res.json()) as {
              error?: { message?: string };
            };
            if (data.error?.message) message = data.error.message;
          } catch {
            // ignore parse errors
          }
          setServerError(message);
          return;
        }

        router.push("/dashboard");
      } catch {
        setServerError("Network error. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [router],
  );

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={
        <PageHeader
          title="New Monitor"
          description="Set up a conversion funnel monitor to track your pixel events."
        />
      }
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* ── Step 1: Basic Info ───────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl font-medium">
                  Step 1: Basic Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Monitor Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monitor Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="My Checkout Funnel"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Slack Webhook URL */}
                <FormField
                  control={form.control}
                  name="slackWebhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slack Webhook URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://hooks.slack.com/services/..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* ── Step 2: Funnel Steps ─────────────────────────────────── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display text-xl font-medium">
                    Step 2: Funnel Steps
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendStep({
                        ...DEFAULT_STEP,
                        assertions: [{ ...DEFAULT_ASSERTION }],
                      })
                    }
                  >
                    <PlusCircle className="mr-1.5 size-4" />
                    Add Step
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {stepFields.map((stepField, stepIndex) => (
                  <StepEditor
                    key={stepField.id}
                    stepIndex={stepIndex}
                    canRemove={stepFields.length > 1}
                    onRemove={() => removeStep(stepIndex)}
                  />
                ))}

                {/* Steps array-level error (e.g. min 1) */}
                {form.formState.errors.steps?.message && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.steps.message}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Server error */}
            {serverError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{serverError}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create Monitor"}
            </Button>
          </form>
        </FormProvider>
      </div>
    </AppShell>
  );
}
