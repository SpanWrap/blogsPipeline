"use client";

import { usePathname } from "next/navigation";
import { PipelineApp } from "./PipelineApp";

/**
 * Keep a single PipelineApp mounted across / and /settings so auth + runs
 * state survive navigation (Next.js remounts page.tsx but keeps this layout).
 */
export function PipelineShell() {
  const pathname = usePathname() || "/";
  const page = pathname.startsWith("/settings") ? "settings" : "home";
  return <PipelineApp initialPage={page} />;
}
