import { recipeSignature, type Recipe } from "./define";
import { SEEDS } from "./seeds";
import { SET_A } from "./set-a";
import { SET_B } from "./set-b";

export { defineRecipe, type Recipe, type Built } from "./define";

/** Every Widget recipe, one per id: a later set's recipe replaces a seed (or an earlier set's) with the same id. */
export const RECIPES: Recipe[] = [...new Map([...SEEDS, ...SET_A, ...SET_B].map((r) => [r.id, r])).values()];

export const RECIPE_IDS = RECIPES.map((r) => r.id);

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/** The catalog as the Tutor's instructions list it: each recipe's id, use and params schema. */
export function recipeSignatures(): string {
  return RECIPES.map(recipeSignature).join("\n");
}
