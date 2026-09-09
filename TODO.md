# What we have

## `tw()` — typed Tailwind classes

- Codegen from your real `tailwind.css` (`@tailwindcss/node`): one key per
  utility with literal value unions, opacity modifiers (`bg-red-500/50`),
  recursive variant nesting and the open-ended `(string & {})` escape hatch.
- Deterministic typegen tests, tstyche type tests and integration tests on
  the generated runtime (`pnpm test`).
- Generated conflict map (per-property, variant-scoped, compose-aware) —
  tailwind-merge semantics without a hand-maintained config.
- `pandwind-codemod tw scan` — oxc-based scanner emitting a Tailwind safelist.
- `pandwindVite()` — statically inlines literal `tw()` calls before Tailwind's
  scanner (runtime cost zero, tree-shakable), with the same conflict merge at
  compile time.

## `css()` — atomic CSS-in-JS

- panda+stylex mix of hashed atomic classes, DTCG-style token groups,
  property-priority merging, condition/selector nesting, `$input` dynamics.
- `createDesignCss(preset)` — the Figma-inspector surface: `$frame` /
  `$layout` / `$text` (~30 props), strict token typings ("wrong is a type
  error"), `$raw` escape hatch.
- `pandwindCssVite()` — filesystem scanner resolving literal `css()` calls
  into a generated stylesheet served as a virtual module (`pandwind:css`).
- `cx()` — last-wins merge across raw class strings, `tw()` output and css
  atoms via the generated conflict map + css atom registry (variant-scoped,
  compose-aware). Unknown classes are kept verbatim.
- **Tailwind adapter** — `css()` and `tw()` emit the identical class string
  for the same intent (`css({ color: "$blue-500" })` ==
  `tw({ text: "blue-500" })` == `text-blue-500`) via a generated
  property->utility bridge, so mixing APIs cannot grow Tailwind's stylesheet.
  Unrepresentable declarations fail loudly instead of emitting CSS-less
  classes. Proven against real Tailwind output, including a robustness suite
  (`tests/robustness.test.ts`) that asserts nothing crashes, nothing is
  silently dropped, and every emitted class still compiles.

## Tooling

- All deps pinned to exact latest versions (no `^`).
- oxc-based parsing everywhere a scanner or static transform exists.
- Real-vite integration tests (dev transform, HMR invalidation, build) with
  post-plugin snapshots; runtime-size snapshot keeps the bundle lean
  (~4.4 KB gz for css+tw+cx).
- Tailwind-compatibility proof suite: every generated candidate compiles
  through real Tailwind and the committed conflict map predicts its emitted
  properties; `cx()` merges recompile to the survivors' rules only; `css()`
  vs `tw()` emit byte-identical resolved declarations for the same intent
  (with a committed real-Tailwind output snapshot). See the README section
  _Tailwind compatibility — proven, not assumed_.
- `src` uses `.ts` import specifiers, so vite's native config loader (and
  Node's type stripping) work without a bundler step.
- CSS identifiers (class names, custom properties) are escaped, so hashes
  that start with a digit are valid CSS.

## Shipped since this list was written

- **Split overloaded utilities** — semantic sub-keys (`textColor`, `textSize`,
  `textAlign`, `textWrap`, `textOverflow`) are generated at codegen time and
  documented in the README.
- **DTCG design-token integration for `tw()`** — `pandwind-codemod tw generate --tokens`
  bridges tokens into `@theme` and the generated types.
- **Compile-time `cx()`** — the vite inliner folds literal `cx()` calls,
  differentially proven byte-identical to the runtime.
- **Faster `cx()` runtime** — v3 whole-input result cache: warm long pairs
  ~2.7M ops/sec, at or above tailwind-merge on realistic class lists (see
  BENCH.md).

# Remaining optional work

- **Further ClassNameStrategy integrations** — the swappable class-name
  contract is now exercised by the Tailwind, Panda, UnoCSS, StyleX, and named
  atom strategies. Add another strategy only with a real target contract and
  its own CSS, runtime, and substitution proof.
- **Cross-engine CSS deduplication** — the built-in class strategies share the
  same declaration-level extraction and conflict tests. Extend the parity
  corpus when a new strategy introduces a different stylesheet owner.
- **SIZE.md / BENCH.md freshness** — the runtime-size snapshot is the enforced
  record of truth and the benchmark pages must be refreshed when the measured
  runtime or competitor versions change. These numbers remain local evidence,
  not published performance claims.
- **Safelist-free mode** — a custom Tailwind extractor that understands
  `tw()` objects, or first-class `@source inline` guidance; today the inliner
  already makes literal calls visible, and `pandwind-codemod tw scan` covers the rest.
- **Publish to npm/JSR/pkg.pr.new** once the API and proof boundary settle; the
  repository already has pack, smoke, changeset, and provenance checks.

# What we deliberately don't do (and why)

- **No chakra/emotion-style runtime CSS-in-JS.** A mini runtime that resolves
  styles at runtime is exactly the perf and caching cost we're avoiding.
- **No panda-style PostCSS pipeline or mini runtime.** Tailwind compiles once,
  statically; `tw()` output is plain class strings. `css()` output is
  extracted at build time by `pandwindCssVite`.
- **No built-in recipe/slot API, no config files.** Panda's recipe/slot API and
  config-driven pipeline are exactly the surface we don't want to repeat. A
  minimalist API you can hold in your head; external CVA-style packages can
  select the class strings Pandwind already produces.
- **No hand-maintained tailwind-merge config.** Conflict rules are generated
  from the real engine, so they can't drift from what Tailwind compiles.
- **No 500-prop CSS API.** The design surface is ~30 Figma-inspector props;
  everything else goes through `$raw` on purpose.
- **No runtime stylesheet accumulation.** The css() stylesheet is generated
  from literal calls at build time; dynamic values are the documented escape
  hatch, not the default.
