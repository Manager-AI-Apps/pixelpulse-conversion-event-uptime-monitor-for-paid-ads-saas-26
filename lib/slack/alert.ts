/**
 * Slack alert helper for PixelPulse monitor failures.
 *
 * Sends a rich Block Kit message to a Slack incoming webhook URL
 * when a monitor detects one or more diagnosis codes.
 *
 * Validates the webhook URL, builds the message, and retries on
 * transient 5xx errors (max 2 retries).
 */

/** All recognised diagnosis codes returned by the assertion engine. */
export type DiagnosisCode =
  | "event_missing"
  | "value_missing"
  | "currency_mismatch"
  | "duplicate_event"
  | "property_mismatch";

/** Human-readable copy for each diagnosis code. */
const DIAGNOSIS_COPY: Record<DiagnosisCode, string> = {
  event_missing: "Event not firing",
  value_missing: "Purchase fired without value",
  currency_mismatch: "Currency mismatch",
  duplicate_event: "Duplicate event via gtag + GTM",
  property_mismatch: "GA4 property mismatch",
};

/** Maximum number of additional retry attempts (1 initial + 2 retries = 3 total). */
const MAX_RETRIES = 2;

/** Prefix every valid Slack incoming webhook must start with. */
const SLACK_WEBHOOK_PREFIX = "https://hooks.slack.com/";

/**
 * Validates that `webhookUrl` is a legitimate Slack incoming webhook URL.
 * Throws a descriptive `Error` if the URL does not pass validation.
 */
function validateWebhookUrl(webhookUrl: string): void {
  if (!webhookUrl.startsWith(SLACK_WEBHOOK_PREFIX)) {
    throw new Error(
      `Invalid Slack webhook URL: must start with "${SLACK_WEBHOOK_PREFIX}". ` +
        `Received: "${webhookUrl}"`,
    );
  }
}

/**
 * Builds a Slack Block Kit payload for a monitor alert.
 *
 * @param monitorName   - Display name of the failing monitor.
 * @param diagnosisCodes - One or more diagnosis codes describing the failure.
 * @returns A JSON-serialisable Block Kit message object.
 */
function buildBlockKitPayload(
  monitorName: string,
  diagnosisCodes: string[],
): Record<string, unknown> {
  // Map each code to its human copy; fall back to the raw code for unknowns.
  const diagnosisItems = diagnosisCodes.map((code) => {
    const copy =
      DIAGNOSIS_COPY[code as DiagnosisCode] ?? code;
    return `• ${copy}`;
  });

  const diagnosisText = diagnosisItems.join("\n");

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 PixelPulse Monitor Alert",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Monitor*\n${monitorName}`,
          },
          {
            type: "mrkdwn",
            text: `*Status*\n:red_circle: Failing`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Diagnoses detected:*\n${diagnosisText}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Detected at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} {time}|${new Date().toISOString()}>`,
          },
        ],
      },
      {
        type: "divider",
      },
    ],
  };
}

/**
 * Sends a Slack alert to `webhookUrl` for a failing monitor.
 *
 * @param webhookUrl     - Slack incoming webhook URL (must start with https://hooks.slack.com/).
 * @param monitorName    - Human-readable name of the monitor that failed.
 * @param diagnosisCodes - One or more diagnosis codes describing what went wrong.
 *
 * @throws `Error` if `webhookUrl` is not a valid Slack webhook URL.
 * @throws `Error` if the POST fails after all retries are exhausted.
 */
export async function sendSlackAlert(
  webhookUrl: string,
  monitorName: string,
  diagnosisCodes: string[],
): Promise<void> {
  // Validate before any async work to fail fast on bad input.
  validateWebhookUrl(webhookUrl);

  const payload = buildBlockKitPayload(monitorName, diagnosisCodes);
  const body = JSON.stringify(payload);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (networkErr) {
      // Network-level error (DNS, connection refused, etc.) — retry.
      lastError =
        networkErr instanceof Error
          ? networkErr
          : new Error(String(networkErr));
      continue;
    }

    if (response.ok) {
      return; // Success — exit early.
    }

    if (response.status >= 500) {
      // Transient server error — retry.
      const text = await response.text().catch(() => "(no body)");
      lastError = new Error(
        `Slack webhook returned HTTP ${response.status}: ${text}`,
      );
      continue;
    }

    // 4xx or other non-5xx non-ok — do not retry.
    const text = await response.text().catch(() => "(no body)");
    throw new Error(
      `Slack webhook rejected request with HTTP ${response.status}: ${text}`,
    );
  }

  // All attempts exhausted.
  throw (
    lastError ??
    new Error(
      `Slack webhook failed after ${MAX_RETRIES + 1} attempts (unknown error)`,
    )
  );
}
