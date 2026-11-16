"use client";

import { useState } from "react";
import { OWN_CASE_MARKET, openingEstimate, ownCaseIndustries, ownCaseReadingIds, valueOwnCase, type OwnCaseIndustry, type OwnCaseInputs, type OwnCaseMarket } from "@/finance/own-case";
import { reportGuide, type ReportGuideField } from "@/markets/report-guides";
import { MarketReadingsView } from "@/widgets/market-readings-view";
import { dateText, priceText } from "@/widgets/workbench/value-levers-model";
import { Button, TextLink } from "../primitives";

/** The markets a Learner picks from, by tap. */
const MARKETS: { id: OwnCaseMarket; label: string }[] = [
  { id: "IN", label: "India" },
  { id: "US", label: "United States" },
];

/** How each market's report counts money, for the hints: ₹ crore in India, $ millions in a US 10-K. */
const MONEY_WORDS = { IN: { money: "₹ crore", symbol: "₹", sales: "Revenue from operations", debt: "Borrowings, long and short" }, US: { money: "$ millions", symbol: "$", sales: "Total net sales or revenues", debt: "Commercial paper and term debt" } } as const;

/** The eight figures copied from the report (spec #68, user story 79), each with what it is and where the money is counted. */
const fields = (market: OwnCaseMarket) => {
  const w = MONEY_WORDS[market];
  return [
    { key: "sales", label: "Sales", hint: `${w.sales} for the year, in ${w.money}.` },
    { key: "operatingProfit", label: "Operating profit", hint: `Profit before interest and tax (EBIT), in ${w.money}. Below zero for a loss.` },
    { key: "taxPercent", label: "Tax rate", hint: "The tax rate the company pays, in percent." },
    { key: "debt", label: "Debt", hint: `${w.debt}, in ${w.money}.` },
    { key: "cash", label: "Cash", hint: `Cash and cash equivalents, in ${w.money}.` },
    { key: "shares", label: "Shares", hint: "The number of shares, as the report prints it." },
    { key: "price", label: "Share price on the report's date", hint: `In ${w.symbol}, the closing price on that day.` },
  ] as const;
};
type FieldKey = ReturnType<typeof fields>[number]["key"];

/** A typed figure as a number: commas the report prints are fine; an empty box is no number. */
const figure = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/[,\s₹$]/g, "")));

/** Where a figure sits in the market's annual report, with its source link (#108, #113); nothing for a market with no guide yet. */
function GuideLine({ market, field }: { market: OwnCaseMarket; field: ReportGuideField }) {
  const line = reportGuide(market)?.fields[field];
  if (!line) return null;
  return (
    <p data-guide-line={field} className="text-xs leading-4">
      {line.line}{" "}
      <a href={line.sourceUrl} target="_blank" rel="noreferrer" className="underline">
        {line.source}
      </a>
    </p>
  );
}

type Shown = { kind: "value"; text: string } | { kind: "problem"; text: string } | null;

/**
 * The Own Case form: the one place a Learner types numbers (ADR 0020 narrows ADR 0002). The engine values it on the
 * page; Save writes the one-page note to the Notebook. The industry is a tap, like every question.
 */
export function OwnCaseForm() {
  const [market, setMarket] = useState<OwnCaseMarket>("IN");
  const [company, setCompany] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [industry, setIndustry] = useState<OwnCaseIndustry | null>(null);
  const [figures, setFigures] = useState<Record<FieldKey, string>>({ sales: "", operatingProfit: "", taxPercent: "", debt: "", cash: "", shares: "", price: "" });
  const [shown, setShown] = useState<Shown>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const inputs = (): OwnCaseInputs | null =>
    industry && {
      company,
      market,
      reportDate,
      industry,
      ...(Object.fromEntries(fields(market).map((f) => [f.key, figure(figures[f.key])])) as Record<FieldKey, number>),
    };

  const valueIt = () => {
    setSaved(null);
    const typed = inputs();
    if (!typed) return setShown({ kind: "problem", text: "Pick the company's industry." });
    const value = valueOwnCase(typed, openingEstimate(typed.industry, market));
    const money = OWN_CASE_MARKET[market];
    setShown(
      value.ok
        ? { kind: "value", text: `The engine's value: ${priceText(value.valuePerShare, money)} a share, beside a price of ${priceText(typed.price, money)} on ${dateText(typed.reportDate)}.` }
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
      body: JSON.stringify({ inputs: Object.fromEntries(Object.entries(typed).map(([k, v]) => [k, typeof v === "number" ? json(v) : v])), estimate: openingEstimate(typed.industry, market) }),
    }).catch(() => null);
    setSaving(false);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    if (!response?.ok) return setShown({ kind: "problem", text: body?.error ?? "Could not save. Try again." });
    setSaved("Saved to your Notebook.");
  };

  const estimate = industry ? openingEstimate(industry, market) : null;
  const guide = reportGuide(market);
  const symbol = MONEY_WORDS[market].symbol;
  return (
    <form
      data-own-case-form
      className="flex max-w-[640px] flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        valueIt();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium leading-5">Market</legend>
        <div className="flex flex-wrap gap-2">
          {MARKETS.map((m) => (
            <Button
              key={m.id}
              variant="secondary"
              size="sm"
              pressed={market === m.id}
              data-market={m.id}
              onClick={() => {
                setMarket(m.id);
                setIndustry(null);
                setShown(null);
                setSaved(null);
              }}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </fieldset>
      {guide && (
        <p data-report-guide className="text-sm leading-5">
          {guide.report.where}{" "}
          <a href={guide.report.sourceUrl} target="_blank" rel="noreferrer" className="underline">
            {guide.report.source}
          </a>
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-company" className="text-sm font-medium leading-5">
          Company
        </label>
        <input id="own-case-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="field w-full" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-date" className="text-sm font-medium leading-5">
          Date of the annual report
        </label>
        <input id="own-case-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="field w-full" />
        <p className="text-xs leading-4 text-[var(--muted)]">The Own Case is dated here: the year end the report closes on.</p>
        <GuideLine market={market} field="reportDate" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium leading-5">Industry</legend>
        <div className="flex flex-wrap gap-2">
          {ownCaseIndustries(market).map((i) => (
            <Button key={i.id} variant="secondary" size="sm" pressed={industry === i.id} data-industry={i.id} onClick={() => setIndustry(i.id)}>
              {i.label}
            </Button>
          ))}
        </div>
      </fieldset>
      {industry && <MarketReadingsView ids={ownCaseReadingIds(market, industry)} />}
      {fields(market).map((f) => (
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
          <GuideLine market={market} field={f.key} />
        </div>
      ))}
      {estimate && (
        <p data-own-case-estimate className="text-sm leading-5 text-[var(--muted)]">
          Your Estimate opens at the industry&rsquo;s yardsticks: growth {estimate.growthPercent}% a year for five years, fading to {estimate.growthAfterPercent}%; the
          margin heading for {estimate.targetMarginPercent}%; {symbol}
          {estimate.salesToCapital} of sales for each {symbol}1 invested; cost of capital {estimate.costOfCapitalPercent}%.
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
      {saved && (
        <p data-own-case-saved role="status" className="text-sm leading-5">
          {saved} <TextLink href="/notebook#own-cases">Open the Notebook</TextLink>
        </p>
      )}
    </form>
  );
}
