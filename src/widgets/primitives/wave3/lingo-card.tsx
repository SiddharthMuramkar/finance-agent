"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { LingoCardView, lingoCardProps } from "./lingo-card-view";

// The LingoCard Widget: the OpenUI wrapper around LingoCardView (./lingo-card-view.tsx), which a view that renders without
// OpenUI (the Full sheet's rows, ADR 0011) draws directly.

export { LingoCardView, lingoCardProps } from "./lingo-card-view";

type Props = Parameters<typeof LingoCardView>[0];

export const LingoCard = defineComponent({
  name: "LingoCard",
  description:
    "One piece of lingo: LingoCard(term, pro, means, example, emoji, inStory). pro is how to say it like a pro (at most 14 words), means at most 20, example at most 20; inStory (optional) turns the card to show the word in the story.",
  props: lingoCardProps,
  component: ({ props }: ComponentRenderProps<Props>) => <LingoCardView {...props} />,
});
