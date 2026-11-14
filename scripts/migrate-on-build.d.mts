export function migrationPlan(env: Record<string, string | undefined>): { run: false; reason: string } | { run: true; url: string };
export function pendingCount(inRepo: number, applied: number): number;
export function migrateOnBuild(env?: Record<string, string | undefined>, log?: (line: string) => void): Promise<void>;
