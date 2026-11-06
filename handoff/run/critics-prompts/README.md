# Critics

One prompt file per critic, written once, so the same critic judges the same way on every ticket. They are S6 agents: they judge what tests cannot. They never edit anything.

| File | Spec | Tier |
|---|---|---|
| `affordance.md` | §8.1 | sonnet, medium |
| `space.md` | §8.2 | sonnet, medium |
| `colour-liveliness.md` | §8.3 | sonnet, medium |
| `beginner-persona.md` | §8.4 | opus, medium (judge) |
| `math-police.md` | §8.5 | sonnet, medium |
| `historian.md` | §8.6 | sonnet, medium |
| `security.md` | §8.7 | sonnet, medium |
| `final-review.md` | §8.8 | opus, medium (judge) |
| `widget-fit.md` | §8.9 | sonnet on fixtures, opus in the Delight eval |

Each file has the headings Inputs, Rubric, Output, Pass bar and Tier, in that order.

## How a Workflow agent runs a critic
1. Read the critic's file.
2. Pass the inputs it lists as file paths (screenshots, JSON reports, diffs, course files), not pasted text.
3. Set the model to the file's Tier. Judges (Beginner persona and Final review) run on opus, medium, at most 2 judges per workflow run. All other critics run on sonnet, medium.
4. The agent answers with JSON only, in the shape of the file's Output, with no prose.
5. Never SendMessage a running critic. Edit the prompt file or stop and relaunch.

## A finding is not a fix
A finding becomes a fix only after the adversarial-verify rule: a second agent, with a fresh context, is told to refute the finding. It reads the finding and its evidence and tries to show it is wrong. If it fails to refute, the finding is confirmed.

## The 3-vote rule
For high-stakes findings (security, a wrong historical fact, a sum asked, data loss) three agents vote. At least 2 of 3 must fail to refute for the finding to be confirmed.

Confirmed findings become a fix in the current goal loop or, when out of the loop's budget, a `needs-triage` issue. Refuted findings are logged and dropped.
