# Domain docs

How engineering skills consume Eatlog's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- `docs/adr/` entries that affect the area being changed.

If these paths do not exist, proceed silently. Do not propose creating them upfront. The `/domain-modeling` skill creates them when terms or durable decisions are resolved.

## File structure

Eatlog is a single-context repository:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Use the glossary's vocabulary

Use terms as defined in `CONTEXT.md` when naming issues, proposals, hypotheses, tests, and code concepts. Do not replace a defined term with a synonym.

If a needed concept is absent, reconsider whether the project already has a term for it. Record a genuine terminology gap through `/domain-modeling`.

## Flag ADR conflicts

If proposed work contradicts an ADR, identify the ADR and explain why the decision should be reopened rather than silently overriding it.
