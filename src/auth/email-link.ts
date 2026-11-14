import { APIError } from "better-auth/api";
import type { Db } from "@/db/types";
import { e2eEnabled } from "@/dev/e2e-mode";
import { destinationOrDefault } from "./destination";
import { claimEmailSend } from "./email-throttle";
import { inviteEmail } from "./invites";

// Email-link sign-in (ADR 0014): Better Auth's magic link, sent through Resend with a plain fetch (one
// POST, so no SDK). Any address works, iCloud included; the person then waits for the owner like a
// Google sign-up. The email points at /login?link=…, a page with one "Sign in" button, rather than at
// Better Auth's verify URL: mail scanners and link previews open links before the person does, and
// verify is a GET that uses the token up.

type Env = Record<string, string | undefined>;

/** How long a sign-in link works: 15 minutes, as iCloud and Outlook can deliver late. It works once either way. */
export const EMAIL_LINK_SECONDS = 15 * 60;

/**
 * True when email links are on: BETTER_AUTH_SECRET and BETTER_AUTH_URL (the host written into every
 * link) are set, it is not a preview (which never spends production's mail quota), and either the test
 * bed is on (links go to its in-memory outbox) or Resend is configured (RESEND_API_KEY and EMAIL_FROM).
 */
export function emailLinkOn(env: Env = process.env): boolean {
  if (!env.BETTER_AUTH_SECRET?.trim() || !env.BETTER_AUTH_URL?.trim()) return false;
  if (env.VERCEL_ENV === "preview") return false;
  if (e2eEnabled(env)) return true;
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}

/** Where a sign-in email goes: the test bed's outbox (even beside a Resend key, so it never sends real mail), else Resend. */
export function deliveryFor(env: Env): "outbox" | "resend" {
  return e2eEnabled(env) ? "outbox" : "resend";
}

/**
 * The link the email carries: `<base>/login?link=<token>&next=<destination>`. The destination comes
 * from Better Auth's `callbackURL` through the safe-destination rule (else /study); every other
 * parameter of the verify URL, such as an `errorCallbackURL` sent with the request, is dropped, and
 * the landing form sets its own.
 */
export function landingLink(verifyUrl: string, baseURL: string): string {
  const verify = new URL(verifyUrl);
  const link = new URL("/login", baseURL);
  link.searchParams.set("link", verify.searchParams.get("token") ?? "");
  link.searchParams.set("next", destinationOrDefault(verify.searchParams.get("callbackURL")));
  return link.toString();
}

/**
 * The display name of a new email-link person, from their address: "asha.kumar+x@icloud.com" is
 * "Asha Kumar". Whatever name the request carried is ignored, because anyone can ask for a link for
 * any address; /admin shows the email as who they are.
 */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0]?.split("+")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") || "Learner";
}

/** One sign-in email: plain text first, and minimal HTML with no images and nothing that tracks. */
export type SignInEmail = { subject: string; text: string; html: string };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The email that carries a sign-in link (copy from the email-link design, ADR 0014). */
export function signInEmail(link: string): SignInEmail {
  const lines = {
    intro: "Here is your link to sign in to Value It:",
    once: "It works once, for the next 15 minutes. Open it on the device where you asked for it.",
    ignore: "If you didn't ask for this, ignore this email. Nobody can sign in without the link.",
  };
  const href = escapeHtml(link);
  const p = 'style="margin:0 0 16px;font:16px/1.5 system-ui,sans-serif;color:#1a1a1a"';
  return {
    subject: "Your sign-in link for Value It",
    text: [lines.intro, link, lines.once, lines.ignore].join("\n\n"),
    html: [
      `<p ${p}>${escapeHtml(lines.intro)}</p>`,
      `<p ${p}><a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#1f3fae;color:#ffffff;text-decoration:none;font-weight:600">Sign in to Value It</a></p>`,
      `<p ${p}>${href}</p>`,
      `<p ${p}>${escapeHtml(lines.once)}</p>`,
      `<p ${p}>${escapeHtml(lines.ignore)}</p>`,
    ].join("\n"),
  };
}

/** Resend's Idempotency-Key for a token: a retry of the same send is sent once. A hash, so the token never leaves in a header. */
async function idempotencyKey(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return `sign-in/${Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const notSent = () => new APIError("BAD_GATEWAY", { code: "email_not_sent", message: "email_not_sent" });

/**
 * Sends one sign-in email through Resend's API, giving up after 10 seconds. Any refusal or failure is
 * logged without the address (it is personal data) and thrown as `email_not_sent`, which the login
 * page turns into "We couldn't send the email".
 */
export async function sendWithResend(env: Env, to: string, mail: SignInEmail, token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`,
        "Content-Type": "application/json",
        "Idempotency-Key": await idempotencyKey(token),
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(`email_link_not_sent: Resend unreachable (${error instanceof Error ? error.name : "error"})`);
    throw notSent();
  }
  if (!response.ok) {
    console.error(`email_link_not_sent: Resend answered ${response.status}`);
    throw notSent();
  }
}

/**
 * The test bed's outbox: the latest link per address, parked on `globalThis` because the auth route
 * and the test-bed route are separate module graphs in `next dev` (as `__faE2eDb` in src/dev/e2e-db.ts).
 * Only `deliveryFor` "outbox" (the test bed) ever writes it.
 */
declare global {
  var __faE2eOutbox: Map<string, string> | undefined;
}

/** The latest sign-in link kept for this address in the test bed's outbox, handed out once; null when there is none. */
export function takeOutboxLink(email: string): string | null {
  const key = inviteEmail(email);
  const link = globalThis.__faE2eOutbox?.get(key) ?? null;
  globalThis.__faE2eOutbox?.delete(key);
  return link;
}

/**
 * Better Auth's `sendMagicLink` for this app. In order: the address's and the site's send limits
 * (refused as 429 `email_link_throttled` or `email_link_daily_cap`), then the landing link, then the
 * outbox in the test bed or Resend elsewhere. A send Resend refuses still counts against the limits.
 * Better Auth has already stored the token (hashed) when this runs, so a refused send leaves only an
 * unused token that expires.
 */
export function sendSignInLink(db: Db, env: Env) {
  return async ({ email, url, token }: { email: string; url: string; token: string }): Promise<void> => {
    const to = inviteEmail(email);
    const claim = await claimEmailSend(db, to, env.BETTER_AUTH_SECRET ?? "");
    if (claim !== "ok") throw new APIError("TOO_MANY_REQUESTS", { code: claim, message: claim });
    const link = landingLink(url, env.BETTER_AUTH_URL ?? url);
    if (deliveryFor(env) === "outbox") {
      (globalThis.__faE2eOutbox ??= new Map()).set(to, link);
      return;
    }
    await sendWithResend(env, to, signInEmail(link), token);
  };
}
