import { initBotId } from "botid/client/core";
import { BOT_PROTECTED } from "./auth/bot-protection";

// Runs in the browser before the app (Next.js 15.3+). BotID wraps fetch so the two sign-in POSTs carry its challenge
// answer (decision #10); withBotId in next.config.ts routes the challenge itself. It does nothing under `npm run dev`
// (and so in the browser test bed).
initBotId({ protect: BOT_PROTECTED });
