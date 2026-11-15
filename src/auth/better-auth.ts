import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions, type User } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink, testUtils } from "better-auth/plugins";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";
import { e2eEnabled } from "@/dev/e2e-mode";
import { EMAIL_LINK_SECONDS, emailLinkOn, nameFromEmail, sendSignInLink } from "./email-link";
import { siteAddress } from "./site-address";

// Sign-in through Better Auth: Google (ADR 0011) and email links (ADR 0014). Off unless Google or email
// links are configured (betterAuthOn): then nothing is built, /api/auth/* answers 404, and every page
// works on the passcode path, so a deploy without the secrets behaves exactly as before.

type Env = Record<string, string | undefined>;

/** The origins Better Auth accepts requests and callback URLs from: production and local development only. */
export const TRUSTED_ORIGINS = ["https://www.value-it.xyz", "https://value-it.xyz", "http://localhost:3000"];

/** How long a sign-in lasts: 90 days, as the passcode cookie does. */
const SESSION_SECONDS = 60 * 60 * 24 * 90;

/** Link requests one caller address may make in EMAIL_LINK_SECONDS, across every instance (the rest of the limits are in email-throttle.ts). */
const EMAIL_LINK_REQUESTS = 10;

/**
 * True when Google sign-in is configured: BETTER_AUTH_SECRET, BETTER_AUTH_URL (the host of the redirect URI
 * Google checks letter for letter, as a bare address: siteAddress), GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 * are all set. Decides the Google provider and button, so a half-set Google shows no button rather than one
 * that fails when pressed (Better Auth refuses to start without the client secret).
 */
export function googleSignInOn(env: Env = process.env): boolean {
  return [env.BETTER_AUTH_SECRET, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET].every((v) => Boolean(v?.trim())) && siteAddress(env) !== null;
}

/** True when Better Auth runs at all: Google sign-in or email links (email-link.ts), or both, are on. */
export function betterAuthOn(env: Env = process.env): boolean {
  return googleSignInOn(env) || emailLinkOn(env);
}

/** The path Better Auth runs when an email link is opened: the only place an email-link sign-up makes its user. */
const EMAIL_LINK_VERIFY = "/magic-link/verify";

/**
 * Runs before Better Auth writes a new `user` row (both ways in). An unverified email is refused with
 * `email_not_verified`, which the callback turns into `/login?error=…`, and nothing is written. Anyone
 * verified is kept, invited or not: whether they may enter is decided on every request (access.ts),
 * so a stranger becomes a user who waits for the owner. An email-link sign-up is named from its
 * address, never from the `name` its request carried, since anyone can ask for a link for any address.
 */
export function newUserGate() {
  return async (user: User & Record<string, unknown>, ctx?: { path?: string } | null) => {
    if (user.emailVerified !== true) throw new APIError("FORBIDDEN", { code: "email_not_verified", message: "email_not_verified" });
    if (ctx?.path === EMAIL_LINK_VERIFY) return { data: { ...user, name: nameFromEmail(user.email) } };
    return { data: user };
  };
}

/** Better Auth's options for this app, over the given database (PGlite in tests, Neon in the app). */
export function authOptions(db: Db, env: Env) {
  return {
    baseURL: siteAddress(env) ?? undefined,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Google asks for openid, email and profile only (the provider's defaults); no offline access.
    socialProviders: {
      ...(googleSignInOn(env) && {
        google: { clientId: env.GOOGLE_CLIENT_ID ?? "", clientSecret: env.GOOGLE_CLIENT_SECRET ?? "", prompt: "select_account" as const },
      }),
    },
    trustedOrigins: TRUSTED_ORIGINS,
    // No cookie cache: sign-out, Deny and Remove access take effect at once.
    session: { expiresIn: SESSION_SECONDS, cookieCache: { enabled: false } },
    // No accountLinking.trustedProviders: Google links to an existing user (an email-link user, the owner
    // among them) only when Google says its email is verified. Trusting Google outright would let an
    // unverified Google email take over that user. Change-email and delete-user stay off (the defaults),
    // so nobody can move their account or erase it and its denial with it.
    databaseHooks: { user: { create: { before: newUserGate() } } },
    onAPIError: { errorURL: "/login" },
    // In the database, so the limit holds across every Vercel instance (the client address is Vercel's
    // single-value x-forwarded-for). Link requests get a wider window than Better Auth's sign-in default,
    // because iCloud Private Relay puts many people behind one address.
    rateLimit: {
      storage: "database" as const,
      customRules: { "/sign-in/magic-link": { window: EMAIL_LINK_SECONDS, max: EMAIL_LINK_REQUESTS } },
    },
    // The test bed's helpers exist only under e2eEnabled (never production, never Vercel); src/auth/no-test-utils.test.ts pins this.
    plugins: [
      ...(emailLinkOn(env) ? [magicLink({ expiresIn: EMAIL_LINK_SECONDS, storeToken: "hashed", sendMagicLink: sendSignInLink(db, env) })] : []),
      ...(e2eEnabled(env) ? [testUtils()] : []),
      nextCookies(), // stays last
    ],
  } satisfies BetterAuthOptions;
}

type Auth = ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>;
let instance: Auth | undefined;

/**
 * The app's Better Auth instance, built on first use over getDb() (so tests can mock `@/db/client`);
 * null while Better Auth is off (betterAuthOn).
 */
export function getAuth(env: Env = process.env): Auth | null {
  if (!betterAuthOn(env)) return null;
  instance ??= betterAuth(authOptions(getDb(), env));
  return instance;
}
