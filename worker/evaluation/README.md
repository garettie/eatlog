# Estimate evaluation

A frozen set of cases, a scorer that runs identically offline and against staging, and two
commands that cannot be confused for each other.

```
npm run evaluate:validate     # checks the manifest. No network, no provider, no cost.
npm run evaluate:estimates    # scores recorded fixtures. No network, no provider, no cost.
npm run evaluate:staging -- --allow-paid-run --max-requests 40 --budget-usd 1 \
  --input-usd-per-million <rate> --output-usd-per-million <rate>
```

The staging command refuses to start without `--allow-paid-run`, a request ceiling, a budget
ceiling, and the per-model rates it needs to reserve each request's worst case *before* sending
it. Checking a budget after a response has arrived is checking it after the money is gone.

## What is here and what is not

`cases.json` is the frozen manifest. `frozenAt` records when it was frozen; freezing it before
looking at any candidate result is what makes a comparison a comparison rather than a search for
a flattering number. Changing a case invalidates every result recorded against the old version.

The manifest currently holds six cases carried over from the old four-case smoke, and their
reference nutrition is a placeholder. **The plan's 60-case set is not shipped here, and it cannot
be generated.** Reference values have to be measured — weighed portions, product labels, consented
photos of real meals — and inventing them would produce a benchmark that agrees with whatever it
is handed. Preparing that dataset is owner work:

| Category | Cases | What each needs |
| --- | --- | --- |
| `weighed-simple` | 15 | A weighed portion and its source nutrition. |
| `composite-filipino` | 15 | The recipe, and which ingredients are material. |
| `labeled-product` | 10 | The product's own label. |
| `photo` | 10 | Permission to use the photo, plus measured reference data. |
| `redo` | 5 | The original estimate and the corrected identity. |
| `ambiguous` | 5 | Inputs a correct service refuses, including true non-food. |

Split them 40 development / 20 held out **before** any tuning, and keep the held-out cases
unexamined until a candidate is being judged.

## Where the files live

Photos and any personal fixtures stay **outside this repository**. `imagePath` points at a local
file; the validator rejects inline image data so a meal photo cannot be committed by accident.
Recorded fixtures go in `fixtures/<case id>.json`:

```json
{ "result": { "status": "recognized", "components": [] }, "latencyMs": 1200, "costUsd": null }
```

`costUsd` is `null` unless it is actually known. The runner never invents one: an unknown cost in
any case makes the summary report no cost per usable result at all, rather than a lower bound
that reads like a total. Cost comes from the deployment's own attempt logs, reconciled against
the provider's billing — never from summing sampled log entries.

## Reading the output

`passed` counts cases with no findings at all. `usable` counts answers of the right kind,
whatever their numeric error, and is the denominator for cost per result. `falseUnrecognized` and
`falseRecognized` are counted apart, because refusing real food and accepting car keys are
different failures with different fixes.

Errors are reported as means with the case count visible, and latency as median and p95. A set
this size supports a direction, not an availability guarantee; report category-specific results
and say how many cases each number came from.

## Promoting a change

Freeze the tolerances before viewing candidate results. A candidate is promoted only if every
deterministic amount, label, and contract check passes, no new severe errors appear on held-out
cases, aggregate nutrition error and valid-result rate do not worsen, and p95 latency is no worse
than the baseline. A cost increase needs a demonstrated reduction in material errors. Keep
unsuccessful experiments in the recorded results, not in production code.
