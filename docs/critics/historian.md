# Historian (spec §8.6)

## Inputs
- Story scenes, Lingo cards and Case text in the batch.
- The Topic's `outline.yaml` sources and the Case's as-of date.
- Inside the Delight eval it runs as Appendix D.2.4.

## Rubric
1. Is every date, person, number and event in the story supported by the Topic's sources?
2. Does the story reveal an outcome after the as-of date before the reveal step?
3. Does it invent a quotation or a character presented as real?
4. Does it give a buy or sell call?

## Output
JSON only, no prose.

```json
{"claims":[{"text":"LTCM was founded in 1994","source":"https://example.com/source","supported":true}],"findings":[{"id":"H1","where":"scene 2","problem":"names an outcome after the as-of date","severity":"high"}]}
```

## Pass bar
Every claim supported; 0 as-of leaks; 0 buy/sell calls. A wrong fact is high-stakes: 3 votes.

## Tier
sonnet, medium. The vote runs on opus for D2c, D2e, D2f, D2h and E6a-E6c.
