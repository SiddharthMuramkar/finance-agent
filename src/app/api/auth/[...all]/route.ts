import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/auth/better-auth";

// Better Auth's own routes (Google sign-in, its callback, sign-out, session). While Google sign-in is
// off (BETTER_AUTH_SECRET or GOOGLE_CLIENT_ID unset) there is no instance and every path answers 404.

function handle(method: "GET" | "POST") {
  return async (request: Request): Promise<Response> => {
    const auth = getAuth();
    if (!auth) return new Response("Not found", { status: 404 });
    return toNextJsHandler(auth)[method](request);
  };
}

export const GET = handle("GET");
export const POST = handle("POST");
