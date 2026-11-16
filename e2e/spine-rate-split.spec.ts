import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_SCRIPTS, type E2eScriptName } from "../src/dev/e2e-tutor";
import {
  quietDevtools,
  replyLanded,
  script,
  settled,
  signIn,
} from "./support/app";

/**
 * Topic 7 split in two on the Test bed (#91, spec #68 stories 62 and 63): the risk Topic (the cost of equity) and the
 * cost-of-capital Topic each play their first three Tutor Turns in the page, Story, Concept and Explore, with the scripted
 * Tutor (src/dev/e2e-tutor.ts, the `rate-*` and `coc-*` scripts). Each Topic opens its Cost of capital stack at explore,
 * and the cost-of-capital Topic names the WACC at its Concept. The run writes what the critics read: each turn's Learner
 * action, Tutor reply, Widget text and Choices, with a screenshot of each turn at 1280 and 390 px. `CRITICS_OUT` names
 * the folder to write it in (default: the test's output folder).
 */

const TURN_MS = 120_000;
const plain = (text: string) => text.replace(/\s+/g, " ").trim();

type Seen = {
  turn: number;
  learner: string;
  script: string;
  tutor: string;
  widget: string;
  choices: string[];
  shots: string[];
};

type Play = {
  topic: string;
  title: RegExp;
  seed: string;
  turns: [E2eScriptName, E2eScriptName, E2eScriptName];
};

const PLAYS: Play[] = [
  {
    topic: "spine-07-risk",
    title: /what return should shareholders require/i,
    seed: "spine-07-start",
    turns: ["rate-story", "rate-concept", "rate-explore"],
  },
  {
    topic: "spine-cost-of-capital",
    title: /what does all of a company's money cost/i,
    seed: "spine-coc-start",
    turns: ["coc-story", "coc-concept", "coc-explore"],
  },
];

/** The first sentence of a script's words, which the reply on the page must hold if the reply checks let it through. */
const firstSentence = (name: E2eScriptName) => {
  const replies = E2E_SCRIPTS[name].replies as {
    content?: { type: string; text?: string }[];
  }[];
  const words = replies
    .flatMap((r) => r.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n\n");
  return plain(words.split(/(?<=[.!?])\s/)[0]);
};

async function seedAt(page: Page, state: string) {
  await quietDevtools(page);
  await signIn(page);
  const response = await page.request.post("/api/dev-e2e", { data: { state } });
  expect(response.status(), `seed ${state}: ${await response.text()}`).toBe(
    200,
  );
}

/** Presses the Next chip with the scripted Tutor set to `name`, and waits for its reply; returns the chip's words. */
async function next(page: Page, name: E2eScriptName): Promise<string> {
  await script(page, name);
  const chip = page.getByTestId("next-chip").last();
  await expect(chip).toBeVisible({ timeout: TURN_MS });
  const label = plain(await chip.innerText());
  const before = await page.getByTestId("assistant-message").count();
  await chip.click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, {
    timeout: TURN_MS,
  });
  await settled(page, TURN_MS);
  return label;
}

/** What the Learner sees after a turn, with a screenshot at 1280 and at 390 px. */
async function seen(
  page: Page,
  out: string,
  play: Play,
  n: number,
  learner: string,
  name: E2eScriptName,
): Promise<Seen> {
  const reply = page
    .getByTestId("assistant-message")
    .filter({ hasText: firstSentence(name).slice(0, 60) })
    .last();
  await expect(reply, name).toBeVisible({ timeout: TURN_MS });
  // At explore the Workbench draws after the reply lands: wait for its headline, so the screenshots show it.
  if (name.endsWith("-explore"))
    await expect(
      page.getByText(/The cost of (capital|equity) is/).first(),
    ).toBeVisible({ timeout: TURN_MS });
  await settled(page, TURN_MS);
  const choices = page.getByTestId("choices").last().getByTestId("choice");
  const card = page
    .locator(
      '[data-testid="widget-pane"], [data-testid="widget-column"], [data-testid="widget-card"]',
    )
    .first();
  const shots: string[] = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    const file = `${play.topic}-turn${n}-${width}.png`;
    // Screenshots only for a critics' run or under SHOTS (Z1).
    if (process.env.SHOTS || process.env.CRITICS_OUT) {
      await page.screenshot({ path: join(out, file), fullPage: false });
      shots.push(file);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  return {
    turn: n,
    learner,
    script: name,
    tutor: (await reply.innerText())
      .replace(/^Tutor\s+/, "")
      .replace(/\s+Save to Notebook\s*$/, "")
      .trim(),
    widget: (await card.count()) ? (await card.innerText()).trim() : "",
    choices: (await choices.count()) ? await choices.allInnerTexts() : [],
    shots,
  };
}

const markdown = (play: Play, turns: Seen[]) =>
  [
    `# ${play.topic}: three scripted turns (seed ${play.seed}, scripted Tutor, no paid calls)`,
    ...turns.map(
      (t) =>
        `## Turn ${t.turn} (script ${t.script})\n\n**Learner:** ${t.learner}\n\n**Tutor:**\n${t.tutor}\n\n**Widget:**\n${t.widget || "(none)"}\n\n**Choices:** ${t.choices.join(" | ") || "(none)"}\n\n**Screenshots:** ${t.shots.join(", ")}`,
    ),
  ].join("\n\n") + "\n";

for (const play of PLAYS) {
  test(`[#91] ${play.topic}: Story, Concept and Explore play on the Test bed, with the Cost of capital stack at explore`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "w1280",
      "one run takes both widths itself",
    );
    test.setTimeout(600_000);
    const out = process.env.CRITICS_OUT ?? info.outputPath("critics");
    mkdirSync(out, { recursive: true });

    await seedAt(page, play.seed);
    await script(page, play.turns[0]);
    await page.goto("/study");
    await replyLanded(page);
    await expect(page.getByTestId("topic-bar")).toContainText(play.title);
    const turns: Seen[] = [
      await seen(page, out, play, 1, "[opened the Topic]", play.turns[0]),
    ];

    const concept = await next(page, play.turns[1]);
    turns.push(
      await seen(page, out, play, 2, `[tapped] ${concept}`, play.turns[1]),
    );
    const explore = await next(page, play.turns[2]);
    turns.push(
      await seen(page, out, play, 3, `[tapped] ${explore}`, play.turns[2]),
    );

    writeFileSync(
      join(out, `transcript-${play.topic}.md`),
      markdown(play, turns),
    );
    writeFileSync(
      join(out, `transcript-${play.topic}.json`),
      JSON.stringify({ seed: play.seed, topic: play.topic, turns }, null, 2),
    );

    // The Cost of capital stack opens at explore, led by the Topic's idea (Spine critics on #91): the cost of equity and the
    // story's betas in the risk Topic, the share of debt first in the cost-of-capital Topic. Both show who puts in the money.
    const stack = page.getByTestId("wacc-stack").last();
    await expect(
      stack.getByTestId("wacc-stack-funder-shareholders"),
    ).toBeVisible({ timeout: TURN_MS });
    await expect(stack.getByTestId("wacc-stack-funder-lenders")).toBeVisible();
    for (const t of turns)
      expect(t.tutor, t.script).not.toMatch(/how far does/i);
    if (play.topic === "spine-cost-of-capital") {
      await expect(stack.getByTestId("wacc-stack-headline")).toContainText(
        "The cost of capital is 9.61%",
      );
      await expect(stack.getByRole("button", { name: "No debt" })).toBeVisible();
      expect(turns[1].tutor).toContain("Analysts call this blend the WACC");
      expect(turns[2].tutor).toContain("as risky as an average share");
      expect(turns[2].widget).toContain("Lenders: 15%, cost 4.55%");
    } else {
      await expect(stack.getByTestId("wacc-stack-headline")).toContainText(
        "The cost of equity is 12.9%",
      );
      await expect(stack.getByRole("button", { name: "2.29, his measure" })).toBeVisible();
      expect(turns[1].tutor).toContain("he trusts the steadier 1.60");
      expect(turns.map((t) => t.tutor).join(" ")).not.toMatch(/\bWACC\b/);
    }
  });
}
