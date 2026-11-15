import { notFound } from "next/navigation";
import { IconSheet } from "./sheet";

// The Icon contact sheet (developer tool, spec 2026-11-11 ticket A1a): every Icon of the named set.
// It does not exist in production.
export const dynamic = "force-dynamic";

export default function IconsDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <IconSheet />;
}
