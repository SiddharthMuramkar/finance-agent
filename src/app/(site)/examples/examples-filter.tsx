"use client";

import { useState } from "react";
import { examplesPage } from "@/site/copy";
import { EXAMPLE_FILTERS, EXAMPLES, type ExampleGroup } from "@/site/examples";
import { Button } from "../../primitives";
import { QuestionList } from "../question-list";

// The Examples filter (spec 7.4): chips with counts (All 5, Everyday money 2, The news 1, Real companies 2). Filtering
// hides rows with the `hidden` attribute, so every row stays in the page for search and for a script-free visit.

type Filter = ExampleGroup | "all";

const count = (id: Filter) => (id === "all" ? EXAMPLES.length : EXAMPLES.filter((e) => e.group === id).length);

export function ExamplesFilter() {
  const [filter, setFilter] = useState<Filter>("all");
  const hidden = new Set(filter === "all" ? [] : EXAMPLES.filter((e) => e.group !== filter).map((e) => e.slug));
  return (
    <>
      <div className="v-filter" role="group" aria-label={examplesPage.filter}>
        {EXAMPLE_FILTERS.map((f) => (
          <Button key={f.id} unstyled pressed={filter === f.id} className="v-chip" onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="count">{count(f.id)}</span>
          </Button>
        ))}
      </div>
      <QuestionList examples={EXAMPLES} hidden={hidden} />
    </>
  );
}
