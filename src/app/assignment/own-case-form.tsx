"use client";

import { useState } from "react";
import { CURRENCY_STYLE } from "@/finance/money";
import { OWN_CASE_MARKETS, openingEstimate, ownCaseMarket, ownCaseReadingIds, readFigure, readingsAfterReport, valueOwnCase, type OwnCaseEstimate, type OwnCaseIndustry, type OwnCaseInputs, type OwnCaseMarket } from "@/finance/own-case";
import { OPTIONS_NOT_ENTERED, ownCaseValueLine } from "@/learner/own-case-words";
import { annualReportGuide, type GuideField } from "@/markets/guides";
import { ownCaseRangeInputs, rangeCheck, type RangeFlag } from "@/markets/range-check";
import { marketReading, readingMonth, type MarketReading } from "@/markets/readings";
import { MarketReadingsView } from "@/widgets/market-readings-view";
import { LingoCardView } from "@/widgets/primitives/wave3/lingo-card";
import { RangeCheckView } from "@/widgets/range-check-view";
import { dateText } from "@/widgets/workbench/value-levers-model";
import { Button, TextLink } from "../primitives";
import { OwnCaseFullSheet } from "./own-case-full-sheet";

/** How each market's report counts its money (₹ crore; a US 10-K's $ millions; Japan's 百万円 and Korea's 백만원 are millions; Europe's € millions, #115). */
const MONEY_WORDS: Record<OwnCaseMarket, string> = { IN: "₹ crore", US: "$ millions", JP: "¥ millions (百万円)", KR: "₩ millions (백만원)", EU: "€ millions" };

/** A market's name on its button: "United States" where a sentence says "the US". */
const marketLabel = (m: OwnCaseMarket) => (m === "US" ? "United States" : ownCaseMarket(m).name);

/** The eight figures copied from the report (spec #68, user story 79), each with what it is and where the money is counted. */
const fieldsFor = (market: OwnCaseMarket) => {
  const money = MONEY_WORDS[market];
  const { symbol, word } = CURRENCY_STYLE[ownCaseMarket(market).currency];
  return [
    { key: "sales", label: "Sales", hint: `${market === "US" ? "Total net sales or revenues" : "Revenue from operations"} for the year, in ${money}.` },
    { key: "operatingProfit", label: "Operating profit", hint: `Profit before interest and tax (EBIT), in ${money}. Below zero for a loss.` },
    {
      key: "taxPercent",
      label: "Tax rate",
      hint:
        market === "US"
          ? "The rate the law sets for the company's profit, federal and state together (about 25%), not tax paid over profit, in percent."
          : "The rate the law sets for the company's profit, as the tax note names it (not tax paid over profit), in percent.",
    },
    // Every market counts leases as debt (M05, G10), the US's ASC 842 lease liabilities too.
    { key: "debt", label: "Debt", hint: `Borrowings and lease liabilities, long and short, in ${money}.` },
    { key: "cash", label: "Cash", hint: market === "IN" ? "Cash and cash equivalents, with other bank balances, in ₹ crore." : `Cash and cash equivalents, in ${money}.` },
    { key: "shares", label: "Shares", hint: "The full number of shares, one by one: a report that counts them in millions or thousands is multiplied out." },
    {
      key: "price",
      label: "Share price on the report's date",
      // One fallback day in every market (L03): a day before the report's date could not know its figures.
      hint:
        market === "IN"
          ? "In ₹, the closing price on that day, or on the next trading day if the market was shut."
          : market === "EU" || market === "US"
            ? `In ${word[1]} (${symbol}), the closing price on that day, or on the next trading day if the market was shut.`
            : `In whole ${word[1]} (${symbol}), the closing price on that day, or on the next trading day if the market was shut.`,
    },
  ] as const;
};
const FIELD_KEYS = ["sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

/** When the Own Case is dated: the day the year's figures became public, never the year end before them (the past-only rule). */
const DATE_HINT: Record<OwnCaseMarket, string> = {
  IN: "The Own Case is dated here: the day the Board approved the statements, when the year's figures became public. Not the year end: nobody knew the figures then.",
  US: "The Own Case is dated here: the day the 10-K was filed on EDGAR, when its figures were public. Not the fiscal year end: nobody knew the figures then.",
  JP: "The Own Case is dated here: the day the report was filed, when its figures were public. Not the year end: nobody knew the figures then.",
  KR: "The Own Case is dated here: the day the report was filed, when its figures were public. Not the year end: nobody knew the figures then.",
  EU: "The Own Case is dated here: the day the annual financial report was published, when its figures were public. Not the year end: nobody knew the figures then.",
};

/** Beside a field: where it sits in the market's annual report, the source that says so, and a Lingo card (#108, #114, #115). */
function FieldGuide({ market, field }: { market: OwnCaseMarket; field: GuideField }) {
  const line = annualReportGuide(market)[field];
  if (!line) return null;
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

type Shown = { kind: "value"; text: string; flags: RangeFlag[] } | { kind: "problem"; text: string } | null;

/** What each yardstick's link says, in the estimate line (G21: each yardstick links its own sheet, not one for all three). */
const yardstickWords = (r: MarketReading, symbol: string) =>
  r.kind === "operating_margin" ? "margin" : r.kind === "sales_to_capital" ? `sales for each ${symbol}1 invested` : r.kind === "cost_of_capital" ? "cost of capital" : r.label;

/** The readings dated after the report's date, in words (G17): "the 10-year US Treasury yield (US) of 30 Oct 2026 and the industry's yardsticks of Jan 2026". */
function laterReadingsWords(later: MarketReading[]): string {
  const riskFree = later.filter((r) => r.kind === "risk_free").map((r) => `the ${r.label} of ${dateText(r.date)}`);
  const yardsticks = later.filter((r) => r.kind !== "risk_free");
  const months = [...new Set(yardsticks.map((r) => readingMonth(r.date)))];
  const parts = [...riskFree, ...(yardsticks.length ? [`the industry's yardsticks of ${months.join(" and ")}`] : [])];
  return parts.join(" and ");
}

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
  // The Own Case last valued, for Go deeper's Full sheet (#111); a new valuation opens a fresh sheet.
  const [valued, setValued] = useState<{ inputs: OwnCaseInputs; estimate: OwnCaseEstimate; at: number } | null>(null);

  // G15: what was valued is what is saved. Any edit after Value it clears the result, so Save never stores figures the
  // screen did not value; Save sends the valued inputs and Estimate, not the boxes.
  const edited = () => {
    setShown(null);
    setSaved(null);
    setValued(null);
  };

  const inputs = (): OwnCaseInputs | null =>
    industry && {
      company,
      market,
      reportDate,
      industry,
      ...(Object.fromEntries(FIELD_KEYS.map((k) => [k, readFigure(figures[k])])) as Record<FieldKey, number>),
    };

  const valueIt = () => {
    setSaved(null);
    const typed = inputs();
    if (!typed) return setShown({ kind: "problem", text: "Pick the company's industry." });
    const estimate = openingEstimate(typed.industry, market);
    const value = valueOwnCase(typed, estimate);
    setValued((prev) => (value.ok ? { inputs: typed, estimate, at: (prev?.at ?? 0) + 1 } : null)); // a new key for each valuing remounts the Full sheet
    setShown(
      value.ok
        ? {
            kind: "value",
            text: ownCaseValueLine(value.valuePerShare, typed.price, typed.reportDate, money, typed.debt),
            // The range check (#109): the margin as typed, and the Estimate, each held to the industry's dated yardstick.
            flags: rangeCheck(ownCaseRangeInputs(typed, estimate), { market, industry: typed.industry }),
          }
        : { kind: "problem", text: value.error },
    );
  };

  const save = async () => {
    if (!valued) return;
    const { inputs: typed, estimate } = valued;
    setSaving(true);
    const json = (n: number) => (Number.isFinite(n) ? n : null);
    const response = await fetch("/api/own-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: Object.fromEntries(Object.entries(typed).map(([k, v]) => [k, typeof v === "number" ? json(v) : v])), estimate }),
    }).catch(() => null);
    setSaving(false);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    if (!response?.ok) return setShown({ kind: "problem", text: body?.error ?? "Could not save. Try again." });
    setSaved("Saved to your Notebook.");
  };

  const place = ownCaseMarket(market);
  const money = { currency: place.currency, unit: place.unit } as const;
  const symbol = CURRENCY_STYLE[place.currency].symbol;
  const fields = fieldsFor(market);
  const riskFree = place.riskFree;
  const estimate = industry ? openingEstimate(industry, market) : null;
  const yardsticks = industry ? ownCaseReadingIds(market, industry).flatMap((id) => marketReading(id) ?? []) : [];
  const later = industry ? readingsAfterReport(market, industry, reportDate) : [];
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
          {OWN_CASE_MARKETS.map((m) => (
            <Button
              key={m}
              variant="secondary"
              size="sm"
              pressed={market === m}
              data-market={m}
              onClick={() => {
                setMarket(m);
                setIndustry(null);
                edited();
              }}
            >
              {marketLabel(m)}
            </Button>
          ))}
        </div>
        {riskFree && (
          <p data-risk-free={riskFree.id} className="text-xs leading-4 text-[var(--muted)]">
            {riskFree.label}: {riskFree.value}% on {dateText(riskFree.date)}.{" "}
            <a data-reading-source href={riskFree.sourceUrl} target="_blank" rel="noreferrer" className="underline">
              {riskFree.source}
            </a>
            . <span data-reading-credit>Credit: {riskFree.credit}.</span> Your Estimate&rsquo;s growth after year 10 opens here.
          </p>
        )}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-company" className="text-sm font-medium leading-5">
          Company
        </label>
        <input id="own-case-company" type="text" value={company} onChange={(e) => {
            setCompany(e.target.value);
            edited();
          }} className="field w-full" autoComplete="off" />
        <FieldGuide market={market} field="company" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-date" className="text-sm font-medium leading-5">
          Date of the annual report
        </label>
        <input id="own-case-date" type="date" value={reportDate} onChange={(e) => {
            setReportDate(e.target.value);
            edited();
          }} className="field w-full" />
        <p className="text-xs leading-4 text-[var(--muted)]">{DATE_HINT[market]}</p>
        <FieldGuide market={market} field="reportDate" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium leading-5">Industry</legend>
        <div className="flex flex-wrap gap-2">
          {place.industries.map((i) => (
            <Button key={i.id} variant="secondary" size="sm" pressed={industry === i.id} data-industry={i.id} onClick={() => {
                setIndustry(i.id);
                edited();
              }}>
              {i.label}
            </Button>
          ))}
        </div>
        <FieldGuide market={market} field="industry" />
      </fieldset>
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label htmlFor={`own-case-${f.key}`} className="text-sm font-medium leading-5">
            {f.label}
          </label>
          <input
            id={`own-case-${f.key}`}
            data-own-case-field={f.key}
            inputMode="decimal"
            value={figures[f.key]}
            onChange={(e) => {
              setFigures((all) => ({ ...all, [f.key]: e.target.value }));
              edited();
            }}
            aria-describedby={`own-case-${f.key}-hint`}
            className="field w-full tabular-nums"
            autoComplete="off"
          />
          <p id={`own-case-${f.key}-hint`} className="text-xs leading-4 text-[var(--muted)]">
            {f.hint}
          </p>
          <FieldGuide market={market} field={f.key} />
        </div>
      ))}
      {industry && <MarketReadingsView ids={ownCaseReadingIds(market, industry)} />}
      <p data-own-case-options className="text-xs leading-4 text-[var(--muted)]">
        {OPTIONS_NOT_ENTERED}
      </p>
      {estimate && (
        <p data-own-case-estimate className="text-sm leading-5 text-[var(--muted)]">
          Your Estimate opens at the industry&rsquo;s yardsticks: growth {estimate.growthPercent}% a year for five years, fading to {estimate.growthAfterPercent}%; the
          margin heading for {estimate.targetMarginPercent}%; {symbol}
          {estimate.salesToCapital} of sales for each {symbol}1 invested; cost of capital {estimate.costOfCapitalPercent}%.
          {yardsticks.length > 0 && (
            <>
              {" "}
              Yardsticks of {readingMonth(yardsticks[0].date)}, each from its own sheet:{" "}
              {yardsticks.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  <a data-yardstick-source={r.kind} href={r.sourceUrl} target="_blank" rel="noreferrer" title={r.source} className="underline">
                    {yardstickWords(r, symbol)}
                  </a>
                </span>
              ))}
              . <span data-yardstick-credit>Credit: {[...new Set(yardsticks.map((r) => r.credit))].join(", ")}.</span>
            </>
          )}
        </p>
      )}
      {later.length > 0 && (
        <p data-own-case-later-readings className="text-sm leading-5 text-[var(--muted)]">
          Dated after your report&rsquo;s date ({dateText(reportDate)}): {laterReadingsWords(later)}. Nobody knew them on that day, so your Estimate opens at
          figures from after the price.
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
      {shown?.kind === "value" && <RangeCheckView flags={shown.flags} />}
      {shown?.kind === "value" && valued && <OwnCaseFullSheet key={valued.at} inputs={valued.inputs} estimate={valued.estimate} />}
      {saved && (
        <p data-own-case-saved role="status" className="text-sm leading-5">
          {saved} <TextLink href="/notebook#own-cases">Open the Notebook</TextLink>
        </p>
      )}
    </form>
  );
}
