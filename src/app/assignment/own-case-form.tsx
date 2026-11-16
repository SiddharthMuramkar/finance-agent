"use client";

import { useState } from "react";
import { CURRENCY_STYLE } from "@/finance/money";
import { OWN_CASE_MARKETS, openingEstimate, ownCaseMarket, valueOwnCase, type OwnCaseIndustry, type OwnCaseInputs, type OwnCaseMarket } from "@/finance/own-case";
import { annualReportGuide, type GuideField } from "@/markets/guides";
import { readingMonth } from "@/markets/readings";
import { LingoCardView } from "@/widgets/primitives/wave3/lingo-card";
import { dateText, priceText } from "@/widgets/workbench/value-levers-model";
import { Button, TextLink } from "../primitives";

/** How each market's report counts its money (₹ crore; Japan's 百万円 and Korea's 백만원 are millions; Europe's € millions, #115). */
const MONEY_WORDS: Record<OwnCaseMarket, string> = { IN: "₹ crore", JP: "¥ millions (百万円)", KR: "₩ millions (백만원)", EU: "€ millions" };

/** The eight figures copied from the report (spec #68, user story 79), each with what it is and where the money is counted. */
const fieldsFor = (market: OwnCaseMarket) => {
  const money = MONEY_WORDS[market];
  const { symbol, word } = CURRENCY_STYLE[ownCaseMarket(market).currency];
  return [
    { key: "sales", label: "Sales", hint: `Revenue from operations for the year, in ${money}.` },
    { key: "operatingProfit", label: "Operating profit", hint: `Profit before interest and tax (EBIT), in ${money}. Below zero for a loss.` },
    { key: "taxPercent", label: "Tax rate", hint: "The tax rate the company pays, in percent." },
    { key: "debt", label: "Debt", hint: market === "JP" || market === "KR" ? `Borrowings, long and short, in ${money}.` : `Borrowings and lease liabilities, long and short, in ${money}.` },
    { key: "cash", label: "Cash", hint: market === "IN" ? "Cash and cash equivalents, with other bank balances, in ₹ crore." : `Cash and cash equivalents, in ${money}.` },
    { key: "shares", label: "Shares", hint: "The number of shares, as the report prints it." },
    {
      key: "price",
      label: "Share price on the report's date",
      hint:
        market === "IN"
          ? "In ₹, the closing price on that day."
          : market === "EU"
            ? `In ${word[1]} (${symbol}), the closing price on that day.`
            : `In whole ${word[1]} (${symbol}), the closing price on that day, or on the last trading day before it.`,
    },
  ] as const;
};
const FIELD_KEYS = ["sales", "operatingProfit", "taxPercent", "debt", "cash", "shares", "price"] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

/** A typed figure as a number: commas the report prints are fine; an empty box is no number. */
const figure = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/[,\s₹¥₩€]/g, "")));

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
      ...(Object.fromEntries(FIELD_KEYS.map((k) => [k, figure(figures[k])])) as Record<FieldKey, number>),
    };

  const valueIt = () => {
    setSaved(null);
    const typed = inputs();
    if (!typed) return setShown({ kind: "problem", text: "Pick the company's industry." });
    const value = valueOwnCase(typed, openingEstimate(typed.industry, market));
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

  const place = ownCaseMarket(market);
  const money = { currency: place.currency, unit: place.unit } as const;
  const symbol = CURRENCY_STYLE[place.currency].symbol;
  const fields = fieldsFor(market);
  const riskFree = place.riskFree;
  const estimate = industry ? openingEstimate(industry, market) : null;
  const yardsticks = industry ? place.industries.find((i) => i.id === industry)?.source : undefined;
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
                setShown(null);
                setSaved(null);
              }}
            >
              {ownCaseMarket(m).name}
            </Button>
          ))}
        </div>
        {riskFree && (
          <p data-risk-free={riskFree.id} className="text-xs leading-4 text-[var(--muted)]">
            {riskFree.label}: {riskFree.value}% on {dateText(riskFree.date)}.{" "}
            <a data-reading-source href={riskFree.sourceUrl} target="_blank" rel="noreferrer" title={`Credit: ${riskFree.credit}`} className="underline">
              {riskFree.source}
            </a>
            . Your Estimate&rsquo;s growth after year 10 opens here.
          </p>
        )}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-company" className="text-sm font-medium leading-5">
          Company
        </label>
        <input id="own-case-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="field w-full" autoComplete="off" />
        <FieldGuide market={market} field="company" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="own-case-date" className="text-sm font-medium leading-5">
          Date of the annual report
        </label>
        <input id="own-case-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="field w-full" />
        <p className="text-xs leading-4 text-[var(--muted)]">The Own Case is dated here: the year end the report closes on.</p>
        <FieldGuide market={market} field="reportDate" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium leading-5">Industry</legend>
        <div className="flex flex-wrap gap-2">
          {place.industries.map((i) => (
            <Button key={i.id} variant="secondary" size="sm" pressed={industry === i.id} data-industry={i.id} onClick={() => setIndustry(i.id)}>
              {i.label}
            </Button>
          ))}
        </div>
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
            onChange={(e) => setFigures((all) => ({ ...all, [f.key]: e.target.value }))}
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
      {estimate && (
        <p data-own-case-estimate className="text-sm leading-5 text-[var(--muted)]">
          Your Estimate opens at the industry&rsquo;s yardsticks: growth {estimate.growthPercent}% a year for five years, fading to {estimate.growthAfterPercent}%; the
          margin heading for {estimate.targetMarginPercent}%; {symbol}
          {estimate.salesToCapital} of sales for each {symbol}1 invested; cost of capital {estimate.costOfCapitalPercent}%.
          {yardsticks && (
            <>
              {" "}
              Yardsticks of {readingMonth(yardsticks.date)}:{" "}
              <a data-yardstick-source href={yardsticks.sourceUrl} target="_blank" rel="noreferrer" title={`Credit: ${yardsticks.credit}`} className="underline">
                {yardsticks.source}
              </a>
              .
            </>
          )}
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
