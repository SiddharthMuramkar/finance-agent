# Domain docs

Layout: single-context.

- `GLOSSARY.md` at repo root: canonical domain terms.
- `docs/adr/`: architecture decision records (`NNNN-title.md`).

Consumer rules:
- Before naming things or writing specs/issues, read `GLOSSARY.md` and use its terms.
- Before changing architecture, read relevant ADRs in `docs/adr/`; don't contradict one silently.
- Files may not exist yet. If missing, proceed; create them only via the domain-modeling skill.
