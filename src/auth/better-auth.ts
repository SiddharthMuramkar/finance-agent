import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions, type User } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";
import { isInvited, signupOpen } from "./invites";

// Google sign-in through Better Auth (ADR 0011, spec 2026-11-05 C1a). Off unless both BETTER_AUTH_SECRET
// and GOOGLE_CLIENT_ID are set: then nothing is built, /api/auth/* answers 404, and every page works on
// the passcode path, so a deploy without the four secrets behaves exactly as before.

type Env = Record<string, string | undefined>;

/** The origins Better Auth accepts requests and callback URLs from: production and local development only. */
export const TRUSTED_ORIGINS = ["https://www.value-it.xyz", "https://value-it.xyz", "http://localhost:3000"];

/** How long a Google sign-in lasts: 90 days, as the passcode cookie does. */
const SESSION_SECONDS = 60 * 60 * 24 * 90;

/** True when Google sign-in is configured: both BETTER_AUTH_SECRET and GOOGLE_CLIENT_ID are set. */
export function googleSignInOn(env: Env = process.env): boolean {
  return Boolean(env.BETTER_AUTH_SECRET?.trim() && env.GOOGLE_CLIENT_ID?.trim());
}

/**
 * The invite gate, run before Better Auth writes a new `user` row: an unverified email, or an email
 * that is neither on the invite list nor let in by the open Sign-up switch, is refused with the code
 * `not_invited`, which Better Auth's callback turns into `/login?error=not_invited`. Nothing is
 * written: the `user` and its `account` are made in one transaction after this hook.
 */
export function inviteGate(db: Db) {
  return async (user: User & Record<string, unknown>) => {
    if (user.emailVerified !== true) throw new APIError("FORBIDDEN", { code: "email_not_verified", message: "email_not_verified" });
    if (!(await isInvited(db, user.email)) && !(await signupOpen(db))) {
      throw new APIError("FORBIDDEN", { code: "not_invited", message: "not_invited" });
    }
    return { data: user };
  };
}

/** Better Auth's options for this app, over the given database (PGlite in tests, Neon in the app). */
export function authOptions(db: Db, env: Env) {
  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    // Google asks for openid, email and profile only (the provider's defaults); no offline access.
    socialProviders: {
      google: { clientId: env.GOOGLE_CLIENT_ID ?? "", clientSecret: env.GOOGLE_CLIENT_SECRET ?? "", prompt: "select_account" as const },
    },
    trustedOrigins: TRUSTED_ORIGINS,
    // No cookie cache: sign-out and revocation take effect at once.
    session: { expiresIn: SESSION_SECONDS, cookieCache: { enabled: false } },
    account: { accountLinking: { trustedProviders: ["google"] } },
    databaseHooks: { user: { create: { before: inviteGate(db) } } },
    onAPIError: { errorURL: "/login" },
    // Rate limit: Better Auth's in-memory default, enough for about twenty invited people (ADR 0011).
    plugins: [nextCookies()], // nextCookies stays last
  } satisfies BetterAuthOptions;
}

type Auth = ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>;
let instance: Auth | undefined;

/**
 * The app's Better Auth instance, built on first use over getDb() (so tests can mock `@/db/client`);
 * null while Google sign-in is off (googleSignInOn).
 */
export function getAuth(env: Env = process.env): Auth | null {
  if (!googleSignInOn(env)) return null;
  instance ??= betterAuth(authOptions(getDb(), env));
  return instance;
}
