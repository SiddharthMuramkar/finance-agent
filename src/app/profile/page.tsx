import { redirect } from "next/navigation";

/** The old About you address: About you now lives on Settings. */
export default async function ProfilePage(): Promise<never> {
  redirect("/settings#about-you");
}
