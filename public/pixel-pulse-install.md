# PixelPulse — One-Line Install

Add conversion event uptime monitoring to any web page in seconds.

## Quick install

Paste this `<script>` tag into the `<head>` of your checkout or signup pages.
Replace `MONITOR_ID` with your monitor's UUID (visible in the dashboard).

```html
<script src="https://app.pixelpulse.io/api/snippet/MONITOR_ID" async></script>
```

### Example

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Checkout</title>
    <!-- PixelPulse conversion monitor -->
    <script src="https://app.pixelpulse.io/api/snippet/a1b2c3d4-e5f6-7890-abcd-ef1234567890" async></script>
  </head>
  <body>
    <!-- ... -->
  </body>
</html>
```

## What the snippet does

The snippet is intentionally minimal and safe to ship on public pages:

- **Sends a lightweight beacon** to `https://app.pixelpulse.io/api/beacon`
  with your monitor ID and the current page URL.
- **No config leaks** — your funnel configuration and Slack webhook URL
  are stored server-side and are never included in the snippet.
- **Async loading** — the script loads after your page content and does not
  block rendering.

## Getting your Monitor ID

1. Sign in at [app.pixelpulse.io](https://app.pixelpulse.io).
2. Open **Dashboard** and click the monitor you want to install.
3. Click **Install Snippet** or copy the ID shown on the monitor detail page.

The snippet URL for your monitor is:

```
https://app.pixelpulse.io/api/snippet/<YOUR_MONITOR_ID>
```

## Advanced — config file

For CSP-restricted sites or debug mode, create `pixel-pulse.config.js` at
the root of your project:

```js
// pixel-pulse.config.js
module.exports = {
  monitorId: "<YOUR_MONITOR_ID>",
  beaconEndpoint: "https://app.pixelpulse.io/api/beacon",
  // debug: true,
};
```

## Support

Docs: <https://app.pixelpulse.io/docs>  
Email: support@pixelpulse.io
