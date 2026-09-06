import { PipelineShell } from "@/components/PipelineShell";

/** Persistent client shell for home + settings (avoids remount/data wipe on navigate). */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  void children;
  return <PipelineShell />;
}
