// BotID Basic on the two sign-in POSTs (decision #10): the browser's challenge (src/instrumentation-client.ts) and the
// server's check (the captcha plugin in better-auth.ts) must name the same requests, or checkBotId() fails for a
// person. Both lists come from here. No server imports: instrumentation-client.ts ships this file to every browser.

/** Better Auth's sign-in paths that BotID checks, without its /api/auth base path: Google's start and the email-link request. */
export const BOT_CHECKED = ["/sign-in/social", "/sign-in/magic-link"];

/** The same requests as the browser sends them, for initBotId(). Basic is BotID's default check level, so none is set. */
export const BOT_PROTECTED = BOT_CHECKED.map((path) => ({ path: `/api/auth${path}`, method: "POST" }));
