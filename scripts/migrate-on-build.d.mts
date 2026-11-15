export function migrationPlan(env: Record<string, string | undefined>): { run: false; reason: string } | { run: true; url: string };
export function pendingCount(inRepo: number, applied: number): number;
export function snapshotBeforeMigrating(
  env: Record<string, string | undefined>,
  pending: number,
  deps?: {
    fetch?: (url: string, init?: RequestInit) => Promise<Response>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => Date;
    /** Where the NEON_SNAPSHOT=off warning goes (console.warn by default). */
    warn?: (line: string) => void;
    /** How long one Neon API call may take before the build fails (30 s by default). */
    timeoutMs?: number;
  },
): Promise<{ taken: false; reason: string } | { taken: true; id: string; name: string; branchId: string }>;
export function migrateOnBuild(env?: Record<string, string | undefined>, log?: (line: string) => void): Promise<void>;
