# Plan 007 — Deferred hardening & feature follow-ups

Follow-ups that were deliberately **out of scope** during the 2026-08-22
workstream merges. Each is small-to-medium; none blocks the other. Ordered by
(expected value ÷ effort).

## F. cx() merge-engine v2 — twMerge parity (perf AND correctness)

**State:** core correctness and benchmark-shim work complete (2026-09-22),
with the generated directional hierarchy now covering the remaining
multi-property families. The historical defects were found by a token-level
differential prober against tailwind-merge
while integrating yumcss into jantimon/css-in-js-bench (SSR microbench:
yumcss runtime-merge lane at 0.24× twMerge geo-mean; up to 12× slower on
long class lists).
**Three concrete defects:**

1. No cross-call memoization of token parsing (twMerge caches globally;
   adding it alone was worth **2.5×** in the prober shim: 43K→109K renders/s).
2. **Correctness:** multi-property groups (`text-xs` → font-size +
   line-height) let an unrelated later utility kill the whole token instead of
   only the matching property — cx() DROPPED classes that twMerge keeps.
3. Arbitrary values (`border-[#eee]` vs `border-[3px]`) lack validator-based
   disambiguation when deciding conflicts.
   **Acceptance:**

- exact class-list parity with twMerge on all 10 css-in-js-bench cases
  (prober harness exists in /Users/astahmer/dev/css-in-js-bench/techs/yumcss);
- existing suites stay green unmodified (cx.test, cx-fuzz golden corpus —
  extend the golden corpus if legitimate outputs change, documenting why);
- BENCH.md re-measured after landing (target: ≥1M ops/sec under load,
  i.e. within ~2–3× of twMerge); css-in-js-bench lane re-run.
  **Note:** memoization must respect the growing atom registry — cache keyed on
  (token, registry-generation) or invalidate on register().
  **Effort:** medium. Highest-leverage perf/correctness item available.

## A. Compile-time `cx()`: fold `css()` atoms inside `cx()` calls

**State:** `vite/cx-inline.ts` folds literal `cx()` args made of strings /
tw() output / arrays / falsies / ternaries. `css({...})` objects inside a cx()
call are left at runtime.
**Why it matters:** the most common real pattern is
`cx("px-2", css({ color: "$blue-500" }), cond && "...")`. Today those calls
keep the whole cx runtime alive, defeating tree-shaking for mixed apps.
**Approach:**

1. The blocker is cross-plugin state: `yumcssVite` (tw/cx inlining) and
   `yumcssExtractVite` (stylesheet + atom registry) each build their own engine
   instance. Extract a shared per-build engine context (preset + strategy +
   atom registry) created once and handed to both plugins via a shared options
   object or a virtual module (`yumcss:engine`).
2. Teach the cx evaluator to compile `css(...)` literals through the shared
   engine's registry so folded strings contain the same hashed/named classes
   the stylesheet pass generates for the same source file.
3. Extend the differential equivalence suite (`tests/vite-cx-inline.test.ts`)
   with css()-atom forms; add one real-vite integration case asserting the
   generated sheet contains rules for folded atoms AND the runtime import of
   `cx` disappears for all-literal files.
4. Gate: equivalence suite green, vite-integration green, size snapshot only
   changes if plugin code ships (it shouldn't — build-time only).
   **Effort:** medium. Mostly plumbing; semantics already exist.

## B. Bridge condition-bound semantic tokens into `@theme`

**State:** `generate-theme.ts` bridges flat string tokens only;
`defineSemanticTokens` values bound to conditions (`{ _dark: "...", base }`)
are skipped.
**Approach:**

1. Emit condition-bound tokens as namespace vars inside Tailwind v4
   `@theme`-compatible override blocks wrapped in the preset's own conditions —
   but verify what real Tailwind accepts first (`@theme` cannot nest in media
   queries; the honest mapping may be `@custom-variant`/CSS var overrides under
   `.dark` etc. outside `@theme`). Probe with the real compiler before designing.
2. Only bridge condition sets expressible by the preset's conditions map;
   throw-or-skip loudly otherwise (consistent with current "skip rather than
   guess" policy).
3. Tests: extend `tw-theme-codegen.test.ts`; parity-check dark-mode utilities
   against real tailwindcss compilation.
   **Effort:** medium-small, but needs a design probe first (half a day).

## C. Extend `UTILITY_SUBKEYS` beyond `text`

**State:** `textSize/textColor/textAlign/textWrap/textOverflow` exist. Audit in
The utility split review lists candidates: `bg` (8 concerns), `mask` (9),
`border`, `decoration`, `outline`, `flex`, `break`, `snap`.
**Approach:** data-only change — one entry per key in the `UTILITY_SUBKEYS`
table, plus typegen partitioning assertions in `tw-typegen.test.ts` and one
runtime test per new sub-key family. Decide naming with care: only split where
the sub-key name is unambiguous (`bgColor`? vs Tailwind's own `bg-*`
overloading), otherwise skip — closeness to TW surface beats completeness.
**Effort:** small per family; do them one PR/family at a time.

### C. Outcomes (2026-08-23)

Implemented for four families, runtime + typegen + tests:

- **bg**: bgColor / bgImage / bgSize / bgPosition / bgRepeat / bgAttachment.
- **border**: borderColor / borderWidth / borderStyle.
- **outline**: outlineColor / outlineWidth / outlineStyle.
- **decoration** (not `textDecoration*`: the API's key surface is the TW
  prefix camelCased, and `decoration-*` utilities live under base `decoration`;
  the line concern has no overloaded base — it lives under separate keys like
  `underline`/`no`/`line`, so there was nothing clean to split):
  decorationColor / decorationStyle / decorationThickness.

Skipped on purpose, with reasons:

- background blend-mode / clip / origin: valid partitions but outside the
  unambiguous list agreed up front; adding one is a SUBKEY_SUFFIXES line.
- `borderCollapse`: a partition of `border`, but naming it as a sub-key of
  border would be confusing vs the standalone `border-collapse` utility.
- bare outline resets (`outline-hidden`/`none` compile offset+style together):
  no single-concern name exists.
- textDecorationLine: Tailwind's line utilities are not prefixed
  (`underline`, `line-through`), so there is no base to attach to.

Mechanism hardening: `SUBKEY_SUFFIXES` is now also the **whitelist** —
`expandSubkeys` only emits a partition whose exact property signature has an
explicit entry, so generated interfaces can never advertise a sub-key the
runtime does not resolve (the previous auto-derived names produced keys like
`bgBackgroundcolor`). A typegen assertion loops over `UTILITY_SUBKEYS` and
requires each key in the generated interface.

Verification: 8 new runtime tests (resolution, intra-family compose,
base↔sub-key last-wins both orders, variant nesting, arrays/modifiers, legacy
spellings), typegen partition assertions (BgColor excludes cover/no-repeat/
blend-normal; BorderWidth excludes dashed), tstyche typing tests incl. escape
hatch. Full gate green. Size: tw entry 1734→2043 min / 882→985 gz (11 new
runtime entries); under raised-nothing budgets (2100/1100) — snapshot
refreshed intentionally.

## D. Cross-engine CSS-dedup proof for non-tw strategies

**State: COMPLETE.** `tests/css-dedup-parity.test.ts` now proves the hash and
named-atoms strategies through the generated stylesheet; the Tailwind adapter
continues to use its separate real-compiler parity harness.
**Approach:**

1. Generalize `tests/css-tw-parity.test.ts`'s harness: parameterize the
   css-side engine config over installed strategies (default hash,
   named-atoms; adapter needs external compiler so stays separate).
2. Assert per mode: every emitted class has exactly one rule in the generated
   stylesheet, resolved declarations equal the intent, and cx()-merged
   survivors recompile to survivors' rules only.
3. This is the precondition for advertising any third-party
   `ClassNameStrategy` as stable API.
   **Effort:** small-medium; mostly test-harness refactor.

## E. Publish-ready packaging hygiene (COMPLETE locally; pre-npm publication)

The exports map, quickstart, and release/change documentation are now present.
Actual registry publication remains operator-gated:

1. `exports` map audit: ensure `./css`, `./tw`, `./cx`, `/generate*` subpaths +
   `"types"` conditions are all declared; generate-theme/generate-types are
   currently reachable only via repo paths — decide whether to ship them under
   `yumcss/codegen`.
2. README quickstart for a fresh app (codegen → vite plugin → preset) using the
   example app as the canonical path.
3. Changesets or manual CHANGELOG.md capturing the 2026-08-22 wave.

## Explicitly rejected / parked

- `$token` spelling inside tw() values (fights real Tailwind compilation; @theme
  route won) — revisit only if someone needs token-level autocompletion on raw
  string inputs rather than generated unions.
- Full panda/stylex emulation behind ClassNameStrategy — wait for a real second
  consumer with actual demand.

### F. Outcomes (2026-08-22)

All three defects fixed in `src/cx/index.ts`:

1. **Memoization** was already per-instance from the earlier perf pass
   (twSigs/atomSigs/tokensCache); kept. The atom-sig cache is safe under a
   growing registry because `signatureFromCssKey` is a pure function of the
   flattened key — no generation keying needed after audit.
2. **Multi-property correctness:** merge state now tracks a live-signature
   count per output entry (`outLive`); a later token matching ONE signature of
   a multi-prop token only kills that signature — `cx("text-xs",
"leading-tight")` keeps both (was: dropped `text-xs`). Entries blank only
   on their last live signature.
3. **Arbitrary-value disambiguation:** typed `[prop:value]` forms its own
   per-property group; untyped arbitraries are disambiguated by value shape —
   `text-[16px]` vs `text-[#000]` (font-size vs color), `border-[3px]` vs
   `border-[#eee]` (width vs color, reusing the map's own color props so
   arbitrary and named colors collide), `bg-[url(..)]` → background-image.
   Plus generated-group couplings decoupled to match tailwind-merge: text
   size↔line-height (with directional kill: later font-size supersedes an
   earlier leading, never the reverse), transition-property vs duration,
   bare border = width-only half of the coarse "*" group.

Verification:

- New `tests/cx-twmerge-parity.test.ts`: 12 bench-corpus cases + 20 targeted
  defect pairs — **exact string parity with real tailwind-merge 3.6.0**
  (devDependency, exact-pinned). All green.
- `tests/cx-fuzz.test.ts`: new invariant (multi-prop survival across unrelated
  fillers + directional kill) + golden corpus extended 24→35 cases (outputs
  verified against real twMerge; one legitimate change: compose-axis-reverse
  "px-4"→"p-6 px-4", plus cx.test/tw-adapter/tw-tailwind-parity expectations
  updated for the same reason).
- Performance (quiet machine, median-of-15, BENCH-comparable short-pair input):
  **1.22M ops/sec** (target ≥1M ✓; pre-v2 baseline 176.9K quiet / 448K under
  load). twMerge on identical input: 4.13M (~3.4× gap on this shape). Heavy
  13+9-token lists: 314K vs twMerge 2.22M — long-list scaling remains the gap.
- Size cost is real: cx entry 4951→6517 min / 2832 gz (+1566/+964). Hard
  budgets raised intentionally: cx 5400/2400→7200/3100, all 7400/3100→9000/3800
  (~10% headroom over measured reality); snapshot refreshed.

Residual risks / not done:

- Full general twMerge equivalence would need a directional group-hierarchy
  table (p ⊃ px ⊃ pl …) emitted at codegen time — property-overlap alone can't
  express "later p kills earlier px, but not vice versa". Current semantics
  cover every pattern in the bench corpus and the defect list; deeper patterns
  (e.g. `py-2` after `p-6 px-4`) may keep both where twMerge keeps both.
- The css-in-js-bench lane (techs/yumcss/lib.ts) predates some of these
  refinements (border-2 width filtering, static transition decoupling) — its
  shim could adopt them for slightly better lane numbers.

### A. Outcomes

- Shared per-build engine context: `createYumCSSEngineContext({ preset,
className?, debug? })` (`src/vite/engine-context.ts`) bundles preset +
  strategy + atom registry + a `foldLiteralStyle(literal)` compiler that
  mirrors `createStylesheet.processFlatStyles` exactly (design-resolve,
  flatten, drop the empty condition, sort path parts). `yumcssVite({
css: { engine | preset/className } })` folds literal `css()` /
  `css.class()` atoms inside `cx()`; `yumcssExtractVite(preset, { engine })`
  accepts the same context (preset identity asserted) so both plugins are
  wired to one configuration source.
- Naming parity: folded atoms are byte-identical to what the stylesheet
  generates for the same literals (integration test extracts the folded atom
  from the transformed module and asserts its rule exists in the served
  sheet). Engines emit unescaped names — escaping is a selector-only concern.
- Merge parity: the context's registry feeds `createCx` via its
  `[ATOM_REGISTRY]`, so folded atoms conflict/merge against tw tokens and
  other atoms exactly like runtime css atoms (differential tests compare
  build output against a real `createDesignCss` + `createCx` pair).
- Conservative guards — the call stays at runtime when: any argument is not a
  plain literal object; `$input` dynamics are present (nested `$input` keys or
  `input>$` marker values); the strategy refuses the declaration (throws);
  `css.raw(...)` is used (style map, not classes).
- Runtime `src/cx/index.ts` untouched (verified: not in any revision's files).
- Residual: multi-condition literals written in non-canonical nesting order
  fold under their canonical (sorted) key — matching the shipped sheet, but
  diverging from what a hypothetical runtime engine would have registered for
  that spelling (pre-existing engine/sheet divergence, documented here rather
  than propagated). Deep-nesting forms remain rare; canonical top-level
  condition authoring is unaffected.

### A+. Smarter compiler outcomes (2026-08-23)

- Module-level constant propagation + partial conditional folding landed in
  the vite cx pass (src/vite/cx-inline.ts); tw() object values fold through
  constants via evalLiteral's optional scope.
- Safety: un-shadowed/never-written guard, declaration-order resolution,
  TDZ position guard (uses before the declaration line stay dynamic), `||`
  and `??` excluded from partial folding, conservative guards unchanged.
- Fold coverage over a 30-pattern realistic corpus (tests/vite-cx-coverage.test.ts):
  **13% -> 63% eliminated** (4F/0P/26R -> 11F/8P/11R). Remaining runtime calls
  are genuinely dynamic (map callbacks, prop-driven classes, spreads,
  cross-module values).
- Cross-module constant propagation is now landed behind the Vite build's
  injected resolver: direct imports and one barrel re-export level propagate
  string constants, HMR invalidation refreshes the owning file, and circular,
  non-literal, or deeper graphs stay dynamic.

### F.1 — long-list scaling follow-up (cx v3, 2026-08-23)

The v2 numbers exposed a scaling gap: 13+9-token pairs ran ~242–314K ops/sec
vs twMerge's 2.22M headline. Profiling + analysis showed two things:

1. Per-token cost was linear and already near-optimal (memoized signatures,
   parallel arrays, O(1) sigIndex) — the gap was NOT algorithmic.
2. **twMerge's headline rides its internal whole-input LRU cache**: repeated
   identical inputs are instant hits. cx() had no equivalent, so every call
   re-ran the full merge.

Fix: added a whole-input result cache to `createCx` — same strategy as
tailwind-merge, with one extra correctness guard yumcss needs: entries
record the atom-registry size at compute time (css atoms resolve live), and a
hit with a changed registry size re-computes. Only pure-string argument lists
are cached; arrays/objects always take the merge path. Also replaced the
`/\d+$/` opacity-modifier regexes on the parse hot path with manual scans.
Committed harness: `packages/yumcss/cx-bench.mts` (short pair, long pair,
long single, cold unique-token shapes).

Measured (quiet machine, median-of-15, before → after):

| shape                                     | before |                                                                                      after |
| ----------------------------------------- | -----: | -----------------------------------------------------------------------------------------: |
| short pair (4+3 tokens)                   |   747K |                                                                                      6.28M |
| long pair (13+9 tokens)                   |   242K | **2.70M** (11×; target ≥2× ✓, beats twMerge's 2.22M headline on the same warm-cache basis) |
| long single string                        |   418K |                                                                                      21.1M |
| cold unique-token pairs (all caches miss) |    n/a |                                                                                  ~100–125K |

Cold path is allocation/Map-growth bound (first-render vocabulary only);
steady-state real apps live in the warm regime. Size cost: cx entry
6517→6930 min / 3017 gz (+413/+185) — intentional, inside raised budgets
(7200/3100). Snapshot refreshed via `test:size -u`. Zero output changes:
parity/fuzz/golden suites green unmodified.

### F.2 — bitset conflict signatures (perf + size)

Every canonical CSS property family gets a bit index derived from generated
conflict/compose metadata (no hardcoded lists); token signatures become int
bitmasks. Conflict check = single AND; multi-prop kill = bit clear.
Targets: cold path >=1.5x (from ~119K), warm long-pair no regression (~1.7M).
Zero behavior change — parity/fuzz/golden suites green unmodified.
Harness: packages/yumcss/cx-bench.mts. Report before/after + size delta.

This remains an optional cold-path experiment. The current generated metadata
has more than 64 canonical signatures and CSS atoms can add further
properties; a multi-word or BigInt representation has not justified its code
and allocation cost. It is not part of the correctness completion bar.

### A++ — cross-module constant propagation (compiler)

Repo-wide exported-const registry in yumcssVite state (Map absPath ->
exports, invalidated on HMR); resolve import bindings one barrel level deep;
only string literals propagate; circular/non-literal/dynamic => untouched,
never throw. Tests: fixtures + differential equivalence + invalidation +
real-vite integration; extend coverage corpus, report new % vs 63% baseline.

### A++ Outcomes — 2026-09-22

The registry, one-level barrel resolver, HMR invalidation, fixture corpus,
differential checks, and real-Vite integration are implemented. The resolver
is intentionally bounded to exported string literals and one barrel hop; this
is sufficient compiler propagation without turning the Vite plugin into a
general module evaluator. The old 63% same-module coverage baseline is now
extended by direct-import, named-barrel, star-barrel, conditional, shadowing,
circular, and invalidation cases.

### F.3 — directional hierarchy and benchmark shim — 2026-09-22

Generated Tailwind metadata now includes a property-group directional kill
table derived from the installed Tailwind resolver and differential probes
against `tailwind-merge`. Runtime `cx()` consumes that table by property group,
so partial multi-property survival covers `overflow`, `flex`, `font-size`,
`border-radius`, and the related directional families without synthetic
runtime class ids. The external css-in-js benchmark shim now regenerates its
metadata and passes the direction table through the real `createCx` lane.

The proof is exact for the checked-in parity corpus and benchmark cases; it is
not a promise of arbitrary future Tailwind utilities without regenerating the
project metadata.
