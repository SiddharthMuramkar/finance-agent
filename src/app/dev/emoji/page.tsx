import { notFound } from "next/navigation";
import { EmojiSheet } from "./sheet";

// The emoji contact sheet (developer tool): every vendored emoji on Light or Dark. It does not exist in production.
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EmojiDevPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return <EmojiSheet theme={first(params.theme) === "dark" ? "dark" : "light"} />;
}
