import { describe, expect, it } from "vitest";
import { LOGIN_NOT_INVITED, MATRIX_PAGES, matrixCells } from "./preview-matrix";

describe("preview matrix [S3]", () => {
  it("the matrix lists every cell", () => {
    const cells = matrixCells();
    const main = cells.filter((c) => c.page.id !== LOGIN_NOT_INVITED.id);
    expect(MATRIX_PAGES).toHaveLength(9);
    expect(main).toHaveLength(4 * 2 * 9); // 72
    expect(cells.filter((c) => c.page.id === LOGIN_NOT_INVITED.id)).toHaveLength(8); // one per project
    expect(cells).toHaveLength(80);
    expect(new Set(cells.map((c) => c.project)).size).toBe(8);
    expect(new Set(cells.map((c) => c.file)).size).toBe(cells.length); // no duplicates
    for (const c of cells) expect(c.file, c.file).not.toMatch(/\s/);
  });
});
