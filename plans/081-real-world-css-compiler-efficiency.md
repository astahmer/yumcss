# Real-world CSS authoring and compiler efficiency plan

## Context

- The latest corrected CSS-in-JS Bench lane uses the main createCss API and the shipped Vite CSS compiler. Across its 400-tile product grid, the page transfers 10,539 B gzip: 0 B JavaScript, 1,492 B CSS, and 9,047 B HTML. SSR throughput ranks first, hydration third, mount seventh, and cold build fifteenth. The page payload rank is mostly markup cost, so shrinking Pandwind CSS would not address its largest part.
- The six-page Arena lane passes 18/18 geometry checks and 72/72 screenshot checks. Pandwind emits the smallest raw CSS and has strong build and SSR results. Full first load is 125,838 B, including 111,644 B Brotli JavaScript and 8,724 B Brotli CSS. The 8,913 B JavaScript gap to the third-place row is a profiling lead, not a target by itself.
- The Arena source-attribution experiment found a shared 14,437 B Brotli chunk containing Pandwind cx, preset, and CSS runtime modules, plus 4,967 B of app source. A cross-module cx fold did not change any of the six route modules. Named atoms reduce the large-style CSS slope but raise the real Bench page from 10,539 B to 18,352 B and add 89,501 raw class-attribute bytes in Arena. Keep hashed names as the default.
- Emisoup is a useful large application workload because its front end imports Pandwind through a local package link and has thousands of css API uses. A source search found about 3,119 css-related matches across 202 TypeScript files. Its actual inputs include static css.class calls, css.props composition, and per-render css.vars values. For example, TaskTrayRow composes a static progress-fill style map with a changing width carrier; the changing width must stay dynamic while the rest can be extracted once.
- A current Emisoup production build used Vite 8.3.0 and Pandwind from the default workspace. It transformed 3,026 modules in 3.61 s. Pandwind's extract-css generateBundle hook took 1.5 s, 42% of measured build time. The transform hook ran 3,026 times, but its individual time overlapped with other hooks and was not attributed. The generated application CSS asset was 123.97 kB raw and 21.35 kB gzip. This is a single current baseline, not a before/after claim.
- That build used Emisoup source revision 005b44b87470228738873fd66076737a2017b3 and Pandwind source revision 49dac84d620c288b76bd256b3c7d99cc8ede3e4f; the CSS compiler files were unchanged in the Pandwind working-copy edits. Emisoup's CSS factory uses authored token-variable names. Its theme builder applies those names to subtrees, so renaming or hashing them changes real behavior.
- A separate 2026-09-22 Emisoup measurement found about 1,500 generated rules and 284 repeated declaration-body groups, with 27.47 kB of repeated raw declaration-body bytes before selector compression. That older build measured 20.24–20.42 kB gzip and 17.95 kB Brotli. Those results came from different application source and are a hypothesis for what to inspect, not an optimization delta or budget.
- The completed 2026-09-25 CSS benchmark refresh is recorded against Pandwind revision bc1b904c5d6795d43396b9f364a127fd68c2f436. The default workspace's PERF-SUMMARY.md still contains the earlier tw-only Bench result; reconcile the canonical report and snapshot before using later comparisons as deltas.
- Recent compiler work already folds static multi-map css compositions, extracts provably literal subsets, enumerates bounded finite style candidates, and folds bounded cx branches and local tw factories. The next work must start from actual missed patterns and shared semantic helpers instead of building a second evaluator.

## Goal

Improve Pandwind's existing CSS authoring and compilation paths so ordinary source stays direct and expressive, large Vite projects spend less time compiling styles, and generated CSS and JavaScript contain only the semantics a project uses. Preserve CSS behavior, current public APIs, and conservative runtime handling for genuinely dynamic values.

Performance results are evidence for product decisions, not a request to match benchmark ranks. A change qualifies when it improves a real source pattern, build cost, output cost, or runtime behavior across representative projects without breaking another meaningful workload.

## What

1. Build a representative, reproducible compiler workload from Emisoup, the Playground, the corrected createCss benchmark lane, and a deterministic large-module stress case. Emisoup provides real CSS source density and dynamic carriers; the Playground provides API and editor-consumer coverage; the benchmark lane provides a small fully static control.
2. Profile the Pandwind Vite plugin on large projects before redesigning it. Find where the measured 1.5 s Emisoup generateBundle time goes, and measure transform work with CPU attribution rather than summing overlapping hook timers.
3. Audit the input forms that fail to extract or leave avoidable runtime work. Extend static analysis only for common, provably bounded source forms and reuse the compiler's current literal evaluation, condition normalization, and composition logic.
4. Preserve a precise static/dynamic boundary. Extract static declarations from mixed calls once; retain changing values as CSS-variable carriers; do not emit a new stylesheet rule on each render.
5. Investigate CSS output duplication using a pinned current Emisoup build. Canonicalize or intern atoms only when property, condition, token-variable identity, namespace, and cascade behavior are equivalent. Preserve authored token-variable names and source-order semantics.
6. Attribute surviving JavaScript to actual runtime use. Improve static pruning or runtime-module composition only when an application proves those modules are unnecessary. A static-only fixture that already emits zero styling JavaScript is a control, not an excuse to remove behavior needed by dynamic consumers.
7. Revisit route-specific CSS delivery only as an opt-in, real-router integration question. Current route splitting is path-based and its manifest does not load chunks. Any follow-up must prove first-paint ordering and client-navigation behavior in a consuming application.

## Why

The benchmark data does not point to one universal size fix. In the corrected Bench page, Pandwind-specific JavaScript is already zero and HTML is most of the compressed payload. In Arena, CSS is compact while shared application and styling modules account for more first-load bytes. The static CSS compiler is already fast enough to lead that small Arena build comparison, but the real Emisoup build identifies final CSS generation as a substantial stage on a much larger source graph.

The strongest general opportunity is therefore to make the compiler do less repeated work on real projects and to lower more common source patterns without changing how developers express styles. Output reductions should come from semantics the compiler can prove and reuse, not from longer class attributes, removed tokens, altered cascade order, or benchmark-only source shapes.

## How

### Conceptual model

Treat each module as authored source plus configuration, analyze it once where measurements justify sharing, and retain a bounded semantic result with source provenance. Project that result into:

- static atoms, token references, keyframes, and stylesheet rules;
- transformed class or props output for statically known calls;
- CSS-variable carriers for values that change at runtime;
- an explicit conservative fallback for unsupported or unbounded expressions.

Keep the flat fast path for direct static calls. Do not force small calls through a richer representation unless they need it.

### Operations and behavior

1. Pin source revisions, dependency versions, compiler settings, and browser environment. Repeat the Emisoup build enough times to establish cold and warm medians; retain the current single-run measurements only as an initial locator.
2. Classify real source calls into static declarations, composition, finite branches, imported constants, and runtime values. Record which compiler pass accepts each form and which pass leaves work behind.
3. Test the real mixed-carrier pattern: static css(...) declarations must be emitted once; a changing css.vars value remains on the host as a variable carrier; unrelated className and style props retain their order and meaning.
4. Profile the production build and HMR path by phase: parsing, binding/literal resolution, extraction, stylesheet assembly, serialization, and invalidation. Optimize the dominant measured phase. If AST work repeats across the Vite compiler and extractor, consider a per-module analysis result shared only by those consumers.
5. Audit cross-module constant folding only when a real consumer contains the pattern. Emisoup has no cx(...) calls, and the previous Arena attempt changed no route modules; imported conditional cx folding is therefore conditional work, not the first implementation target. If a representative project demonstrates the need, resolve only side-effect-free, statically imported constants with bounded traversal, cycle detection, and conservative fallback.
6. For CSS output, compare exact normalized declaration identities and final compressed bytes. Investigate whether repeated declaration bodies come from equivalent atoms, different token aliases, or distinct condition/order semantics. Do not merge separated selector rules in a way that changes which declaration wins.
7. Measure JavaScript and CSS separately, then compare the complete application delivery shape: compressed JavaScript, CSS, SSR HTML, class attributes, and runtime carrier work. Keep raw bytes as a diagnostic only.
8. If route splitting is revisited, use a real router's lazy route graph, ensure route CSS is available before content paints, and test navigation between routes and shared-component styles. Keep splitting disabled by default.

### Technical choices

- Reuse the current OXC parser, literal evaluator, css-inline analysis, style-key canonicalization, and stylesheet policies. Add a shared pure semantic helper only when compiler and another real caller need the same rule.
- Keep per-module caches bounded and keyed by exact content plus the relevant preset, token-variable, namespace, and compiler configuration. Invalidate dependent modules on source or configuration changes. Do not add persistent disk caches or a background service without measured need.
- Keep finite candidate expansion bounded. Do not raise the current combination cap until real code and build-cost measurements justify it.
- Keep unbounded values on css.vars or the existing runtime path. Never guess a static value, erase a dynamic expression, or generate an unbounded class set.
- Keep hash classes as the default until an ordinary application shows a lower total transfer cost across CSS, JavaScript, and HTML. Keep authored CSS variables when consumers use them as a theming contract.
- Do not add user-facing API by default. The css(), css.class(), css.props(), css.vars(), cx(), and tw() contracts stay frozen; a worthwhile new API requires its own design note and maintainer approval.

### Architecture

The Vite plugin remains the composition root for project files and bundler hooks. Pure analysis owns literal semantics, token resolution, and condition normalization. Stylesheet generation owns cascade ordering and serialization. Runtime carriers own genuinely changing values. Analyzer and lint consumers reuse pure semantics where applicable; neither invokes the whole compiler.

Any new cached module summary must have a clear owner, an injected configuration boundary, explicit invalidation behavior, and a substitution test. Keep source maps and diagnostics tied to the original expression so an optimization can explain what was extracted and what remained dynamic.

### UI and author experience

No new styling API or runtime UI is planned. Authors should be able to keep normal object composition and host-props code; the compiler should recognize safe forms without requiring benchmark-specific rewrites. If a common form cannot be compiled safely, analyzer or lint output should name the limiting expression and point to the supported static/dynamic boundary.

### Data model

There is no persistent data model. If profiling justifies a compilation summary, it is in-memory, bounded, per module, and invalidated by source or configuration changes. It records only semantic results and provenance needed by CSS output, transformed JavaScript, diagnostics, and HMR.

### Benchmark cadence

Use focused package and consuming-app measurements after changes to extraction, CSS generation, runtime carriers, or Vite invalidation. Use the Emisoup build and deterministic large-module case for compilation throughput. Refresh the full Arena and Bench comparisons on the cadence already recorded in the benchmark plan, not for each JJ revision. Rankings are never acceptance criteria for this plan.

## What this allows

- More ordinary, composition-heavy source to compile statically when its meaning is provable.
- Faster builds and HMR on large projects if profiling confirms avoidable repeated work.
- Smaller generated output when identical semantic atoms can safely share emitted rules.
- Direct comparison of static extraction and dynamic carrier behavior against a real consumer.
- A documented reason to keep a candidate unchanged when the supposed saving is only a leaderboard gap or would weaken CSS semantics.

## What this does not allow

- New styling APIs, changed defaults, or forced rewrites of consumer source.
- Increasing static-evaluation scope without a bound on traversal and output combinations.
- Dropping token declarations or renaming authored variables without proving that the consumer contract permits it.
- Merging or reordering CSS rules based only on matching text when cascade order can differ.
- Changing the default class strategy to improve one CSS-only metric while total page transfer grows.
- Treating source-module attribution as independently removable compressed bytes.
- Enabling route CSS splitting by default or leaving route chunks unloaded on navigation.
- Using top-three, top-five, or any single benchmark rank as a completion criterion.

## Open questions

1. What portion of Emisoup's 1.5 s generateBundle time is source discovery, repeated extraction, stylesheet generation, or serialization?
2. How many repeated declaration bodies remain in the current pinned Emisoup build, and which ones are semantically identical across token and theme contexts?
3. Which static forms used by Emisoup and the Playground still retain runtime compilation, and do they occur often enough to justify expanding the evaluator?
4. Is there another real consumer with imported conditional cx constants, given Emisoup has no cx calls and the Arena fold did not change its emitted route modules?
5. Can route CSS be tied to a real lazy-route graph with guaranteed pre-paint loading, or should the existing path-based opt-in remain the final contract?

## Implementation steps

1. Reconcile the completed 2026-09-25 createCss benchmark result with the canonical benchmark report and snapshot on the default branch. Pin the already-measured inputs; do not rerun external suites solely to make a new plan.
2. Capture pinned Emisoup and Playground baselines. Run repeatable cold/warm Emisoup builds and collect per-hook timings, CPU profile, module count, generated CSS/JS/HTML sizes, and memory. Retain a deterministic large-module fixture to separate file-count cost from style-count cost.
3. Create a package-boundary regression corpus from real source patterns: static css.class, multi-map css and css.props, static-plus-css.vars composition, finite branches, theme overrides, and any proven imported constant form. Keep fixtures small and assert the runtime API result and compiler output independently.
4. Profile generateBundle and transform work. Implement one measured compiler-throughput improvement at a time, preserving existing flat paths and testing cold build, warm build, HMR invalidation, and cache freshness.
5. Expand static source analysis only for a high-frequency, safely bounded form found in the corpus. Share the literal and condition semantics with runtime/compiler tests; keep mixed and unknown inputs on the conservative path.
6. Recount current Emisoup CSS duplication. If duplicate declarations have identical semantic identity, prototype atom/rule interning and compare full compressed output. Prove token override, condition, order, namespace, SSR, hydration, and browser computed-style parity before adopting it.
7. Attribute the Arena shared JavaScript chunk and any remaining consumer runtime modules. Remove or specialize only code proven unnecessary in the corresponding source graph. Recheck complete CSS, JS, HTML, and dynamic rendering costs.
8. Evaluate route-split improvements separately against an actual router only if initial-route transfer remains a real consumer problem. Do not combine route integration with core extraction or compiler-cache revisions.
9. Refresh detailed and short performance reports from the final pinned evidence. Keep implementation, report updates, and any external harness changes in separate described JJ revisions.

## Completion record

Implementation is in the described revisions for Vite anchor isolation, CSS-import scan gating, and the Emisoup-shaped progress-fill regression. Runtime source after the scan gate is pinned at Pandwind 94df3c41d5209e92adcadd298d0d246c37932a5a; the Emisoup app source is pinned at 005b44b87470228738873fd66076737a2017b3. Detailed measurements and output audit are in [PERF.md](../PERF.md#real-world-vite-extraction-emisoup-and-playground), with a short summary in [PERF-SUMMARY.md](../PERF-SUMMARY.md#real-world-css-compiler-emisoup).

The source gate improved its target phase on seven repeated deterministic samples: 1,000 irrelevant TSX files went from 9.70 ms median parse-and-walk to 0.275 ms median guarded discovery, and the parser-call regression test confirms 1,000 calls become zero. Full Emisoup build medians were 7.28 s before and 7.24 s after, within run-to-run spread; no end-to-end build win is claimed. Playground had no meaningful regression, and the Vite, scale, and HMR suites pass.

The CSS and JavaScript audits found no safe, useful output reduction. The repeated CSS bodies were non-adjacent; an order-preserving adjacent merge saved zero bytes. Arena's shared JavaScript remains needed by the measured source graph, and route splitting lacks first-paint/navigation evidence from an actual consumer. Keep hashed classes as default, route splitting opt-in, and the public API unchanged.

### Validation caveat

The focused Vite group passed 102 tests, and the Pandwind package's functional test segment passed 1,031 tests across 92 files. The later throughput guard failed for `css.default.raw` (405,642 ops/s against a 421,606 floor) and `css.merge` (147,917 ops/s against a 176,585 floor). This plan did not change either runtime path. Host load averaged 19–23 during follow-up checks, so no quiet isolated result was available; benchmark snapshots and thresholds remain unchanged.

## Acceptance criteria

- [x] Repeated Emisoup builds, exact source pins, module counts, memory samples, CPU profiles, and per-hook attribution are recorded. Build timing remains noisy and is not presented as a speedup.
- [x] The corpus covers actual Emisoup progress-fill composition, static extraction, repeated styles at 1,000-module scale, and existing static, finite, condition, token, and genuinely dynamic cases.
- [x] Runtime API and compiler behavior are checked independently for classes, dynamic props, static declarations, theme tokens, and conservative dynamic fallbacks across the Vite extraction suite.
- [x] Emisoup progress-fill emits static declarations once, retains a dark-theme token selector, and keeps width in one changing CSS variable rule; 30% and 70% preserve the same classes and change inline values.
- [x] The targeted source-scan phase has a repeatable deterministic improvement, with no meaningful Playground build regression and existing HMR freshness tests passing. Full Emisoup wall time is unchanged within noise.
- [x] Current Emisoup CSS duplication and compressed output were audited against a repeated-style stress case. Adjacent interning saved zero bytes, so no CSS-output transformation was adopted; existing cascade, token, runtime behavior, and hydration tests remain green.
- [x] Arena JavaScript was attributed to Pandwind runtime, preset, cx, and app modules; no unneeded code was proven removable, so no JavaScript reduction is claimed.
- [x] Hashed classes remain the default; the named-atom result increases total transfer, and no ordinary-app total-transfer evidence justifies changing the default.
- [x] No benchmark-only source shape, benchmark rank, or single-category byte count was used as an acceptance criterion.
- [x] No public API was added or changed.

## Decisions log

| Date       | Decision                                                          | Rationale                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-25 | Treat benchmark rankings as diagnostic evidence, not goals        | The corrected Bench page is mostly HTML, Arena's larger first-load cost is mostly JavaScript, and Pandwind already leads several real build and SSR measures. |
| 2026-09-25 | Profile Emisoup's real build before redesigning the Vite pipeline | The production build attributes 1.5 s to CSS generateBundle, while transform hook time is overlapped and unknown.                                             |
| 2026-09-25 | Preserve the existing static/dynamic API boundary                 | Emisoup uses real dynamic values and authored CSS-variable names; extracting the static portion must not erase runtime intent or the theme contract.          |
| 2026-09-25 | Keep hashed class names and route splitting opt-in                | Named atoms increase total transfer in current workloads, while route chunks require consumer-side loading and browser proof.                                 |
| 2026-09-25 | Gate CSS import discovery before parsing unrelated source         | Seven deterministic 1,000-file samples show a 35.3× median phase improvement; the full Emisoup build remains within timing noise.                             |
| 2026-09-25 | Do not merge non-adjacent repeated CSS bodies                     | No identical bodies were adjacent; merging non-adjacent rules risks changing cascade order and has no proven compressed-output benefit.                       |
| 2026-09-25 | Keep runtime and route code intact after attribution              | Arena's shared chunk includes runtime required by the compared source graph; no app router evidence supports route loading changes.                           |
