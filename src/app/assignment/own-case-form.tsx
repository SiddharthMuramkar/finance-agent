"use client";

import { useState } from "react";
import { INDIA_INDUSTRIES, openingEstimate, valueOwnCase, type OwnCaseEstimate, type OwnCaseIndustry, type OwnCaseInputs } from "@/finance/own-case";
import { annualReportGuide, type GuideField } from "@/markets/guides";
import { LingoCardView } from "@/widgets/primitives/wave3/lingo-card";
import { dateText, priceText } from "@/widgets/workbench/value-levers-model";
import { Button, TextLink } from "../primitives";
import { OwnCaseFullSheet } from "./own-case-full-sheet";

/** The eight figures copied from the report (spec #68, user story 79), each with what it is and where the money is counted. */
const FIELDS = [
  { key: "sales", label: "Sales", hint: "Revenue from operations for the year, in ₹ crore." },
  { key: "operatingProfit", label: "Operating profit", hint: "Profit before interest and tax (EBIT), in ₹ crore. Below zero for a loss." },
  { key: "taxPercent", label: "Tax rate", hint: "The tax rate the company pays, in percent." },
  { key: "debt", label: "Debt", hint: "Borrowings and lease liabilities, long and short, in ₹ crore." },
  { key: "cash", label: "Cash", hint: "Cash and cash equivalents, with other bank balances, in ₹ crore." },
  { key: "shares", label: "Shares", hint: "The number of shares, as the report prints it." },
  { key: "price", label: "Share price on the report's date", hint: "In ₹, the closing price on that day." },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const RUPEES = { currency: "INR", unit: "crores" } as const;
/** A typed figure as a number: commas the report prints are fine; an empty box is no number. */
const figure = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/[,\s₹]/g, "")));

/** Where each field sits in an Indian annual report (#108): the guide line, its source and a Lingo card. */
const GUIDE = annualReportGuide("IN");

/** The guide beside one field: where the number sits, the rule or record that says so, and its word as a Lingo card. */
function FieldGuide({ field }: { field: GuideField }) {
  const line = GUIDE[field];
  return (
    <div data-own-case-guide={field} className="text-xs leading-4 text-[var(--muted)]">
      <p data-guide-where>
        <span className="font-medium">In the annual report: </span>
        {line.where}{" "}
        <a data-guide-source href={line.sourceUrl} target="_blank" rel="noreferrer" className="underline">
          Source: {line.source}
        </a>
      </p>
      <details data-guide-lingo className="mt-1">
        <summary className="cursor-pointer">Lingo: {line.lingo.term}</summary>
        <LingoCardView {...line.lingo} />
      </details>
    </div>
  );
}

type Shown = { kind: "value"; text: string } | { kind: "problem"; text: string } | null;

/**
 * The Own Case form: the one place a Learner types numbers (ADR 0020 narrows ADR 0002). The engine values it on the
 * page; Save writes the one-page note to the Notebook. The industry is a tap, like every question.
 */
export function OwnCaseForm() {
  const [company, setCompany] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [industry, setIndustry] = useState<OwnCaseIndustry | null>(null);
  const [figures, setFigures] = useState<Record<FieldKey, string>>({ sales: "", operatingProfit: "", taxPercent: "", debt: "", cash: "", shares: "", price: "" });
  const [shown, setShown] = useState<Shown>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  // The Own Case last valued, for Go deeper's Full sheet (#111); a new valuation opens a fresh sheet.
  const [valued, setValued] = useState<{ inputs: OwnCaseInputs; estimate: OwnCaseEstimate; at: number } | null>(null);

  const inputs = (): OwnCaseInputs | null =>
    industry && {
      company,
      market: "IN",
      reportDate,
      industry,
      ...(Object.fromEntries(FIELDS.map((f) => [f.key, figure(figures[f.key])])) as Record<FieldKey, number>),
    };

  const valueIt = () => {
    setSaved(null);
    const typed = inputs();
    if (!typed) return setShown({ kind: "problem", text: "Pick the company's industry." });
    const estimate = openingEstimate(typed.industry);
    const value = valueOwnCase(typed, estimate);
    setValued(value.ok ? { inputs: typed, estimate, at: Date.now() } : null);
    setShown(
      value.ok
        ? { kind: "value", text: `The engine's value: ${priceText(value.valuePerShare, RUPEES)} a share, beside a price of ${priceText(typed.price, RUPEES)} on ${dateText(typed.reportDate)}.` }
        : { kind: "problem", text: value.error },
    );
  };

  const save = async () => {
    const typed = inputs();
    if (!typed) return;
    setSaving(true);
    const json = (n: number) => (Number.isFinite(n) ? n : null);
    const response = await fetch("/api/own-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: Object.fromEntries(Object.entries(typed).map(([k, v]) => [k, typeof v === "number" ? json(v) : v])), estimate: openingEstimate(typed.industry) }),
    }).catch(() => null);
    setSaving(false);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    if (!response?.ok) return setShown({ kind: "problem", text: body?.error ?? "Could not save. Try again." });
    setSaved("Saved to your Notebook.");
  };

  const estimate = industry ? openingEstimate(industry) : null;
  return (
    <form
      data-own-case-form
      className="flex max-w-[640px] flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        valueIt();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-company" className="text-sm font-medium leading-5">
          Company
        </label>
        <input id="own-case-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="field w-full" autoComplete="off" />
        <FieldGuide field="company" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-date" className="text-sm font-medium leading-5">
          Date of the annual report
        </label>
        <input id="own-case-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="field w-full" />
        <p className="text-xs leading-4 text-[var(--muted)]">The Own Case is dated here: the year end the report closes on.</p>
        <FieldGuide field="reportDate" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium leading-5">Industry</legend>
        <div className="flex flex-wrap gap-2">
          {INDIA_INDUSTRIES.map((i) => (
            <Button key={i.id} variant="secondary" size="sm" pressed={industry === i.id} data-industry={i.id} onClick={() => setIndustry(i.id)}>
              {i.label}
            </Button>
          ))}
        </div>
      </fieldset>
      {FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label htmlFor={`own-case-${f.key}`} className="text-sm font-medium leading-5">
            {f.label}
          </label>
          <input
            id={`own-case-${f.key}`}
            data-own-case-field={f.key}
            inputMode="decimal"
            value={figures[f.key]}
            onChange={(e) => setFigures((all) => ({ ...all, [f.key]: e.target.value }))}
            aria-describedby={`own-case-${f.key}-hint`}
            className="field w-full tabular-nums"
            autoComplete="off"
          />
          <p id={`own-case-${f.key}-hint`} className="text-xs leading-4 text-[var(--muted)]">
            {f.hint}
          </p>
          <FieldGuide field={f.key} />
        </div>
      ))}
      {estimate && (
        <p data-own-case-estimate className="text-sm leading-5 text-[var(--muted)]">
          Your Estimate opens at the industry&rsquo;s yardsticks: growth {estimate.growthPercent}% a year for five years, fading to {estimate.growthAfterPercent}%; the
          margin heading for {estimate.targetMarginPercent}%; ₹{estimate.salesToCapital} of sales for each ₹1 invested; cost of capital {estimate.costOfCapitalPercent}%.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary">
          Value it
        </Button>
        {shown?.kind === "value" && (
          <Button variant="secondary" loading={saving} onClick={() => void save()}>
            Save to Notebook
          </Button>
        )}
      </div>
      {shown && (
        <p data-own-case-result={shown.kind} role={shown.kind === "problem" ? "alert" : "status"} className={`text-sm leading-5 ${shown.kind === "problem" ? "text-[var(--danger)]" : "font-semibold"}`}>
          {shown.text}
        </p>
      )}
      {shown?.kind === "value" && valued && <OwnCaseFullSheet key={valued.at} inputs={valued.inputs} estimate={valued.estimate} />}
      {saved && (
        <p data-own-case-saved role="status" className="text-sm leading-5">
          {saved} <TextLink href="/notebook#own-cases">Open the Notebook</TextLink>
        </p>
      )}
    </form>
  );
}
