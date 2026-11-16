"use client";

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useContext, useMemo } from "react";
import { z } from "zod/v4";
import { InsightSettledContext } from "../insight-settled";
import { SavedTicksContext } from "../saved-ticks";
import { DRAWN_BY_CODE } from "./parts";
import { SaveStoryContext } from "./save-story";
import { valuationCase } from "@/finance/valuation-cases";
import { caseListOf, leverSpecs, marketFrom, movesFrom, NO_MOVES, openingSettings, settingsFrom, valueLeversData, valueLeversStories, valueLeversTasks, type LeverSettings, type Moves } from "./value-levers-model";
import { ValueLeversView } from "./value-levers-view";

// The ValueLevers part (spec 2026-11-12, B3): Value levers in the Widget library, so a Widget recipe (value_levers) can
// draw it and the Study Workspace keeps its work like any Widget's. Each lever and the move record are $variables the
// program declares, so the Learner's settings are Widget state (saved, restored, told to the Tutor) and the Things to try
// are saved ticks. Only a recipe draws it (ADR 0010): widgetRuleProblems holds a Workbench part to standing alone. A Spine
// Topic's mode (Appendix D) arrives as a literal prop, parsed by the same function the Widget check uses; in market mode the
// market chosen is one more $variable; in all open mode the story is saved through SaveStoryContext, which the Topic flow
// wires to the Notebook.

// reactive() wraps the schema last: zod's .describe() and .optional() return a copy, and a copy outside reactive() is no
// longer bound to its $variable, so the Learner's settings would never reach Widget state (saved, restored, told to the Tutor).
const leverNumber = (what: string) => reactive(z.number().describe(what));
const optionalNumber = (what: string) => reactive(z.number().describe(what).optional());

export const valueLeversProps = z.object({
  caseId: z.string().describe("A Valuation Case id, such as amazon-dcf-2000"),
  revenue: leverNumber("How big it gets: revenue in year 10, a $variable"),
  margin: leverNumber("What it keeps: the operating margin once mature, in percent, a $variable"),
  salesToCapital: leverNumber("What growth costs: sales for each unit invested, a $variable"),
  risk: leverNumber("How risky: the cost of capital while it grows, in percent, a $variable"),
  failure: leverNumber("Chance it fails, in percent, a $variable"),
  moved: leverNumber("Which levers have moved the value, a $variable starting at 0"),
  mostLever: leverNumber("The lever that has moved it most, a $variable starting at 0"),
  mostBy: leverNumber("By how much, a $variable starting at 0"),
  caseStory: z.string().optional().describe("The name of the Case's own story chip, such as \"Damodaran's story\""),
  priceStory: z
    .object({ revenue: z.number().optional(), margin: z.number().optional(), salesToCapital: z.number().optional(), risk: z.number().optional(), failure: z.number().optional() })
    .nullish()
    .describe("The settings of the story worth the price, shown after the Insight; the engine checks it lands near the price"),
  mode: z.any().optional().describe("A Spine Topic's mode, {kind, ...}, checked by code"),
  market: optionalNumber("In market mode, which market lever 1 is a share of, a $variable starting at 0"),
  caseChoice: optionalNumber("In all open mode with a Case chip, which Case the Learner chose, a $variable starting on the Case named"),
  readings: z.array(z.string()).nullish().describe("Market readings shown beside the levers, by id"),
});

type Props = z.infer<typeof valueLeversProps>;

function ValueLeversPart({ props }: ComponentRenderProps<Props>) {
  // One field per $variable, always in this order.
  const fields = {
    revenue: useStateField("revenue", props.revenue),
    margin: useStateField("margin", props.margin),
    salesToCapital: useStateField("salesToCapital", props.salesToCapital),
    risk: useStateField("risk", props.risk),
    failure: useStateField("failure", props.failure),
  };
  const moveFields = {
    moved: useStateField("moved", props.moved),
    mostLever: useStateField("mostLever", props.mostLever),
    mostBy: useStateField("mostBy", props.mostBy),
  };
  const marketField = useStateField("market", props.market);
  const caseField = useStateField("case", props.caseChoice);
  const settled = useContext(InsightSettledContext);
  const saved = useContext(SavedTicksContext);
  const saveStory = useContext(SaveStoryContext);
  // The Cases the Learner can switch between (all open mode), and which one is chosen: its id drives the block, its label names the saved note.
  const pickable = useMemo(() => caseListOf(props.mode), [props.mode]);
  const chosen = pickable.length ? Math.min(pickable.length - 1, Math.max(0, Math.round(Number(caseField.value) || 0))) : 0;
  const caseId = pickable[chosen]?.id ?? props.caseId;
  // The literal props, as one key, so the Case, the mode and the stories are worked out once per change.
  const key = JSON.stringify([caseId, props.caseStory ?? null, props.priceStory ?? null, props.mode ?? null]);
  const parsed = useMemo(() => {
    const [cid, caseStory, priceStory, mode] = JSON.parse(key) as unknown[];
    return valueLeversData({ caseId: cid, caseStory, priceStory, mode });
  }, [key]);
  const data = "data" in parsed ? parsed.data : null;
  const specs = useMemo(() => (data ? leverSpecs(data.block, data.mode) : []), [data]);
  const stories = useMemo(() => (data ? valueLeversStories(data.block, specs, { caseStory: data.caseStory, priceStory: data.priceStory }, data.mode) : []), [data, specs]);
  if (!data) return <p className="py-2 text-sm text-[var(--muted)]">{"problem" in parsed ? parsed.problem : null}</p>;
  const levers = settingsFrom(
    { revenue: fields.revenue.value, margin: fields.margin.value, salesToCapital: fields.salesToCapital.value, risk: fields.risk.value, failure: fields.failure.value },
    specs,
  );
  const moves = movesFrom({ moved: moveFields.moved.value, mostLever: moveFields.mostLever.value, mostBy: moveFields.mostBy.value });
  const setLevers = (next: LeverSettings) => {
    for (const [id, field] of Object.entries(fields)) if (next[id as keyof LeverSettings] !== field.value) field.setValue(next[id as keyof LeverSettings]);
  };
  const setMoves = (next: Moves) => {
    for (const [id, field] of Object.entries(moveFields)) if (next[id as keyof Moves] !== field.value) field.setValue(next[id as keyof Moves]);
  };
  return (
    <ValueLeversView
      block={data.block}
      levers={levers}
      onLeversChange={setLevers}
      moves={moves}
      onMovesChange={setMoves}
      stories={stories}
      tasks={valueLeversTasks(data.block)}
      ticked={saved?.ticked}
      onTicked={saved?.onTicked}
      insightSettled={settled}
      mode={data.mode}
      market={marketFrom(marketField.value, data.mode)}
      onMarketChange={(next) => marketField.setValue(next)}
      onSaveStory={saveStory ?? undefined}
      caseName={pickable[chosen]?.label}
      cases={pickable.map((c) => c.label)}
      caseChoice={chosen}
      readings={props.readings ?? []}
      onChooseCase={(next) => {
        const target = pickable[next];
        if (!target || next === chosen) return;
        const block = valuationCase(target.id);
        if (block) setLevers(openingSettings(leverSpecs(block, data.mode)));
        setMoves(NO_MOVES);
        caseField.setValue(next);
      }}
    />
  );
}

export const ValueLevers = defineComponent({
  name: "ValueLevers",
  description: DRAWN_BY_CODE("value_levers"),
  props: valueLeversProps,
  component: ValueLeversPart,
});
