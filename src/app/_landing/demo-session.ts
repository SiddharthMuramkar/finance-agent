// Demo mode only (see demo-mode.ts): a sample Mega Millions conversation for the screenshot on Home.
// It is not Learner data; the real workspace never reads it.

import type { Line } from "../conversation";

const annuity = `root = Widget("What the annuity is worth today", [rate, chart])
$rate = 3.33
rate = Slider("rate", "Discount rate", 0, 10, 0.25, $rate, "percent")
chart = AnnuityChart(1537000000, 30, 5, $rate, "mega-millions-2018/cash-option")`;

const history = `root = Widget("Long-term interest rates around the draw", [history])
history = HistoryChart("mega-millions-2018/treasury-30-year")`;

export const SAMPLE_LINES: Line[] = [
  {
    role: "assistant",
    text: `On 23 October 2018 one ticket in South Carolina matched all six numbers. The advertised jackpot was **$1.537 billion**, paid as 30 yearly instalments that grow 5% a year. Or the winner could take a single cash payment today.

Which would you take, and why? Before you answer, play with the rate below: it is what money could earn elsewhere while you wait for later payments.

\`\`\`openui-lang
${annuity}
\`\`\`

A payment in year 30 is worth far less today than one in year 1, because of everything that money could have earned in between.[1](/passages/799?blocks=3-4)`,
  },
  { role: "user", text: "I'd take the annuity, it adds up to more money." },
  {
    role: "assistant",
    text: `It does add up to more, $1.537 billion against a much smaller cash figure. But adding the payments treats a dollar in 2048 like a dollar in 2018.

Try these in order:
1. Set the rate to 0%. What is the annuity worth today?
2. Move the rate to the 30-year Treasury yield of the day.
3. Find the rate where the annuity and the cash option are worth the same.

Here is where long-term rates actually stood around the draw:

\`\`\`openui-lang
${history}
\`\`\`

**Sources**
1. [Julie Dahlquist and Rainford Knight, Principles of Finance 2e (OpenStax), 16.2](/passages/799?blocks=3-4)`,
  },
];
