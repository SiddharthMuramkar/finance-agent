// BotID Basic on the start of a Tutor turn (issue #33): the browser's challenge (src/instrumentation-client.ts) and the
// server's check (checkBotId in src/app/api/turn/route.ts) must name the same request, or checkBotId() calls a person a
// bot. The list comes from here. No server imports: instrumentation-client.ts ships this file to every browser.

/**
 * The requests BotID gives its challenge answer to, for initBotId(): every POST to /api/turn (a Stop too, though the
 * route checks only the turns it starts). Basic is BotID's default check level, so none is set.
 */
export const BOT_PROTECTED = [{ path: "/api/turn", method: "POST" }];
