export function assertLocalBase(base: string): void;
export function assertTestDatabase(url: string, env?: Record<string, string | undefined>, log?: (line: string) => void): void;
export function assertToolsLearner(
  client: { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
  learnerId: number,
): Promise<void>;
export function textOf(m: { content?: unknown }): string;
export function assertNamedDatabase(url: string, env?: Record<string, string | undefined>, log?: (line: string) => void): void;
