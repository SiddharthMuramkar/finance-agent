/** Anything that runs one SQL statement and returns its rows: a Neon `Client` in the script, PGlite in tests. */
export interface WipeClient {
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
  end?(): Promise<void>;
}
export interface WipeStep {
  table: string;
  where: string;
  label?: string;
}
export interface FkEdge {
  child: string;
  column: string;
  parent: string;
  parentColumn: string;
}
export interface Survey {
  learners: { total: number; withClerk: number; withoutClerk: number };
  steps: { table: string; label: string; before: number; gone: number; after: number }[];
  uncovered: string[];
  blockers: { child: string; column: string; parent: string; rows: number }[];
  unlinkedToolCalls: number;
}
export interface WipeResult {
  before: Survey;
  deleted: { table: string; rows: number }[];
  after: { table: string; rows: number }[];
}
export interface WipeArgs {
  execute: boolean;
  allowEmpty: boolean;
  snapshot: string | undefined;
  databaseHost: string | undefined;
}
export const USAGE: string;
export const WIPE_STEPS: readonly WipeStep[];
export function fkEdges(client: WipeClient): Promise<FkEdge[]>;
export function uncoveredTables(edges: FkEdge[]): string[];
export function survey(client: WipeClient): Promise<Survey>;
export function refusals(s: Survey, opts?: { allowEmpty?: boolean }): string[];
export function dryRun(client: WipeClient): Promise<Survey>;
export function wipe(client: WipeClient, opts: { snapshot: string | undefined; allowEmpty?: boolean }): Promise<WipeResult>;
export function formatSurvey(s: Survey): string[];
export function parseArgs(argv: string[]): WipeArgs;
export function run(opts?: {
  argv?: string[];
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
  connect?: (url: string) => Promise<WipeClient>;
}): Promise<Survey | WipeResult>;
