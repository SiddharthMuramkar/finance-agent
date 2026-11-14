// The QuickCheck and Rank rules as their parts state them. Kept in a module with no React in it, because the server
// runs the Widget check too and the parts' own files are client modules. quick-check.tsx and rank.tsx import these
// and re-export them, so there is one copy of each rule.

export function quickCheckProblem(options: readonly unknown[], answer: number): string | null {
  if (options.length < 2 || options.length > 4) return `QuickCheck needs 2 to 4 options, not ${options.length}.`;
  if (!Number.isInteger(answer) || answer < -1 || answer > options.length - 1) return `QuickCheck answer ${answer} is outside -1 to ${options.length - 1}.`;
  return null;
}

export function rankProblem(items: readonly unknown[], correctOrder: readonly number[], reasons: readonly unknown[]): string | null {
  if (items.length < 2 || items.length > 8) return "Rank needs 2 to 8 items";
  if (correctOrder.length !== items.length || [...correctOrder].sort((a, b) => a - b).some((v, i) => v !== i)) return "correctOrder must list every item index once";
  if (reasons.length !== items.length) return "Rank needs one reason per item";
  return null;
}
