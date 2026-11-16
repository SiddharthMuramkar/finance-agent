import { and, desc, eq } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { spinePassed } from "@/course/navigator";
import { ownCases } from "@/db/schema";
import type { Db } from "@/db/types";
import { CURRENCY_STYLE } from "@/finance/money";
import { OWN_CASE_MARKETS, ownCaseIndustries, ownCaseMarket, valueOwnCase, type OwnCaseEstimate, type OwnCaseInputs, type OwnCaseValue } from "@/finance/own-case";
import { dateText, moneyText, priceText } from "@/widgets/workbench/value-levers-model";
import { loadProgress } from "./memory";

/**
 * The Learner's Own Cases (spec #68, Assignments): each one a listed company they valued from its annual report, kept
 * with what they typed, their Estimate and the one-page note the Notebook shows. Every Own Case is one Learner's.
 */

const percent = (n: number) => `${Number(n.toFixed(2))}%`;

/** The one-page note of a valued Own Case: what was typed, the Estimate, and the engine's value beside the price. Words only, never a verdict. */
export function ownCaseNote(inputs: OwnCaseInputs, estimate: OwnCaseEstimate, value: Extract<OwnCaseValue, { ok: true }>): string {
  const market = ownCaseMarket(inputs.market);
  const industry = market.industries.find((i) => i.id === inputs.industry)?.label ?? inputs.industry;
  const money = { currency: market.currency, unit: market.unit } as const;
  const { symbol, locale } = CURRENCY_STYLE[market.currency];
  const on = dateText(inputs.reportDate);
  const margin = (inputs.operatingProfit / inputs.sales) * 100;
  return [
    `${inputs.company.trim()}, ${market.name}. Annual report of ${on}. Industry: ${industry}.`,
    `From the report: sales ${moneyText(inputs.sales, money)}, operating profit ${moneyText(inputs.operatingProfit, money)} (a margin of ${percent(margin)}), tax rate ${percent(inputs.taxPercent)}, debt ${moneyText(inputs.debt, money)}, cash ${moneyText(inputs.cash, money)}, ${inputs.shares.toLocaleString(locale)} shares, price ${priceText(inputs.price, money)} on ${on}.`,
    `My Estimate: growth ${percent(estimate.growthPercent)} a year for five years, fading to ${percent(estimate.growthAfterPercent)}; the margin heading for ${percent(estimate.targetMarginPercent)}; ${symbol}${estimate.salesToCapital} of sales for each ${symbol}1 invested; cost of capital ${percent(estimate.costOfCapitalPercent)}.`,
    `The engine's value: ${priceText(value.valuePerShare, money)} a share, beside a price of ${priceText(inputs.price, money)} on ${on}.`,
  ].join("\n");
}

/** A saved Own Case as the Notebook lists it. */
export type OwnCaseNote = { id: number; company: string; reportDate: string; note: string; updatedAt: Date };

/** What saving an Own Case gives back: its id, the engine's value and the note; or the reason it could not be valued. */
export type SaveOwnCaseResult = { ok: true; id: number; valuePerShare: number; note: string } | { ok: false; error: string; status: 400 | 403 };

/** Whether this Learner may open the Assignment: they have passed the Spine. */
export async function assignmentOpen(db: Db, map: CourseMap, learnerId: number): Promise<boolean> {
  return spinePassed(map, await loadProgress(db, learnerId));
}

/**
 * Values an Own Case and saves it, with its note, for the Learner. Refused (403) before the Spine is passed; a figure that
 * cannot be valued comes back as the engine's own sentence (400), never a throw.
 */
export async function saveOwnCase(db: Db, map: CourseMap, learnerId: number, inputs: OwnCaseInputs, estimate: OwnCaseEstimate, now: Date = new Date()): Promise<SaveOwnCaseResult> {
  if (!(await assignmentOpen(db, map, learnerId))) return { ok: false, status: 403, error: "The Assignment opens once you pass the Spine." };
  if (!(OWN_CASE_MARKETS as readonly string[]).includes(inputs.market)) return { ok: false, status: 400, error: "Pick the company's market." };
  if (!ownCaseIndustries(inputs.market).some((i) => i.id === inputs.industry)) return { ok: false, status: 400, error: "Pick the company's industry." };
  const value = valueOwnCase(inputs, estimate, now);
  if (!value.ok) return { ok: false, status: 400, error: value.error };
  const note = ownCaseNote(inputs, estimate, value);
  const [row] = await db
    .insert(ownCases)
    .values({ learnerId, company: inputs.company.trim(), market: inputs.market, reportDate: inputs.reportDate, inputs, estimate, note, createdAt: now, updatedAt: now })
    .returning({ id: ownCases.id });
  return { ok: true, id: row.id, valuePerShare: value.valuePerShare, note };
}

/** The Learner's saved Own Case notes, newest first. */
export async function loadOwnCaseNotes(db: Db, learnerId: number): Promise<OwnCaseNote[]> {
  const rows = await db
    .select({ id: ownCases.id, company: ownCases.company, reportDate: ownCases.reportDate, note: ownCases.note, updatedAt: ownCases.updatedAt })
    .from(ownCases)
    .where(and(eq(ownCases.learnerId, learnerId)))
    .orderBy(desc(ownCases.updatedAt), desc(ownCases.id));
  return rows.flatMap((r) => (r.note ? [{ ...r, note: r.note }] : []));
}
