import { notFound } from "next/navigation";
import { IconSheet } from "./sheet";

// The Icon contact sheet (developer tool, spec 2026-11-11 ticket A1a): every Icon of the named set on Light or Dark.
// It does not exist in production.
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function IconsDevPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return <IconSheet theme={first(params.theme) === "dark" ? "dark" : "light"} />;
}
