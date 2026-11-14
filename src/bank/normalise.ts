// Turns rows of the upstream bank files into Question Bank questions. Pure, and no imports at all,
// so the laptop import script can run it with Node's type stripping.

export type BankQuestion = {
  /** Permanent: `bank:<source>:<ID in the upstream file>`. */
  id: string;
  source: "eab" | "unipd" | "finqa";
  bankTitle: string;
  topic: string;
  kind: "choice" | "numeric";
  prompt: string;
  context: string | null;
  choices: { id: string; text: string }[] | null;
  answer: string;
  explanation: string;
  licence: string;
  credit: string;
  sourceUrl: string;
  upstreamReview: string;
  verified: boolean;
  verifiedNote: string | null;
};

export type Skipped = { skipped: string };

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- upstream JSON of unknown shape

const EAB_URL = "https://github.com/geoffsdesk/executive-assessment-bank/blob/main/";

/**
 * One row of the Executive Assessment Bank's `dist/questions.jsonl`. Only the `mba-core` bank
 * (on topic) and the Padova import are kept, and only multiple-choice items, because code marks
 * those. Every item arrives unverified: the Executive Assessment Bank says its keys were made by a
 * model, and the Padova import is marked a draft.
 */
export function fromBankRow(row: Row): BankQuestion | Skipped {
  const imported = row.domain === "imported";
  if (row.domain !== "mba-core" && !imported) return { skipped: `off topic (domain ${row.domain})` };
  if (row.type !== "multiple_choice") return { skipped: `not multiple choice (${row.type})` };
  const options: { key: string; text: string }[] = Array.isArray(row.options) ? row.options : [];
  if (options.length < 2) return { skipped: "fewer than two options" };
  if (typeof row.answer !== "string" || !options.some((o) => o.key === row.answer)) return { skipped: "answer is not one of the options" };
  const licence = String(row.license ?? row.source?.license ?? "");
  return {
    id: `bank:${imported ? "unipd" : "eab"}:${row.id}`,
    source: imported ? "unipd" : "eab",
    bankTitle: String(row.bank_title ?? row.bank_id),
    topic: String(row.topic ?? ""),
    kind: "choice",
    prompt: String(row.stem),
    context: null,
    choices: options.map((o) => ({ id: o.key, text: o.text })),
    answer: row.answer,
    explanation: String(row.explanation ?? "").trim() || "The source gives no explanation for this item.",
    licence,
    credit: imported ? String(row.source?.attribution ?? "MBA @ UniPD (AlphaJack/MBA), CC0 1.0") : `Executive Assessment Bank (geoffsdesk), ${row.bank_title}, ${licence}`,
    sourceUrl: imported ? String(row.source?.url ?? "https://github.com/AlphaJack/MBA") : `${EAB_URL}${row.file}`,
    upstreamReview: String(row.review?.status ?? "unknown"),
    verified: false,
    verifiedNote: null,
  };
}

/** One example of FinQA's dev/test files: a company report passage and table, a question and a numeric answer. */
export function fromFinqaRow(row: Row): BankQuestion | Skipped {
  const qa = row.qa ?? {};
  if (!qa.question || qa.answer === undefined || qa.answer === "") return { skipped: "no question or answer" };
  const table: string[][] = Array.isArray(row.table) ? row.table : [];
  const context = [(row.pre_text ?? []).join("\n"), table.map((r) => r.join(" | ")).join("\n"), (row.post_text ?? []).join("\n")].filter(Boolean).join("\n\n");
  return {
    id: `bank:finqa:${row.id}`,
    source: "finqa",
    bankTitle: "FinQA (S&P 500 earnings reports)",
    topic: String(row.filename ?? ""),
    kind: "numeric",
    prompt: String(qa.question),
    context,
    choices: null,
    answer: String(qa.answer),
    explanation: `Gold program in the source: ${qa.program ?? "not given"}.`,
    licence: "MIT",
    credit: "FinQA (Chen et al., EMNLP 2021), MIT licence",
    sourceUrl: "https://github.com/czyssrs/FinQA",
    upstreamReview: "annotated",
    verified: false,
    verifiedNote: null,
  };
}
