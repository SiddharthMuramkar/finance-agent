import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/auth/better-auth";

// Better Auth's own routes (Google sign-in and its callback, the email link's request and verify, sign-out,
// session). While both are off (betterAuthOn: BETTER_AUTH_SECRET plus Google's client id or the email-link
// settings) there is no instance and every path answers 404.

function handle(method: "GET" | "POST") {
  return async (request: Request): Promise<Response> => {
    const auth = getAuth();
    if (!auth) return new Response("Not found", { status: 404 });
    return toNextJsHandler(auth)[method](request);
  };
}

export const GET = handle("GET");
export const POST = handle("POST");
