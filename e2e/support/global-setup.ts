import { request, type FullConfig } from "@playwright/test";

/** Signs the tools Learner in once through the real login route and saves the cookie every test starts with. */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState } = config.projects[0].use;
  const context = await request.newContext({ baseURL });
  const response = await context.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  if (response.status() !== 303 || !response.headers()["set-cookie"]?.includes("fa_access=")) {
    throw new Error(`The tools Learner could not sign in: POST /api/login answered ${response.status()}.`);
  }
  await context.storageState({ path: storageState as string });
  await context.dispose();
}
