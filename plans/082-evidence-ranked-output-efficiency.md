# Evidence-ranked output efficiency plan

## Context

The refreshed reports use the real `createCss(preset)` API and the shipped
`pandwindCssVite(css)` plugin for the primary CSS lane. They show several clear
wins and a few bounded costs, not a case for changing the public API:

- In CSS-in-JS Bench, the static `css()` product-grid lane ships 0 B of
  marginal JavaScript, ranks first for SSR throughput and third for hydration,
  and ranks seventh for transferred payload at 10,539 B gzip (1,492 B CSS,
  9,047 B HTML). Its all-cases cold build ranks fifteenth of seventeen.
- In CSS-in-JS Arena, Pandwind ranks first for raw CSS, mean SSR HTML, build
  time, cold dev start, and shared-style edit to paint. It ranks third for
  compressed CSS and fourth for client JavaScript and full first load. The
  current gaps to third place are 8,913 B Brotli for client JavaScript and
  8,052 B for full first load. The run passed 18/18 geometry and 72/72
  screenshot checks.
- The corrected all-distinct 800-style Arena sweep measures 6.30 Brotli bytes
  per declaration for Pandwind hash classes, against 2.18 for Bamboo, 2.14
  for Panda, and 5.95 for StyleX. Named atoms measure 2.014 bytes per
  declaration and finish 70 B below Bamboo at 800 styles, but raise the
  400-tile Bench transfer from 10,539 B to 18,352 B and add 89,501 raw
  class-attribute bytes across Arena routes. Keep hash classes as the default.
  The prior sweep used modulo repeats for two properties; the corrected values
  and reproducible harness patch are recorded in
  [PERF.md](../PERF.md#css-in-js-arena-detailed-results) and
  [the Arena snapshot](../benchmarks/css-in-js-arena/snapshot.json).
- The separate `tw()` bonus lane ranks sixteenth of sixteen for payload and
  seventeenth of seventeen for cold build. It answers a different question
  from the main CSS API and must remain a separate score.
- The completed scan-gate work reduced its isolated 1,000-file discovery
  phase from 9.70 ms to 0.275 ms, with parser calls falling from 1,000 to 0.
  Emisoup's full-build medians of 7.28 s before and 7.24 s after are within
  run-to-run noise. This is a targeted phase win, not a full-build claim.
- The CSS interning prototype saved 0 bytes; a cross-module `cx` fold changed
  none of Arena's route modules. Arena's shared JS attribution includes
  runtime, preset, `cx`, and app modules. Route splitting remains opt-in
  without first-paint and navigation evidence.

The current completed work and detailed source revisions are recorded in
[plan 080](080-main-css-api-benchmarks.md) and
[plan 081](081-real-world-css-compiler-efficiency.md). The report already sets
the cadence: focused regression measurements after relevant compiler changes,
a local comparison monthly while performance work is active, and external
Arena/Bench refreshes quarterly or after a major competitor change.

StyleX is already pinned in [`reference-repos.md`](../reference-repos.md) at
`5f7acaa4b332e2cf8352e95e5bc83efd70904fd4`; a duplicate clone is unnecessary.
Its Babel plugin folds locally resolvable style merges and conditional
compositions, while preserving runtime behavior when it cannot prove a safe
fold. Its atomic class generator encodes MurmurHash2 modulo `62^5` as an
unpadded base-62 value of up to five characters. Pandwind already has atomic
stylesheet rules and a compile-time `cx` rewriter, so the
reference is for comparing emitted forms, proof boundaries, and collision
trade-offs—not for copying another compiler path or hash width.

## Goal

Reduce measured costs that affect real consumer builds, browser transfers,
runtime work, or editor workflows while keeping Pandwind's current API,
semantics, and strong results intact.

Ranks identify useful comparisons; they are not acceptance targets. Every
change must show a consumer-visible improvement on a representative workload
and retain correctness parity. A documented no-change conclusion is a valid
outcome when the measured gap belongs to the host app or the proposed change
does not improve total cost.

## What

Investigate and, where evidence supports it, improve five separate cost areas:

1. Arena's remaining client JavaScript and first-load transfer.
2. Compressed CSS growth on large style sets.
3. Bench's product-grid payload and cold-build result, with attention to its
   HTML-heavy payload split.
4. Full build time on real consumer repositories, beyond isolated scan phases.
5. `tw()` generated-artifact and runtime costs, measured separately from
   `css()` and only changed when a real import, bundle, or editor cost exists.

Keep the public API frozen. Do not cut `tw()` features or change generated
artifact contracts unless a separate design decision justifies the user cost
and offers a migration path.

## Why

The primary CSS API already compiles the static Bench workload to zero
marginal styling JavaScript and performs well for SSR, raw CSS, builds, and
HMR. Remaining work should target concrete gaps: compressed JS and CSS on
real browser pages, workload-representative build time, and any generated
Tailwind data that actually enters consumer bundles or slows typechecking.
This keeps optimization effort useful to ordinary projects rather than tuned
to a single rank or synthetic case.

## How

### Conceptual model

```text
authored source + verified preset
              │
              ▼
     shipped compiler/plugin
              │
              ▼
      emitted JS / CSS / HTML ──► compressed transfer + browser behavior
              │
              └─────────────────► real-build wall time and memory

Tailwind project config ──► official design-system loader
                               │
                               ▼
             generated types / build data / runtime data
                               │
                               ▼
             editor cost + actual imported client bytes
```

For each cost, establish the current owner, isolate a falsifiable hypothesis,
prototype it against production-shaped inputs, then compare emitted output and
behavior. Adopt only improvements that survive the relevant parity gates and
the full transfer or build measurement.

### Operations / behavior

- Keep CSS and `tw()` scorecards separate. Report JS, CSS, HTML, compressed
  first load, build time, hydration, and SSR independently.
- Attribute compressed bytes to emitted assets and transformed modules before
  removing or rewriting runtime code. Source size and cumulative concurrent
  hook time are diagnostic evidence, not end-to-end savings.
- Compare hash and named-atom strategies using total transfer across ordinary
  and style-heavy pages. Keep hash default unless a real workload proves a
  better total cost.
- Derive Tailwind defaults and project-specific values from the official
  installed Tailwind design-system loader. Do not add a partial hand-written
  vocabulary or assume generated source files are runtime imports.
- Refresh benchmark tables and rank snapshots only after parity succeeds.

### Tech choices

| Choice              | Decision                                                                                           | Rationale                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| API target          | Keep `css()` primary; report `tw()` separately                                                     | They exercise different runtime and generation paths.                                                    |
| Static optimization | Extend the existing Vite compiler and `CxCallRewriter` only when they can prove the transformation | Avoid a second compiler path and preserve dynamic fallbacks.                                             |
| CSS identity        | Prototype compact encodings only with deterministic collision handling                             | Five-character hashes can collide at project scale and may disagree across SSR, runtime, and extraction. |
| Tailwind metadata   | Use the official versioned loader and generated artifacts                                          | Defaults, plugins, and custom config must remain authoritative.                                          |
| References          | Reuse the pinned StyleX, Arena, and Bench sources already indexed                                  | No duplicate checkout or unpinned comparison is needed.                                                  |
| Public surface      | Add no public option or API in this plan                                                           | The existing API remains frozen; a worthwhile public change needs its own design note and approval.      |

### Trade-offs

| Candidate                                    | Potential gain                                           | Cost or risk to prove                                                                    |
| -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Shorter class hashes                         | Fewer selector and class-attribute bytes                 | More collisions, and possible mismatch across independent SSR/runtime/extraction builds. |
| More compile-time folding                    | Less shipped JavaScript and runtime work                 | More transform work and more cases that must preserve dynamic semantics.                 |
| Default Tailwind baseline plus project delta | Less repeated generated source for common configs        | Tighter coupling to the exact Tailwind version and more complex type composition.        |
| No change after attribution                  | Avoids weakening semantics or optimizing the wrong owner | Leaves a benchmark gap when it does not represent a real consumer cost.                  |

### Architecture

Keep existing ownership boundaries. Compiler hypotheses live in the CSS/Vite
compiler and must reuse its canonical style identities. Tailwind artifact
hypotheses stay in the codegen pipeline and use the installed Tailwind loader.
Benchmark scripts collect evidence; they do not add benchmark-only branches to
the runtime.

### What this allows

- Remove verified unused client code, reduce emitted CSS bytes, or make
  compiler transformations cheaper when end-to-end measurements confirm the
  benefit.
- Reduce generated Tailwind output or typecheck work when project-specific
  measurements show a real cost and official config semantics remain exact.
- Keep a result as a no-change decision when the cost belongs to the host or
  an optimization loses on total transfer.

### What this does not allow

- Changing the primary API to improve one benchmark lane or rank.
- Switching the default to named atoms based on the 800-style slope alone.
- Removing runtime code based only on attribution or source-level estimates.
- Treating the `tw()` result as a ranking for `css()`.
- Guessing Tailwind defaults, dropping unsupported project configuration, or
  silently replacing dynamic behavior with a partial static result.

## Implementation steps

1. [ ] Re-establish trustworthy starting evidence. Verify the pinned Arena,
       Bench, Emisoup, and Playground inputs and current generated report. Rerun
       the previously noisy `css.default.raw` and `css.merge` throughput guards on
       an otherwise quiet host with repeated isolated samples. Recheck the
       previously reported lint and typecheck failures against the current base;
       fix failures in changed paths and record unrelated baseline failures
       separately.
2. [ ] Attribute Arena's client-JS and first-load gap. Capture per-asset
       Brotli/gzip sizes, chunk imports, and the CSS factory/runtime features that
       survive the six-page static workload. Revisit the earlier `cx` fold only
       to explain why it changed no route module; test a distinct candidate only
       if emitted code shows it can remove shared shipped bytes. Keep app-owned
       JavaScript separate from Pandwind-owned output.
3. [ ] Explain the large-style CSS slope. Reproduce the 200/400/800-style
       sweep and split compressed growth among selectors, class names,
       declarations, conditions, and wrapper syntax. Compare equivalent peer
       outputs where the harness supports them, and label any non-equivalent
       source comparison. Prototype only collision-safe, deterministic output
       changes; prove that runtime, SSR, extraction, route splitting, and
       hydration use identical class identities. Measure total page transfer at
       the 400-tile and six-page sizes before changing the default.
4. [ ] Close or explain the Bench payload/build gaps. Inspect the 9,047 B
       HTML share and compare equivalent host DOM, attributes, and class output
       across implementations. Do not change the 1,492 B CSS path to solve an
       HTML-owned difference. Profile the 375 ms all-cases cold build by phase
       and compare against the already strong Arena build and a real consumer.
       Make no optimization if the result is harness-specific or within noise.
5. [ ] Measure full-build costs on real repositories. Use Emisoup and
       Playground with repeated before/after wall-clock and memory samples. Break
       out transform and `generateBundle` work without treating overlapping
       inclusive timings as wall time. Optimize only a phase that is material in
       the real build; retain the scan-gate result as an isolated discovery win,
       not a full-build multiplier.
6. [ ] Audit `tw()` generated costs without conflating source artifacts and
       shipped JavaScript. Inventory `types.d.ts`, `tw.ts`, optional runtime and
       build metadata, bridge, and interop files by owner and importer. Measure
       generated bytes, the actual client bundle for static and dynamic `tw()`
       use, and TypeScript check time for realistic generated declarations.
       Compare stock Tailwind, sparse overrides, resets, and custom/plugin
       configurations through the official loader. Record whether a baseline and
       project delta improve total consumer cost. Keep this step an evidence gate;
       if the result supports a redesign, implement it under
       [plan 083](083-tailwind-default-catalog-deltas.md), which owns the artifact
       model, reset semantics, consumer migration, and parity work.
7. [ ] Re-run the focused compiler, runtime, generation, and browser parity
       suites for each adopted change. Preserve Arena's 18/18 geometry and 72/72
       screenshot gates, Bench DOM/pixel parity, static `css()` zero-marginal-JS
       behavior, and runtime/compiler equivalence for dynamic cases. Update
       `PERF.md`, `PERF-SUMMARY.md`, and relevant plan completion records with
       the measured win or explicit no-change result.

## Open questions

1. Can class identifiers be made materially smaller without order dependence,
   collision risk, or different results between runtime and extracted CSS?
   The scale experiment must answer this before any class format change.
2. Does Tailwind's default-plus-project-delta artifact model reduce generated
   source, client output, or editor latency in actual consumers? Keep the
   current generated form if it only changes files that are not imported or
   checked by the consumer.

## Acceptance criteria

- [ ] Each accepted change reduces a measured real-user or developer cost;
      benchmark rank by itself is never sufficient.
- [ ] The primary `css()` lane remains the main API comparison, with `tw()`
      shown separately and generated source sizes separated from runtime
      bundle sizes.
- [ ] No CSS class collisions occur in the scale corpus, and names remain
      deterministic across runtime, extraction, SSR, and client hydration.
- [ ] Static `css()` calls still emit no marginal styling JavaScript; dynamic
      calls preserve their runtime semantics and style output.
- [ ] Total compressed transfer does not regress on ordinary pages to improve
      the large-style sweep. Arena geometry/screenshots and Bench DOM/pixel
      parity pass for changed output.
- [ ] Build claims use repeated full-process timings on representative
      repositories. Phase timings are labeled as such, and results within
      measurement noise are reported as no demonstrated end-to-end win.
- [ ] The Tailwind audit records official-config parity and separate
      generated-file, typecheck, and client-bundle measurements. Any artifact
      format or generation-policy change follows [plan 083](083-tailwind-default-catalog-deltas.md)
      and preserves the existing feature set.
- [ ] Detailed rankings remain in `PERF.md`; `PERF-SUMMARY.md` preserves the
      category-level top-five comparison and existing monthly/quarterly
      refresh cadence.
- [ ] Public API changes and feature cuts are excluded unless a separate
      design note establishes their user benefit and obtains maintainer
      approval.

## Decisions log

| Date       | Decision                                                         | Rationale                                                                                 |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2026-09-25 | Keep `css()` primary and `tw()` separate                         | Their benchmark lanes have different compiler, runtime, and generated-artifact costs.     |
| 2026-09-25 | Do not set a top-three rank as the success criterion             | Results vary by workload and metric; real consumer cost and parity decide.                |
| 2026-09-25 | Reuse the pinned StyleX checkout instead of cloning another copy | The existing source reference is sufficient for the class and conditional-fold questions. |
