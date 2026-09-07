/**
 * Branded HTML for the risk alerts.
 *
 * Built to match the dashboard: USC garnet on the paper-and-ink palette from
 * app/globals.css, square corners, hairline rules, small-caps labels and
 * tabular figures. Someone who reads one of these and then opens the board
 * should recognise it as the same system.
 *
 * Written the way email actually renders rather than the way the app is
 * written: nested tables for layout, every style inline, no flexbox, no grid,
 * no web fonts, explicit pixel widths. Gmail strips <style> blocks and Outlook
 * renders through Word, so anything clever degrades to a broken layout in the
 * clients this fund actually uses.
 *
 * Every message also ships a plain-text alternative. A phone showing the text
 * part on a lock screen is often how a red is first seen.
 */

const C = {
  paper: "#f2f1ea",
  paper3: "#ebe9e1",
  surface: "#ffffff",
  ink: "#17181a",
  ink2: "#5c5e5a",
  ink3: "#8b8d86",
  line: "#dcdad1",
  line2: "#c6c4ba",
  garnet: "#8e0604",
  garnetDeep: "#770503",
  pos: "#1a6b45",
  neg: "#8e0604",
  warn: "#8a5a05",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type AlertSeverity = "red" | "test";

/** One breached limit, as it appears in the message. */
export type EmailBreach = {
  label: string;
  /** Position symbol for a per-position rule; null for portfolio-level. */
  subject: string | null;
  value: string;
  limitText: string;
  source: string;
};

export type AlertEmail = {
  subject: string;
  html: string;
  text: string;
};

function shell(params: {
  kicker: string;
  heading: string;
  accent: string;
  body: string;
  footnote: string;
  recipients: string[];
}): string {
  const { kicker, heading, accent, body, footnote, recipients } = params;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<!-- Preheader: what the inbox list shows before the message is opened. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(heading)} — ${esc(kicker)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${C.surface};border:1px solid ${C.line2};">

  <!-- Masthead -->
  <tr><td style="background:${C.garnet};padding:16px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;letter-spacing:0.06em;text-transform:uppercase;">
        Garnet&nbsp;Fund
      </td>
      <td align="right" style="font-family:${FONT};font-size:11px;color:#f0d5d4;letter-spacing:0.1em;text-transform:uppercase;">
        Risk&nbsp;Monitor
      </td>
    </tr></table>
  </td></tr>

  <!-- Severity band -->
  <tr><td style="background:${accent};padding:9px 20px;font-family:${FONT};font-size:11.5px;font-weight:600;color:#ffffff;letter-spacing:0.12em;text-transform:uppercase;">
    ${esc(kicker)}
  </td></tr>

  <!-- Heading -->
  <tr><td style="padding:22px 20px 4px;">
    <div style="font-family:${FONT};font-size:20px;line-height:1.3;font-weight:600;color:${C.ink};">${esc(heading)}</div>
  </td></tr>

  ${body}

  <!-- Footnote -->
  <tr><td style="padding:4px 20px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper3};border-left:2px solid ${C.line2};">
      <tr><td style="padding:11px 13px;font-family:${FONT};font-size:12.5px;line-height:1.55;color:${C.ink2};">
        ${footnote}
      </td></tr>
    </table>
  </td></tr>

  <!-- Foot -->
  <tr><td style="border-top:1px solid ${C.line};padding:14px 20px 18px;">
    <div style="font-family:${FONT};font-size:11px;line-height:1.6;color:${C.ink3};">
      <strong style="color:${C.ink2};font-weight:600;">Sent to</strong> ${esc(recipients.join(", ") || "no recipient configured")}<br/>
      Generated ${esc(new Date().toUTCString())}<br/>
      Thresholds are set in Risk Admin and every change is logged. Only a red notifies; yellow states appear on
      the dashboard and in the alert log and send nothing.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** One breach rendered as a bordered block. */
function breachBlock(b: EmailBreach, accent: string): string {
  const where = b.subject ? `<span style="color:${C.ink2};font-weight:400;"> — ${esc(b.subject)}</span>` : "";
  return `
  <tr><td style="padding:10px 20px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-left:3px solid ${accent};">
      <tr><td style="padding:13px 15px;">
        <div style="font-family:${FONT};font-size:14.5px;font-weight:600;color:${C.ink};margin-bottom:9px;">
          ${esc(b.label)}${where}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
              <div style="font-family:${FONT};font-size:10px;color:${C.ink3};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;">Reading</div>
              <div style="font-family:${MONO};font-size:19px;font-weight:700;color:${accent};">${esc(b.value)}</div>
            </td>
            <td width="50%" style="padding:0;vertical-align:top;border-left:1px solid ${C.line};padding-left:12px;">
              <div style="font-family:${FONT};font-size:10px;color:${C.ink3};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:3px;">Limit</div>
              <div style="font-family:${MONO};font-size:14px;color:${C.ink};padding-top:4px;">${esc(b.limitText)}</div>
            </td>
          </tr>
        </table>
        <div style="font-family:${FONT};font-size:11px;color:${C.ink3};margin-top:10px;padding-top:8px;border-top:1px solid ${C.line};">
          ${esc(b.source)}
        </div>
      </td></tr>
    </table>
  </td></tr>`;
}

function textFor(breaches: EmailBreach[]): string {
  return breaches
    .map((b) => {
      const where = b.subject ? ` — ${b.subject}` : "";
      return `  ${b.label}${where}\n    reading: ${b.value}\n    limit:   ${b.limitText}\n    source:  ${b.source}`;
    })
    .join("\n\n");
}

/**
 * An intraday red: a limit that §4.4 says notifies the moment it is detected,
 * rather than waiting for the close.
 */
export function immediateAlertEmail(params: {
  breach: EmailBreach;
  recipients: string[];
  dashboardUrl: string | null;
}): AlertEmail {
  const { breach, recipients, dashboardUrl } = params;
  const heading = breach.subject ? `${breach.label} — ${breach.subject}` : breach.label;

  const link = dashboardUrl
    ? `<tr><td style="padding:16px 20px 0;">
        <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${C.garnet};color:#ffffff;font-family:${FONT};font-size:13px;font-weight:600;text-decoration:none;padding:10px 18px;">Open the risk board</a>
       </td></tr>`
    : "";

  return {
    subject: `[Garnet Fund Risk] RED — ${heading}`,
    html: shell({
      kicker: "Red · limit breached · immediate",
      heading,
      accent: C.neg,
      body: breachBlock(breach, C.neg) + link,
      footnote:
        "This is one of the intraday-sensitive limits, so it was sent the moment it was detected rather than " +
        "batched to the close. No further message will be sent while this episode stays open, and none when it " +
        "returns to green — the close is recorded in the alert log only.",
      recipients,
    }),
    text: [
      `GARNET FUND — RISK ALERT`,
      `RED — limit breached (immediate)`,
      ``,
      textFor([breach]),
      ``,
      dashboardUrl ? `Open the risk board: ${dashboardUrl}` : "",
      ``,
      `This is an intraday-sensitive limit, sent on detection rather than batched to the close.`,
      `No further message while this episode stays open, and none when it returns to green.`,
      ``,
      `Sent to: ${recipients.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The close-of-day batch: every red that opened today, in one message. */
export function batchAlertEmail(params: {
  breaches: EmailBreach[];
  recipients: string[];
  requiresConfirmation: boolean;
  dashboardUrl: string | null;
}): AlertEmail {
  const { breaches, recipients, requiresConfirmation, dashboardUrl } = params;
  const n = breaches.length;
  const heading = `${n} limit${n === 1 ? "" : "s"} entered red today`;

  const link = dashboardUrl
    ? `<tr><td style="padding:16px 20px 0;">
        <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${C.garnet};color:#ffffff;font-family:${FONT};font-size:13px;font-weight:600;text-decoration:none;padding:10px 18px;">Open the risk board</a>
       </td></tr>`
    : "";

  return {
    subject: `[Garnet Fund Risk] Close of day — ${n} red${n === 1 ? "" : "s"}`,
    html: shell({
      kicker: "Red · close of day",
      heading,
      accent: C.neg,
      body: breaches.map((b) => breachBlock(b, C.neg)).join("") + link,
      footnote: requiresConfirmation
        ? "IPS VIII.b requires the Risk Manager to confirm an allocation breach before the President and Faculty " +
          "Advisor are notified. Confirm it from the alert log to escalate."
        : "Each of these is one episode. No further message will be sent while it stays open, and none when it " +
          "returns to green.",
      recipients,
    }),
    text: [
      `GARNET FUND — RISK ALERT`,
      `${heading.toUpperCase()}`,
      ``,
      textFor(breaches),
      ``,
      dashboardUrl ? `Open the risk board: ${dashboardUrl}` : "",
      ``,
      requiresConfirmation
        ? `IPS VIII.b: confirm this breach from the alert log to notify the President and Faculty Advisor.`
        : `Each of these is one episode. No repeat while it stays open, nothing when it returns to green.`,
      ``,
      `Sent to: ${recipients.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The IPS VIII.b escalation, after the Risk Manager confirms. */
export function escalationEmail(params: {
  label: string;
  value: string;
  limitText: string;
  note: string;
  confirmedBy: string;
  recipients: string[];
  dashboardUrl: string | null;
}): AlertEmail {
  const { label, value, limitText, note, confirmedBy, recipients, dashboardUrl } = params;

  const body =
    breachBlock({ label, subject: null, value, limitText, source: "IPS VIII.a" }, C.neg) +
    `<tr><td style="padding:14px 20px 0;">
       <div style="font-family:${FONT};font-size:10px;color:${C.ink3};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">Risk Manager's note</div>
       <div style="font-family:${FONT};font-size:13.5px;line-height:1.55;color:${C.ink};">${esc(note || "(none given)")}</div>
       <div style="font-family:${FONT};font-size:11.5px;color:${C.ink3};margin-top:8px;">Confirmed by ${esc(confirmedBy)}</div>
     </td></tr>` +
    (dashboardUrl
      ? `<tr><td style="padding:16px 20px 0;">
          <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${C.garnet};color:#ffffff;font-family:${FONT};font-size:13px;font-weight:600;text-decoration:none;padding:10px 18px;">Open the risk board</a>
         </td></tr>`
      : "");

  return {
    subject: `[Garnet Fund Risk] Confirmed breach — ${label}`,
    html: shell({
      kicker: "Red · confirmed by the Risk Manager",
      heading: `${label} is outside its band`,
      accent: C.garnetDeep,
      body,
      footnote:
        "IPS VIII.b requires this specific chain: the Risk Manager is notified first, and the President and " +
        "Faculty Advisor only once the breach has been confirmed. That confirmation has now happened.",
      recipients,
    }),
    text: [
      `GARNET FUND — CONFIRMED BREACH`,
      ``,
      `${label}: ${value} against ${limitText}`,
      ``,
      `Risk Manager's note: ${note || "(none given)"}`,
      `Confirmed by: ${confirmedBy}`,
      ``,
      `IPS VIII.b requires the Risk Manager to confirm before the President and Faculty Advisor are notified.`,
      ``,
      `Sent to: ${recipients.join(", ")}`,
    ].join("\n"),
  };
}

/**
 * The delivery test. Deliberately shaped like a real alert — a test that looks
 * nothing like the thing it is testing proves very little about how the real
 * one will render.
 */
export function testAlertEmail(params: {
  recipients: string[];
  sender: string;
  transport: string;
  dashboardUrl: string | null;
}): AlertEmail {
  const { recipients, sender, transport, dashboardUrl } = params;

  const sample: EmailBreach = {
    label: "Long position size",
    subject: "EXAMPLE",
    value: "10.8%",
    limitText: "≤ 10% of NAV",
    source: "IPS III.b, IV.c step 6 — sample figures, not a real breach",
  };

  const body =
    `<tr><td style="padding:6px 20px 0;">
       <div style="font-family:${FONT};font-size:13.5px;line-height:1.6;color:${C.ink2};">
         If you are reading this, a real breach notification will reach you too. Below is exactly how one looks.
       </div>
     </td></tr>` +
    breachBlock(sample, C.warn) +
    `<tr><td style="padding:14px 20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};">
        <tr>
          <td style="padding:9px 13px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:11.5px;color:${C.ink3};width:34%;">Sending as</td>
          <td style="padding:9px 13px;border-bottom:1px solid ${C.line};font-family:${MONO};font-size:11.5px;color:${C.ink};">${esc(sender)}</td>
        </tr>
        <tr>
          <td style="padding:9px 13px;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:11.5px;color:${C.ink3};">Transport</td>
          <td style="padding:9px 13px;border-bottom:1px solid ${C.line};font-family:${MONO};font-size:11.5px;color:${C.ink};">${esc(transport)}</td>
        </tr>
        <tr>
          <td style="padding:9px 13px;font-family:${FONT};font-size:11.5px;color:${C.ink3};">Recipients</td>
          <td style="padding:9px 13px;font-family:${MONO};font-size:11.5px;color:${C.ink};">${esc(recipients.join(", "))}</td>
        </tr>
      </table>
    </td></tr>` +
    (dashboardUrl
      ? `<tr><td style="padding:16px 20px 0;">
          <a href="${esc(dashboardUrl)}" style="display:inline-block;background:${C.garnet};color:#ffffff;font-family:${FONT};font-size:13px;font-weight:600;text-decoration:none;padding:10px 18px;">Open the risk board</a>
         </td></tr>`
      : "");

  return {
    subject: "[Garnet Fund Risk] Test — alert delivery check",
    html: shell({
      kicker: "Test · delivery check",
      heading: "Alert delivery is working",
      accent: C.pos,
      body,
      footnote:
        "Sent from Risk Admin. The figures above are a worked example, not a real position. Only a red notifies: " +
        "yellow states change the colour on the board and open an entry in the alert log, and send nothing.",
      recipients,
    }),
    text: [
      `GARNET FUND — RISK ALERT TEST`,
      ``,
      `If you are reading this, a real breach notification will reach you too.`,
      ``,
      `Example of a real alert:`,
      textFor([sample]),
      ``,
      `Sending as: ${sender}`,
      `Transport:  ${transport}`,
      `Recipients: ${recipients.join(", ")}`,
      ``,
      `Only a red notifies. Yellow states appear on the dashboard and in the alert log and send nothing.`,
    ].join("\n"),
  };
}
