export type ShardGroup = { count: number; seconds: number };
export function parseShardLog(text: string): { project: string; file: string; line: number; seconds: number }[];
export function shardTimes(groups: readonly ShardGroup[], weights: readonly number[]): number[];
export function bestWeights(groups: readonly ShardGroup[], shards: number): number[];
