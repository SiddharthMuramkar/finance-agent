> Throwaway research branch for wayfinder ticket #30. Never merged. No code changes.

# Research: Split `runLockedTurn` before the caps and widget events land? (ticket #30)

> Read from the code at `origin/main` 42df944 (2026-11-14) and from the resolution comments of #13, #10, #5, the brief of #16 (still open) and the body of #23. All line numbers are in `src/tutor/turn.ts` unless another file is named.

## Question

`runLockedTurn` is lines 538–1375 of the 1,407-line `src/tutor/turn.ts`. Three decided changes land near it: the quota check before `startTurn` (#13), the daily Tutor cap (#10) and the `widgetCall` turn input (#16, through #5's `onAction` door). Must we split it before the production-hardening PR (#23)?

## Short answer

1. **Do not split first. Hardening does not need to wait.**
2. Only one change goes inside `runLockedTurn`: the **step limit** (10 steps per turn). It touches 4–5 places, about 20–30 lines.
3. The other changes go **before the lock**, in `runTutorTurn` (lines 326–449). These are the daily quota, the resume limit and the `widgetCall` input. #13's resolution says #10's "daily Tutor cap" **is** #13's part-2 cap, so it is the same code. `runLockedTurn` needs 1–3 lines for `widgetCall`.
4. **Recommendation: a narrow split during hardening.** Commit 1 of the hardening PR moves the pre-lock checks into a **Turn admission** module, with no change in behaviour. Then the quota and the resume refusal go into that module. Build the step limit as a small **Step ledger** module, not as more closure code.
5. Do not change the draft, reply-gate or after-reply stages before the beta.

## Words used here (STE)

- **Turn, run, step**: as in #13. A turn is one reply that the Learner asks for. A resume starts a new run of the same turn. A step is one model call.
- **Lock**: the one `running` row in `turns` for each Learner (`startTurn`, `src/tutor/turn-status.ts` 141–145).
- **Closure state**: a variable that `runLockedTurn` declares with `let`. Its nested helper functions read and change it.
- **Module, interface, seam, adapter, depth**: from the `codebase-design` skill. A seam is the place where a module's interface lives. Depth is how much behaviour a caller gets for each thing it must learn.

## What `runLockedTurn` does (call tree)

```
runTutorTurn (326–487)            admission + lifecycle; NOT runLockedTurn
├─ stale-tab check (334–346)
├─ input kind → code note (347–391)        9 input kinds
├─ claim the lock: startTurn | resumeTurn (392–396) → "busy"
├─ after the claim (398–444): Next taken, quiz ladder, Quick-try note, paste; dropTurn on a refusal
├─ already finished → finishedTurnReplay (445–449)
└─ run + settle (450–486): watchForStop, timed(runLockedTurn), status finished | cut_off | failed

runLockedTurn (538–1375)
1. Setup (546–615): healing client, ToolEffects, step numbering (stepNo, saveStep 580–588), resume check
2. Prepare the request, one of two paths
   2a. Resume (616–628): reload Session and log, facts, own-question, replay, repair tool calls
   2b. New (629–752): Topic and Session (legacy, refreeze), facts, context, open-Widget block,
       Widget notes, quiz and Quick-try notes, stands block, append the messages, step-entry items,
       refreeze fold (689, saved as a step at 693)
3. Draft (753–983): live (streamed, guard) or held; loop() 841–974 = runTools + stream + citations
   + saveStep per step + Stop / cut-off / guard handling
4. Reply gate (985–1271): judgeNow, storeFixed, fallBack; paths for Stop, refusal, live, held
   (held: one retry = loop() again, judge again, else fallback)
5. After the reply (1272–1340): Quick try again, Choices, refusal / cut-short / stopped notice,
   follow-up items, Companion Widget (1114–1159, 1330–1337), Topic complete card
6. Send (1342–1344)
7. Record + settle (1346–1374): saveReplyCheck, compaction (1166–1184, 1370), saveTurnTotal, "done"
```

Facts that make it hard to cut:

- 28 function-level `let` variables (for example `session`, `log`, `turnSeq`, `stepNo`, `ownQ`, `stopReason`, `replyFrom`, `retried`, `toSend`).
- 12 nested helpers share them: `repairToolCalls`, `reportSaveFailure`, `refreezeFold`, `foldHistory`, `loop`, `rejectReply`, `answerTruncated`, `judgeNow`, `storeFixed`, `fallBack`, `companionWidget`, `compactSession`.
- It is an async generator. The order of events is part of its contract: items before text, held events after the checks, "stopped" before "done".

## Where each change goes

| Change | Source | Where it lands | Lines in `runLockedTurn` |
|---|---|---|---|
| Daily quota per Learner (120 turns, $5) and global $30/day | #13 part 2 | `runTutorTurn`, just before `startTurn` (line 392), new turns only. New `src/tutor/quota.ts`. New `over_quota` event in `TurnEvent` (103–154). Route answers 429, next to its 409s (`src/app/api/turn/route.ts` 75–77). | 0 |
| Daily Tutor cap | #10 | The same code as the row above (#13 resolution). | 0 |
| Resume limit (2 per turn) | #13 part 1 | `resumeTurn` (`src/tutor/turn-status.ts` 154–171) and a new `runs` column. `runTutorTurn` 392–396 must tell "busy" from "resume limit". | 0 |
| Step limit (10 per turn, all runs) | #13 part 1 | `stepNo`/`saveStep` (580–588); the runner start in `loop()` (845); the retry condition (1236); the fold step (693); compaction (1178). Also `src/tutor/runner.ts` (stop at the limit; the last step calls no tool), `StepRequest` in `src/tutor/model.ts` (113–120, needs a tool-choice field) and `src/tutor/openai.ts`. | about 20–30 |
| `widgetCall` turn input | #16 brief, #5 resolution | `TurnInput` (196–209); a branch next to `widgetReport` (356–363); `src/tutor/turn-body.ts`; a new prefix and `TurnKind` in `src/tutor/turn-status.ts`; `widgetCallNote` in `src/tutor/widget-context.ts`. "A call during a running turn rides along, with no error" changes the busy branch (392–396). | 1–3: the comment at 632, and probably a guard in `companionWidget` (1123) so a widget-call reply gets no Companion Widget. The code-note path (634–635) and the own-question check (`isCodeWritten`, `src/tutor/reply-choices.ts` 55) already work for a new prefix. |

**A trap in the step limit.** `compose_widget` saves its step from inside a tool run (`src/tutor/tools.ts` 824–828, through `effects.saveStep`). That happens while the runner is in its loop. #13's brief says to give each runner "S minus the steps already saved" when it starts. A fixed number does not see a `compose_widget` step that is saved later in the same runner. So the runner must ask "how many steps are left?" before each step. Also, `stepNo` loads lazily (584). On a resume it is empty until the first save, so read it before the runner starts.

## Proposed seams

### Seam A: Turn admission (recommended, first commit of #23)

- **What:** move `runTutorTurn` lines 334–444 into a new `src/tutor/turn-admission.ts`. `runTutorTurn` keeps only the lifecycle (about 45 lines).
- **Interface:** one function. In: the deps and the input. Out: a refusal event, or a claimed turn with the items to show first (Next dividers, quiz-ladder items) and `alreadyFinished`. Refusals: `stale`, `not_allowed`, `busy`, and the new `over_quota`, resume limit and quiet ride-along for `widgetCall`.
- **Behind it:** 9 input kinds and their code notes, the stale-tab rule, the lock claim, `dropTurn` on a refused Next or follow-up, the paste save. Then the new quota, resume limit and widget-call rules.
- **Depth and locality:** many rules behind one call. Every "may this turn run?" rule is in one file. The order of the rules becomes a real question (a widget call while busy; a widget call over quota; a resume past its limit). One module lets one test table fix that order.
- **Test surface:** a refusal can be tested with no model client. Today each refusal needs a full `runTutorTurn`.
- **Risk:** low. The code is straight-line. It hands only `turn` on to the rest. The interface of `runTutorTurn` does not change. So the 72 test files that call it (about 300 calls), the route, the evals and `src/app/api/dev-e2e/route.ts` stay the same.
- **Note:** this seam is outside `runLockedTurn`. But it is the part that both #23 and #16 change.

### Seam B: Step ledger (recommended, inside the caps slice)

- **What:** replace `stepNo`, `stepsReady` and `saveStep` (580–588) with a small module for one turn: `save(model, make)` and `left()`.
- **Behind it:** the lazy read of saved steps (all runs, so a resume counts), one numbering across runner steps, `compose_widget`, the fold and compaction, and the limit S from `settings`.
- **Runner seam:** `runTools` gets an optional "steps left" callback. It has two adapters: the ledger (a Tutor turn) and "no limit" (the evals, the runner's own tests). Two adapters make it a real seam.
- **Locality:** every saved step already goes through `saveStep`. The ledger puts the limit at that one point. The retry check (1236) asks `left() > 0`.
- **Risk:** low. About 50 lines plus tests. It is the step-limit build itself, not extra work.

### Not now: a stage split of `runLockedTurn`

- Possible stages: prepare (629–752), draft loop (841–974), reply gate (985–1271), after the reply (1272–1340), record (1346–1374).
- None of the three changes needs it. The reply gate is the largest part (about 290 lines). It shares `rejected`, `replyFrom`, `retried`, `draftHeld` and `loop()` (the retry runs the draft loop again).
- Look at it again after the beta, when a change must go into the gate or the draft loop.

## Risk with and without a split

| Path | What can break | How likely | Cost to #23 |
|---|---|---|---|
| **No split** (build inline, as #13's brief says) | The quota and resume refusal add about 15 lines to `runTutorTurn`. The step limit adds about 25 lines and one more closure variable, spread over 5 places. The main risk is a wrong step count (`compose_widget` in the loop, the lazy load on a resume, the retry). Then #16 adds a third rule to the same busy branch. | Medium for step-count bugs, low for the rest | none |
| **Narrow split during #23** (Seams A + B) | Commit 1 is a move only. The existing tests catch a move error. The step limit is exact by its design. | Low | about +0.5 day of agent work |
| **Full split first** (a separate PR before #23) | 838 lines, 28 `let` variables, 12 nested helpers, the event order, the Stop / cut-off / guard paths, and resume that must not repeat a write. The unit tests are good, but they use a scripted model. The live tutor eval (`.github/workflows/tutor-eval.yml`) runs on any PR that changes `turn.ts` or `runner.ts`. It needs a working OpenAI key, and #13 says no real turn has worked yet. | High | +2–3 days of agent work before #23 starts; the beta is due at the end of November |

## Recommendation

**Split during hardening, narrowly.** Hardening does not wait.

1. Commit 1 of `feat-hardening`: move the admission code into `src/tutor/turn-admission.ts` (Seam A). No change in behaviour. Run `npm run check`.
2. The caps slice: put the quota and the resume refusal in the admission module. Build the step limit as the Step ledger (Seam B) and give the runner a "steps left" callback.
3. #16's build adds `widgetCall` to the admission module. It adds at most one guard in `companionWidget`.
4. Leave stages 2–7 of `runLockedTurn` as they are until after the beta.

## Rough size

| Work | Size |
|---|---|
| Seam A (move about 115 lines, tests for refusals) | about 0.5 day of agent work (S) |
| Seam B (about 50-line module, runner callback, tests) | part of the caps slice; about +0.25 day over an inline build |
| Full stage split (not recommended now) | 2–3 days of agent work (M–L) |

## Sources

- `src/tutor/turn.ts` at 42df944: `runTutorTurn` 326–487, `runLockedTurn` 538–1375.
- `src/tutor/turn-status.ts` 141–171 (`startTurn`, `resumeTurn`); `src/tutor/runner.ts` (whole file); `src/tutor/model.ts` 113–120; `src/tutor/tools.ts` 90–106 and 824–828; `src/tutor/reply-choices.ts` 53–58; `src/tutor/turn-body.ts`; `src/app/api/turn/route.ts`; `.github/workflows/tutor-eval.yml` 9–30.
- Test count: `grep -rl runTutorTurn src` gives 72 test files and about 300 calls.
- Issue #13 resolution (spend cap, 2 parts), #10 resolution (daily Tutor cap = #13 part 2), #16 brief (`widgetCall` input, ride-along rules), #5 resolution (events through `onAction` to `widgetCall`), #23 body (hardening slices).
