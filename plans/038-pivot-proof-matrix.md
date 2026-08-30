# Plan 038 — reproducible pivot proof matrix

## Outcome

Make migration evidence a repeatable acceptance workflow rather than a
collection of independently run scripts. The normal gate must be deterministic
and offline; the full repository proof must be reproducible from pinned
checkouts and produce uploadable evidence.

## Design

The proof composition root has four independent inputs:

```text
adapter contract fixtures ─┐
real-repository catalog ───┼→ coverage/proof gate → evidence report
checked-in proof claims ───┤
browser/SSR runners ───────┘
```

`AdapterCoverageGate` owns only evidence policy. It does not parse files,
clone repositories, or launch browsers. Each adapter must have a contract
fixture; real-repository and browser dimensions are tracked separately. A
capability can be made blocking by adding it to the gate policy.

The reproducible runner must:

1. materialize the pinned reference workspace;
2. verify every checkout at its expected commit;
3. run the source migration corpus and write the versioned report;
4. validate the checked-in real browser/SSR claims; and
5. upload generated evidence without vendoring upstream repositories.

## Acceptance

- `pnpm pivot:proof` is deterministic and does not require network access;
- `pnpm pivot:proof:references` prepares pins and runs the full source corpus;
- CI runs the offline gate on every change and the full proof on demand/schedule;
- every registered adapter has contract evidence;
- real-repository and capability evidence are visible per adapter;
- missing evidence fails explicitly rather than being treated as success.

## Deliberate boundary

This plan does not claim that a source-only report proves browser, SSR, or
bundle equivalence. Those dimensions remain promoted only by the checked-in
real proof matrix and their dedicated runners.
