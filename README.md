# pandwind

Panda-like typed style objects that compile to real CSS — via Tailwind classes
(`tw()`) or via an atomic CSS-in-JS engine (`css()`). Plain `className` strings
and plain CSS keep working right next to both.

The core idea: **the compiler is the contract**. Wrong values are type errors,
autocomplete comes from your actual design system, and nothing is generated at
runtime that a build step could have done instead.

## Pick your lane

pandwind has three entry points; each subpath import is one deliberate choice,
and the root export carries only the recommended lane:

| lane                                | import                                                                             | use it when                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **tw()** — typed Tailwind classes   | `import { createTw } from "pandwind/tw"`                                           | you run Tailwind and want typed, merge-safe utility objects |
| **css()** — atomic CSS-in-JS        | `import { createCss } from "pandwind/css"`                                         | you want hashed atomic classes + tokens without Tailwind    |
| **design css()** — Figma vocabulary | `import { createDesignCss } from "pandwind/design"` (convention: `const dcss = …`) | you want ~30 design-intent props with strict tokens         |

`cx()` (`pandwind/cx`) merges across all three; presets live in `pandwind/preset`.

> 📚 **Documentation site**: [`docs/`](./docs) — a Starlight site (`nub run
--filter pandwind-docs dev`) with guides for every API, the build-time
> tooling, the non-web backends and the compatibility proofs. Agent skills:
> [`skills/pandwind`](./skills/pandwind/SKILL.md) and
> [`skills/pandwind-codemod`](./skills/pandwind-codemod/SKILL.md).

```tsx
import { tw } from "./tw"; // generated from your tailwind.css

export function Card() {
	return (
		<div
			className={tw({
				rounded: "xl",
				bg: "white",
				p: "6",
				shadow: "lg",
				hover: { bg: "gray-50" },
				sm: { p: "8" },
				group: { hover: { opacity: "100" } },
			})}
		>
			{/* "rounded-xl bg-white p-6 shadow-lg hover:bg-gray-50 sm:p-8 group-hover:opacity-100" */}
		</div>
	);
}
```

## Quickstart (fresh app)

pandwind ships compiled ESM and TypeScript declarations. Import public APIs
through the package subpaths; published applications do not need the
repository source tree or a special TypeScript runner.

```sh
pnpm add pandwind
```

The runtime lane has no Tailwind, PostCSS, parser, or bundler dependency. The
advanced build subpaths declare those packages as optional peers so a runtime
only install stays small. Install only the lane you use:

```sh
# typed Tailwind codegen (`pandwind-tw`) and Tailwind project loading
pnpm add -D @tailwindcss/node postcss cac

# source scanning or the migration/analyze packages
pnpm add -D oxc-parser

# Vite/unplugin integration
pnpm add -D unplugin
```

`pandwind` keeps these as development dependencies for its own build and tests;
they are not installed by a runtime-only consumer. The codegen and integration
entries report the missing optional package through the host/package manager
when that lane is selected.

For repository development only, enter the reproducible shell first. It provides
the pinned Nub TypeScript runner, Node, pnpm, and the formatting utilities:

```sh
direnv allow       # automatic, after installing direnv
# or: nix develop
nub install --frozen-lockfile
```

> See [PUBLISHING.md](./PUBLISHING.md) for changesets, provenance, and the
> release preflight.

**1. Preset** — define your design system once (`src/preset.ts`): tokens,
radii, conditions. See the `@pandwind/example-preset` workspace package for a
complete example (`defineTokens` / `defineTheme` / `definePreset`).

**2. Codegen** — generate the typed `tw()` runtime + `@theme` bridge from your
`tailwind.css`:

```jsonc
// package.json
{
	"scripts": {
		"tw:generate": "pandwind-tw generate ./src/tailwind.css ./src --tokens ./src/preset.ts --bridge",
		"tw:scan": "pandwind-tw scan ./src/tw.ts ./src ./src/pandwind.safelist.css",
	},
}
```

```sh
pnpm run tw:generate && pnpm run tw:scan
```

This generates `src/types.d.ts`, `src/tw.ts`, `src/bridge.ts`, a safelist, and
`src/pandwind-theme.css` (the token bridge — import it from your
`tailwind.css`). The `--tokens` flag feeds your preset's DTCG token groups in;
drop it if you don't use tokens.

**3. Vite plugins** — fold literal calls at build time:

```ts
// vite.config.ts
import { pandwindVite } from "pandwind/vite";
import { createTwAdapter } from "pandwind/tw";
import examplePreset from "./src/preset"; // or however you expose the preset

export default {
	plugins: [
		pandwindVite({
			preset: examplePreset,
			// optional: css() atoms compile to Tailwind classes too
			className: createTwAdapter({/* bridge + variants from generated files */}),
		}),
	],
};
```

Without `className` the atomic engine emits hashed classes compiled by
`pandwindCssVite`; with the adapter everything compiles through Tailwind —
same API either way.

**4. Use it** — `tw()` for typed utilities, `css()` / `createDesignCss` for
atomic styles, `cx()` to merge both. Plain strings keep working everywhere.

Subpath map: `pandwind/css`, `/tw`, `/cx`, `/preset`, `/design`, `/vite`
(runtime); `pandwind/codegen/{types,theme,collect,bridge}` and the
`pandwind-tw` binary (build-time codegen helpers); `pandwind/unplugin` (generic
bundler adapters); non-web backends `pandwind/react-native`, `/opentui` and
the render-agnostic `pandwind/stack` (+ `pandwind/stack/react`) — see
[BACKENDS.md](./BACKENDS.md).

## `tw()` — typed Tailwind classes

`tw()` takes a Panda-like object, types it against your real Tailwind design
system, and returns a class string. Tailwind stays the single CSS engine: no
PostCSS config or runtime CSS injection is required for the `tw()` lane.

### How it works

**Agent-ready by construction.** Run codegen with `--agents` and pandwind also
emits `pandwind.agents.json`: a versioned machine-readable capability file
every utility key with its literal value union (capped, with counts), the
variant set, conflict families, compose list, theme scopes and semantic
tokens — plus the exact commands an agent runs to verify its own output
(`typecheck`, `analyze --json`, the missing-css gate). Generic conventions
(design.md-style docs) describe intent and can drift from reality; this file
is _derived from the compiled design system on every run_, contains only what
provably exists, and wrong classes are caught as TypeScript errors before an
agent ever ships.

- **`pandwind-tw generate`** — loads your `tailwind.css` through Tailwind's own design
  system (`@tailwindcss/node`) and generates two files next to it:
  - `types.d.ts` — one key per utility with literal value unions (including
    opacity modifiers like `bg-red-500/50`), recursive variant nesting, and the
    open-ended `(string & {})` escape hatch for arbitrary values.
  - `tw.ts` — the typed `tw` instance, wired with the variant metadata, the
    utility **conflict map**, and the list of **composing** utilities.
- **`tw()` runtime** — a few dozen lines that walk the style object and compose
  class strings: camelCase keys, array values (`ring: ["1", "gray-900/5"]`),
  negative utilities (`"-translateX": "1/2"`), compound bases
  (`flex: "col"` -> `flex flex-col`) and arbitrarily deep variant stacks.
- **`pandwind-tw scan`** — Tailwind v4 scans source files for literal candidates, so
  dynamically composed classes are invisible to it. The scanner statically
  evaluates every `tw({ ... })` call through the same runtime and writes a
  safelist file that Tailwind generates CSS for.
- **Per-route CSS splitting (opt-in)** — `pandwindCssVite(preset,
{ splitByRoute: [{ match: /\/routes\/admin\//, name: "admin" }] })`
  serves route-exclusive atoms from `pandwind:css?route=<name>` while
  shared atoms and unmatched files stay in the global sheet; a virtual
  `pandwind:css-manifest` module exports the route -> id map. Default
  remains one global stylesheet.
- **Critical-CSS inlining (opt-in)** — add `html` paths to your routes and
  `inlineCritical: true`: at build time each entry's `<head>` gets the
  route's full stylesheet (common + exclusive chunks) inlined as a marked
  `<style>` tag, so first paint needs zero stylesheet requests. Capped per
  route (64 KB default) and skipped loudly on overflow; dev mode untouched.
  Drop the matching `<link>` for fully-covered routes to avoid duplicate
  delivery.
- **Theming** — declare theme scopes on your tokens module
  (`themes: { dark: { "--color-surface": "#0b0b10" } }`) and codegen emits
  deterministic `[data-theme="…"]` override blocks next to the `@theme`
  bridge. Utilities keep referencing `var(--color-surface)`; switching is a
  `data-theme` attribute flip with zero utility CSS changes. Component
  tokens (L3) stack on top: declare `components: { button: { primary:
"$color-brand" } }` and codegen emits `.pwc-button { --color-primary:
… }` scope classes — every existing utility restyles per component, and
  theme scopes compose naturally (`[data-theme]` × `.pwc-*`).
- **`nub run playground`** — live in-browser editor: type `tw()` / `css()` /
  `cx()` expressions and see the merged class string, fold verdict
  (full/partial/runtime) and conflict-merge visualization instantly.
  Per-example routes, URL-hash sharing, Monaco + Shiki. Styled with
  pandwind itself.
- **`nub run inspect`** — pandwind studio: a local read-only dashboard over the
  analyze machinery. Coverage tab (fold elimination, CSS budget, dead
  candidates, missing-css warnings with editor links) + Design-system tab
  (theme vars, typed utility unions, bridge map, preset tokens). Extend the
  CLI, not the app, when adding metrics.
- **`pandwind-tw scan` CSS mode** — point the out-file at a `.css` path and the
  scanner emits Tailwind v4 `@source inline(...)` directives instead of a JS
  safelist module; import it from `tailwind.css` and no generated JS lands in
  your source tree. Proven to generate identical rules (see
  `tests/source-inline.test.ts`).
- **`pandwind-tw prune`** — optional post-codegen step: re-compiles the scanned
  `tw()` classes through the real Tailwind engine and keeps only the theme
  variables the compiled CSS actually references (the example app drops 82
  vars down to the ~20 its compiled CSS references). Caveat: breaks dynamic
  token access — opt-in, run after `pandwind-tw generate` whenever sources change.
- **`packages/codemod`** — migrate raw Tailwind authoring onto the pandwind
  APIs (`tw` / `cx` / `css` modes; dry-run + diff by default, idempotent,
  driven by the generated metadata). See
  [packages/codemod/README.md](./packages/codemod/README.md).
- **`pandwindVite()`** — a vite plugin that runs _before_ Tailwind's scanner
  and statically inlines `tw({ ... })` calls with literal arguments into plain
  class strings. The runtime cost becomes zero and the classes are found
  naturally; the whole runtime and conflict map tree-shake out of the bundle
  (the generated `tw.ts` is marked `@__PURE__`). Dynamic calls keep working
  through the runtime and can still be covered by the safelist.

### DTCG design tokens → `@theme` → generated types

Your preset's DTCG token groups are the single source of truth for both
engines. `pandwind-tw generate --tokens <preset-module>` bridges them into a Tailwind v4
`@theme {}` block (only real theme namespaces: color, radius, text, leading,
font-weight, font, tracking — spacing scales and friends are skipped rather
than guessed) and injects it while generating types:

- the generated `pandwind-theme.css` artifact is imported from your
  `tailwind.css`, so Tailwind compiles token-backed utilities (`bg-success`,
  `text-error`) with zero hand-mirroring;
- the same block is injected during typegen, so token-derived values appear in
  the generated literal unions next to raw Tailwind values — autocomplete is
  driven by your design system;
- no `--tokens` flag (or a preset without bridgeable groups) = byte-identical
  generated output as before.

```sh
pnpm exec pandwind-tw generate ./src/tailwind.css ./src --tokens ./src/preset.ts
```

The generator accepts any module that default-exports groups or exports an
object carrying `.tokens` (a full preset works). Deterministic: sorted
groups/names, hex lower-cased, byte-identical output for identical inputs.

### Semantic sub-keys for overloaded utilities

Tailwind overloads one class prefix for several CSS concerns (`text-2xl` size,
`text-gray-900` color, `text-center` alignment). pandwind adds narrower
spellings that resolve onto the same classes:

```ts
tw({ textSize: "2xl", textColor: "gray-900", textAlign: "center" });
// "text-2xl text-gray-900 text-center" — no arrays needed
```

Available sub-keys: `textSize`, `textColor`, `textAlign`, `textWrap`,
`textOverflow` (all resolve onto `text`). They are derived at codegen time by
partitioning the base utility's values on the CSS properties they compile to,
so their autocomplete unions contain only the relevant concern (sizes for
`textSize`, colors for `textColor`). Conflict semantics are unchanged:
`{ text: "sm", textSize: "lg" }` merges last-wins, disjoint concerns compose.
The plain overloaded spellings keep working exactly as before.

### Variants

Nesting mirrors the class syntax: `{ dark: { hover: { ... } } }` becomes
`dark:hover:...`. Variants that require an argument are handled too:

```ts
tw({ group: { hover: { opacity: "100" } } }); // group-hover:opacity-100
tw({ max: { md: { bg: "red-500" } } }); // max-md:bg-red-500
tw({ aria: { checked: { bg: "sky-600" } } }); // aria-checked:bg-sky-600
tw({ "@": { md: { hover: { bg: "red-500" } } } }); // @md:hover:bg-red-500
```

The join separator (`:`, `-` or none) is detected at codegen time by compiling
sample candidates with Tailwind's own engine — whatever the variant's internal
shape is, the engine is the source of truth.

### Conflict resolution (tailwind-merge, but generated)

`tw({ px: "4", p: "6" })` emits `p-6`, not both classes. The conflict map is
**generated from the real engine**: every utility/value is compiled through
`candidatesToCss` and the CSS properties it sets (canonicalized longhands) are
recorded. Last key wins per property, variant-scoped classes never collide with
base ones, and overloaded utilities (`text-2xl` + `text-gray-900` + `text-center`
all coexist) stay precise.

Values that only set Tailwind custom properties (`ring-red-500`,
`shadow-red-500`) are recorded as setting nothing and never merge. Composing
families — `scale-x` + `scale-y`, `translate-x` + `translate-y`, `blur` +
`brightness` — merge only within the same key, never across.

The vite plugin performs the same merge at compile time for literal calls, so
the bundled class strings are already conflict-free.

## `css()` — atomic CSS-in-JS

The panda+stylex engine: `createCss(preset)` returns a typed `css()` that
flattens a style object into hashed atomic classes, with design tokens,
property-priority merging, variant conditions and a `$input` escape hatch for
dynamic values. `createCss()` remains available as an intentionally loose
convenience form.

```ts
import { createCss } from "pandwind/css";
import { definePreset, defineTokens } from "pandwind/preset";

const css = createCss(
	definePreset(
		{ config: {} as StandardProperties, tokens: defineTokens({...}) },
		{ strict: true, conditions: { base: "" }, properties: { $all: true } },
	),
);
```

It is the "better stylex + panda" half of the repo: no runtime style
resolution, merged at object-build time via property priorities. See
`packages/pandwind/tests/css-*.test.ts` for the behavior contract.

### Design css() — the Figma-inspector vocabulary

`createDesignCss(preset)` returns the same `css()` surface, but the style
object is the vocabulary designers already think in — borrowed from the
inspector panels of Figma, Framer and Sketch: ~30 props instead of ~500 CSS
properties, behind one function.

```ts
import { createDesignCss } from "pandwind/design";

// Convention: name design-lane instances `dcss` to keep them visually
// distinct from engine css() instances.
const dcss = createDesignCss(examplePreset);

dcss.class({
	$frame: { w: "20", h: 40, corners: "lg", fill: "$blue-500", pad: [4, 8] },
	$layout: { flow: "stackY", gap: 16, align: "center" },
	$text: { size: "xl", weight: "semibold", color: "$red-300" },
	_hover: { $text: { color: "$red-400" } },
});
```

- **Wrong is a type error.** Every value is a token or a constrained option;
  colors are strict tokens, so an off-system color or a typo doesn't compile.
  Raw CSS props only under `$raw` — the escape hatch.
- **Reads like the Figma inspector.** Styling reads top-to-bottom as intent —
  you review what it means, not how it works. Designers can contribute in the
  words they already use.
- **Token groups come from your preset**: `colors`, `spacing`, `radii`,
  `fonts`, `fontSizes`, `fontWeights`, `lineHeights`, `letterSpacings`.
  Missing groups fall back to open strings.

The modules: `$frame` is the box (w, h, corners, fill, border, blurBg, pad,
padX, padY, overflow, z, opacity — 0-100 like the Figma slider), `$layout`
is its children (flow, wrap, cols, rows, align, gap, gapX, gapY) and `$text`
is the type (font, size, weight, color, align, case, truncate, spacing,
decoration, highlight). Conditions and selectors nest to any depth.

### Static extraction (`pandwindCssVite`)

The css() classes are hashed deterministically; the stylesheet is generated
from the _same_ literal calls at build time, so nothing is accumulated at
runtime:

```ts
// vite.config.ts
import { pandwindCssVite } from "pandwind/vite";
import { examplePreset } from "./src/preset";

plugins: [pandwindCssVite(examplePreset), ...];
```

```ts
// main.tsx — the generated CSS is served as a virtual module
import "pandwind:css";
```

The plugin scans source files (like Tailwind's own scanner, and like `pandwind-tw scan`
for the safelist) for literal `css(...)` calls, resolves them through the
design layer and serves the deduped CSS — tokens plus atomic rules. Dynamic
calls keep working at runtime but are not extracted (same constraint as
dynamic class names in plain Tailwind).

## `cx()` — merge everything, last-wins

`createCx({ css, variants, conflicts, compose })` merges raw class strings,
`tw()` output and css atoms into one className with the same conflict
semantics as a single `tw()` call:

```ts
import { createTw } from "pandwind/tw";
import { createCss } from "pandwind/css";
import { createCx } from "pandwind/cx";

const tw = createTw<WindVariants>({ variants, conflicts, compose });
const css = createCss();
const cx = createCx({ css, variants, conflicts, compose });

cx(tw({ bg: "red-500" }), "px-4", css.class({ color: "blue" }), "bg-blue-500");
// "px-4 bg-blue-500 <color atom>" — bg-red-500 lost to bg-blue-500
```

Tailwind classes are parsed against the generated conflict map (variant
scoped, compose-aware, last-wins per canonical CSS property — never a
hand-maintained twMerge config). css atoms resolve through the engine's atom
registry, so `tw({ text: "gray-900" })` and `css.class({ color: "red" })`
fight over the same `color` property and only one survives. Anything
unresolvable is kept verbatim, deduplicated by exact string only — when in
doubt, nothing is dropped.

Note: with the **tailwind adapter** (below), `css({ color: "$blue-500" })` and
`tw({ text: "blue-500" })` produce the _identical_ class string
(`text-blue-500`), so Tailwind compiles the CSS exactly once no matter how
much of the app is written with each API. `cx()` remains the merge layer for
raw strings, tw utilities and css atoms in the same className.

### Compile-time `cx()` — tree-shakeable for static apps

When a file imports both tw and cx, `pandwindVite` folds statically-evaluable
`cx(...)` calls into their final class string at build time — by running the
merge through a real `createCx(config)` built from the same generated
metadata, so build output is byte-identical to the runtime by construction
(and proven differentially in tests/vite-cx-inline.test.ts):

```ts
// input
cx(tw({ px: "4", p: "6" }), cond && "hidden", "text-sm");
// output (cond === false literal)
("p-6 text-sm");
```

Supported arguments: string literals, expression-free templates, `false` /
`null` / `undefined`, nested arrays, and `&&` / `||` / `??` / ternaries over
statically-known operands. Anything referencing an identifier or
interpolation keeps the whole call at runtime. css atom objects inside cx are
not folded yet (they need cross-plugin engine sharing); those calls also stay
with the runtime. Apps whose calls are all-static can tree-shake the cx
runtime away entirely.

## The tailwind adapter — one stylesheet for both APIs

`createTwAdapter({ preset, variants, bridge })` turns `css()` into a
Tailwind-class emitter instead of a hashed-atom emitter:

```ts
import { createTwAdapter } from "pandwind/tw";
import { examplePreset } from "pandwind/preset";
import { bridge, variants } from "./bridge"; // generated by `pandwind-tw generate --bridge`

const twAdapter = createTwAdapter({ preset: examplePreset, variants, bridge });
const dcss = createDesignCss(examplePreset, { className: twAdapter });

dcss.class({ $text: { color: "$blue-500" } }); // "text-blue-500"
tw({ text: "blue-500" }); // "text-blue-500"
```

`bridge` is a generated `(property, resolved value) -> utility` map: preset
tokens that equal a `@theme` value yield the short utility (`$blue-500` ->
`text-blue-500`); anything else falls back to an arbitrary-property class
(`[margin-top:7px]`), which is still real Tailwind CSS. Unrepresentable
declarations — `$input` dynamics, unknown conditions — **throw a clear error**
instead of silently emitting a class that has no CSS in this mode.

The bridge stage of `pandwind-tw generate --bridge` sweeps Tailwind's own class list and keeps only
direct-property utilities that resolve against your `@theme`, so the bridge
stays small (~41 KB for the example preset) and cannot drift from what
Tailwind actually compiles.

### Class-name strategies — one API, swappable output

The tailwind adapter is one instance of a general contract:
`ClassNameStrategy` (see `css/class-name-strategy.ts`). A strategy decides,
per flattened declaration, which class the engine emits — or returns `null`
to fall back to atomic hashing. Two flavors exist:

- **External-compiler strategies** (tailwind): their classes are compiled by
  Tailwind's scanner; nothing joins pandwind's stylesheet.
- **Sheet-backed strategies** (`sheetBacked: true`): their classes are
  compiled by pandwind's own generated stylesheet, exactly like hashed
  atoms — `cx()` merging and the atom registry keep working; only the class
  spelling changes. `pandwindCssVite({ className })` serves their rules from
  the `pandwind:css` virtual module as usual.

The bundled second mode is `createNamedAtomsStrategy()` — readable classes
(`pw-color-red`) instead of hashes, useful when debuggable markup matters
more than minimal bytes:

```ts
import { createNamedAtomsStrategy } from "pandwind/css";

const dcss = createDesignCss(examplePreset, { className: createNamedAtomsStrategy() });
dcss.class({ $text: { color: "red" } }); // "pw-color-red" (rule in the generated sheet)
```

Switching modes is a one-option change; call sites never move.

## Tailwind compatibility — proven, not assumed

### Container queries

Container-query variants work through the whole stack, proven in
`packages/pandwind/tests/container-variants.test.ts`: nested keys emit the
escaped classes (`{"@md": { p: "4" }}` -> `@md\\:p-4`), `cx()` scopes them
distinctly from base (a later base `bg` never kills an `@md:` override and
vice versa), and real Tailwind compiles them inside `@container (...)`
at-rules. Typegen exposes the functional forms (`@`, `@min`, `@max`) as
variant keys; concrete sizes like `@md` ride the open escape hatch. Mark the
parent with Tailwind's `@container` class as usual.

Every claim below is checked against the real `tailwindcss` compiler, with
postcss as an independent parsing oracle — never against pandwind's own output
parsers. The suites in `packages/pandwind/tests/tw-tailwind-parity.test.ts` and
`packages/pandwind/tests/css-tw-parity.test.ts` are the proof:

- **Every `tw()` candidate is a real Tailwind class.** All ~23,000 utilities
  in `getClassList()` compile through `@tailwindcss/node`; nothing fails.
- **The conflict map predicts exactly what Tailwind emits.** For every
  candidate, the committed generated map (after canonicalization) predicts
  precisely the standard properties Tailwind's compiled CSS sets — no
  sampling, every candidate.
- **`cx()` output still compiles to the survivors' rules only.** Last-wins,
  variant-scoped and compose merges are recompiled by real Tailwind and only
  the surviving classes produce rules.
- **`css()` and `tw()` emit the same resolved CSS for the same intent.** The
  atomic engine's hashed classes and Tailwind's literal utilities can never
  share a class name; what is proven is that for the same logical style
  (color, background, radius, display, size, hover) both engines resolve to
  byte-identical `(property, value)` declarations, with the same pseudo-class
  on variants.
- **A committed snapshot of real Tailwind output** —
  `packages/pandwind/tests/snapshots/tw-tailwind-compiled.css.snap` — pins the
  compiler output the corpus relies on, so an engine upgrade that changes
  emitted CSS is visible in review.

What is deliberately _not_ asserted:

- Tailwind's internal `--tw-*` custom properties, `@property` blocks and
  keyframes (implementation details, not authored styles);
- media-query syntax: Tailwind v4 emits `@media (width >= 40rem)` range
  queries, presets write `(min-width: 640px)` — semantically equivalent,
  documented in the test header, not byte-compared.

Byte-identical class names between `css()` and `tw()` _are_ now asserted —
that is exactly what the tailwind adapter does, proven against real Tailwind
output in `packages/pandwind/tests/tw-adapter.test.ts` and pinned by the
`rulesForClass` oracle in `tests/helpers/tailwind-proof.ts`.

Non-happy paths are covered too: `packages/pandwind/tests/robustness.test.ts`
throws empty/nullish/unknown/weird inputs at `tw()`, `css()`, `cx()`, the
adapter and the static extractors and asserts three invariants — nothing
crashes, nothing is silently dropped, and every emitted class still compiles
through real Tailwind.

## Runtime size

The browser runtime is the three small modules above — no stylesheet
generator, no PostCSS, no parser. Measured by `tests/runtime-size.test.ts`
(esbuild, minified + gzip, against the committed record-of-truth snapshot
`tests/snapshots/runtime-size.json.snap`): `css()` ≈ 1.5 KB gz, `tw()` ≈ 1.0
KB gz, `cx()` ≈ 3.7 KB gz, all three together ≈ 4.4 KB gz. The build-time
stylesheet generator adds ~20 KB gz (postcss-selector-parser) and is
deliberately not exported from the runtime barrel. Real numbers for the runtime, the example build and the
alternatives (stylex, panda, emotion/chakra, tailwind-merge, tokenami) live in
[SIZE.md](./SIZE.md); per-call runtime benchmarks against those same
alternatives live in [BENCH.md](./BENCH.md). Lowering the same design system
to React Native / OpenTUI style objects lives in [BACKENDS.md](./BACKENDS.md).

## CI — analyze results on your PRs

A reusable workflow posts (and keeps updated, one sticky comment) the analyze
CLI's PR metrics: cx() fold coverage, missing-CSS tokens, and generated CSS
size with a delta against your base branch.

In **this repo** it already runs on every `pandwind/**` PR. To consume it from
**another repository**:

```yaml
# .github/workflows/analyze.yml
jobs:
  analyze:
    uses: astahmer/pandwind/.github/workflows/analyze-comment.yml@main
    with:
      base-ref: main
      app-dir: apps/my-app # dir containing src/ + generated tw.ts
      patterns: "src/**/*.{ts,tsx}"
      pandwind-version: latest
    secrets:
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

Inputs: `base-ref`, `working-directory`, `app-dir`, `patterns`, `pr-number`
(for dispatch runs), and `pandwind-version`. `working-directory` and `app-dir`
are relative to the caller checkout; `patterns` is relative to `app-dir`. The
workflow runs the published `pandwind-analyze` package and requires the app to
have run `pandwind-tw generate --bridge` outputs committed (the workflow reads
them). Fail-open: reporting problems never fail the workflow.

## Why pandwind exists

The short version of the decisions behind this repo lives in [TODO.md](./TODO.md)
under _What we deliberately don't do (and why)_. The highlights:

- **No mandatory runtime CSS-in-JS** — the build-time `tw()` lane and literal
  extraction can ship only class strings, while the explicit `pandwind/css`
  runtime lane supports dynamic styles, SSR, hydration, and ordered sheets.
- **No mandatory Panda-style PostCSS pipeline** — Tailwind compiles once for
  the utility lane, and the atomic runtime/compiler remains independently
  selectable.
- **No built-in recipe/slot API, no config files** — a minimalist API you can
  hold in your head; use an external CVA-style package to select Pandwind
  class strings when needed.
- **No hand-maintained tailwind-merge config** — conflict rules are generated
  from the engine, so they can't drift from what Tailwind compiles.
- **No 500-prop CSS API** — the design `css()` surface is ~30 Figma-inspector
  props; everything else lives under `$raw` on purpose.
- **No panda-like runtime bloat by default** — build-time users can tree-shake
  the runtime away, while runtime CSS-in-JS consumers opt into the sheet
  contract explicitly.

## Repo layout

```
packages/pandwind/        the library: css engine, tw codegen/runtime, vite plugin
  src/css/                panda+stylex mixed atomic css() engine
  src/design/             design css() — $frame/$layout/$text vocabulary
  src/tw/                 tw() runtime, oxc scanner, type/codegen
  src/vite/               pandwindVite() tw inliner + pandwindCssVite() extractor
  tests/                  vitest + tstyche suites
apps/example/             Vite + React app: Pandwind atomic and design CSS surfaces
```

## Commands

```sh
pnpm install
nub run --filter example dev       # dev server (runs codegen + scan first)
nub run test                       # vitest + tstyche
nub run typecheck
nub run --filter example tw:generate # regenerate types.d.ts + tw.ts (+ bridge)
nub run --filter example tw:scan   # regenerate the safelist via pandwind-tw scan
nub run --filter example build     # production build (tw() inlined, css() extracted)
```

## Multi-bundler support (unplugin)

The vite plugins are also published as [unplugin](https://github.com/unjs/unplugin)
adapters, so the same build-time folding works under rollup, webpack, rspack,
esbuild, rolldown and more:

```ts
// rollup.config.mjs
import { pandwindRollup, pandwindRollupCss } from "pandwind/unplugin";

export default {
	plugins: [pandwindRollup(), pandwindRollupCss(examplePreset)],
};
```

`pandwindUnplugin` / `pandwindUnpluginCss` are the generic factories (with
`.vite`, `.rollup`, `.webpack`, ... slices); `pandwindRollup(Css)` and
`pandwindWebpack(Css)` are ready-made aliases. Under vite prefer
`pandwindVite` / `pandwindCssVite` — identical behavior, plus native module-
graph config resolution. Generic adapters resolve the generated tw module
from relative imports on the filesystem; bare/aliased tw imports are a
vite-only capability. Cache invalidation uses unplugin's `watchChange`
(cross-bundler) with vite `handleHotUpdate` for immediate dev re-requests.

## Known limitations

- Dynamic values (`tw({ bg: color })` with a variable) can't be statically
  inlined or scanned — same constraint as dynamic class names in plain
  Tailwind. The safelist covers calls that are statically evaluable; fully
  dynamic values need `@source inline` or an explicit safelist entry.
- Mixed-concern overloaded utilities need an array:
  `tw({ text: ["2xl", "gray-900"] })`. The semantic sub-keys
  (`textSize`/`textColor`) are the narrower spellings — see
  _Semantic sub-keys_ above.
- Dynamic `css()` values (variables, `$input`) aren't covered by the static
  extractor — they need runtime styles, exactly like dynamic Tailwind classes.
- **What about node_modules?** Same answer as Tailwind: the tw() inliner
  transforms any module in the graph, but Tailwind's scanner only scans the
  sources it's configured to scan. Classes used by a library component need
  `@source inline "../node_modules/..."` or an explicit safelist entry. The
  css() extractor skips node_modules by default (configurable via
  `include`/`exclude`).
