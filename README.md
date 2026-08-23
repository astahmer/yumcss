# pandwind

Panda-like typed style objects that compile to real CSS — via Tailwind classes
(`tw()`) or via an atomic CSS-in-JS engine (`css()`). Plain `className` strings
and plain CSS keep working right next to both.

The core idea: **the compiler is the contract**. Wrong values are type errors,
autocomplete comes from your actual design system, and nothing is generated at
runtime that a build step could have done instead.

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

pandwind ships **source** (`.ts` entry points) and expects a bundler that
compiles TypeScript (Vite does natively) with `moduleResolution: "bundler"`.

```sh
pnpm add pandwind
```

**1. Preset** — define your design system once (`src/preset.ts`): tokens,
radii, conditions. See `packages/pandwind/src/preset/example-preset.ts` for a
complete example (`defineTokens` / `defineTheme` / `definePreset`).

**2. Codegen** — generate the typed `tw()` runtime + `@theme` bridge from your
`tailwind.css`:

```jsonc
// package.json
{
	"scripts": {
		"tw:codegen": "tsx node_modules/pandwind/src/tw/generate-types.ts ./src/tailwind.css ./src --tokens ./src/preset.ts",
		"tw:bridge": "tsx node_modules/pandwind/src/tw/generate-bridge.ts ./src/tailwind.css ./src/tw.ts ./src/bridge.ts",
		"tw:scan": "tsx node_modules/pandwind/src/tw/collect.ts ./src/tw.ts ./src ./src/pandwind.safelist.ts",
	},
}
```

```sh
pnpm tw:codegen && pnpm tw:bridge && pnpm tw:scan
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
(runtime); `pandwind/codegen/{types,theme,collect}` (build-time codegen
helpers). `generate-bridge` stays CLI-only (it executes on import).

## `tw()` — typed Tailwind classes

`tw()` takes a Panda-like object, types it against your real Tailwind design
system, and returns a class string. Tailwind stays the single CSS engine: no
PostCSS config, no runtime CSS-in-JS.

### How it works

- **`tw:codegen`** — loads your `tailwind.css` through Tailwind's own design
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
- **`tw:scan`** — Tailwind v4 scans source files for literal candidates, so
  dynamically composed classes are invisible to it. The scanner statically
  evaluates every `tw({ ... })` call through the same runtime and writes a
  safelist file that Tailwind generates CSS for.
- **Per-route CSS splitting (opt-in)** — `pandwindCssVite(preset,
{ splitByRoute: [{ match: /\/routes\/admin\//, name: "admin" }] })`
  serves route-exclusive atoms from `pandwind:css?route=<name>` while
  shared atoms and unmatched files stay in the global sheet; a virtual
  `pandwind:css-manifest` module exports the route -> id map. Default
  remains one global stylesheet.
- **Theming** — declare theme scopes on your tokens module
  (`themes: { dark: { "--color-surface": "#0b0b10" } }`) and codegen emits
  deterministic `[data-theme="…"]` override blocks next to the `@theme`
  bridge. Utilities keep referencing `var(--color-surface)`; switching is a
  `data-theme` attribute flip with zero utility CSS changes.
- **`pnpm inspect`** — pandwind studio: a local read-only dashboard over the
  analyze machinery. Coverage tab (fold elimination, CSS budget, dead
  candidates, missing-css warnings with editor links) + Design-system tab
  (theme vars, typed utility unions, bridge map, preset tokens). Extend the
  CLI, not the app, when adding metrics.
- **`tw:prune`** — optional post-codegen step: re-compiles the scanned
  `tw()` classes through the real Tailwind engine and keeps only the theme
  variables the compiled CSS actually references (the example app drops 82 →
  20 vars). Caveat: breaks dynamic token access — opt-in, run after
  `tw:codegen` whenever sources change.
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
engines. `tw:codegen --tokens <preset-module>` bridges them into a Tailwind v4
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
pnpm tw:codegen -- ./src/tailwind.css ./src --tokens ../../packages/pandwind/src/preset/example-preset.ts
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
dynamic values.

```ts
import { createCss, definePreset, defineTokens } from "pandwind";

const css = createCss(
	definePreset({ config: {} as StandardProperties, tokens: defineTokens({...}) }),
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

const css = createDesignCss(examplePreset);

css.class({
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

The plugin scans source files (like Tailwind's own scanner, and like `tw:scan`
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
import { bridge, variants } from "./bridge"; // generated by `tw:bridge`

const twAdapter = createTwAdapter({ preset: examplePreset, variants, bridge });
const css = createDesignCss(examplePreset, { className: twAdapter });

css.class({ $text: { color: "$blue-500" } }); // "text-blue-500"
tw({ text: "blue-500" }); // "text-blue-500"
```

`bridge` is a generated `(property, resolved value) -> utility` map: preset
tokens that equal a `@theme` value yield the short utility (`$blue-500` ->
`text-blue-500`); anything else falls back to an arbitrary-property class
(`[margin-top:7px]`), which is still real Tailwind CSS. Unrepresentable
declarations — `$input` dynamics, unknown conditions — **throw a clear error**
instead of silently emitting a class that has no CSS in this mode.

The generator (`tw:bridge`) sweeps Tailwind's own class list and keeps only
direct-property utilities that resolve against your `@theme`, so the bridge
stays small (~36 KB for the example preset) and cannot drift from what
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

const css = createDesignCss(examplePreset, { className: createNamedAtomsStrategy() });
css.class({ $text: { color: "red" } }); // "pw-color-red" (rule in the generated sheet)
```

Switching modes is a one-option change; call sites never move.

## Tailwind compatibility — proven, not assumed

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
(esbuild, minified + gzip): `css()` ≈ 1.1 KB, `tw()` ≈ 1.0 KB, `cx()` ≈ 3.0 KB,
all three together ≈ 3.7 KB gz. The build-time stylesheet generator would add
~20 KB gz (postcss-selector-parser) and is deliberately not exported from the
runtime barrel. Real numbers for the runtime, the example build and the
alternatives (stylex, panda, emotion/chakra, tailwind-merge, tokenami) live in
[SIZE.md](./SIZE.md); per-call runtime benchmarks against those same
alternatives live in [BENCH.md](./BENCH.md).

## Why pandwind exists

The short version of the decisions behind this repo lives in [TODO.md](./TODO.md)
under _What we deliberately don't do (and why)_. The highlights:

- **No chakra/emotion-style runtime CSS-in-JS** — a mini runtime that resolves
  styles at runtime is exactly the perf and caching cost we're avoiding.
- **No panda-style PostCSS pipeline or mini runtime** — Tailwind compiles once,
  statically; `tw()` output is plain class strings.
- **No cva/sva, no config files** — a minimalist API you can hold in your head;
  codegen stays plain scripts.
- **No hand-maintained tailwind-merge config** — conflict rules are generated
  from the engine, so they can't drift from what Tailwind compiles.
- **No 500-prop CSS API** — the design `css()` surface is ~30 Figma-inspector
  props; everything else lives under `$raw` on purpose.
- **No panda-like runtime bloat** — the shipped runtime is ~3.7 KB gz for
  css+tw+cx; the stylesheet generator is build-time only.

## Repo layout

```
packages/pandwind/        the library: css engine, tw codegen/runtime, vite plugin
  src/css/                panda+stylex mixed atomic css() engine
  src/design/             design css() — $frame/$layout/$text vocabulary
  src/tw/                 tw() runtime, oxc scanner, type/codegen
  src/vite/               pandwindVite() tw inliner + pandwindCssVite() extractor
  tests/                  vitest + tstyche suites
apps/example/             Vite + React app: plain Tailwind, tw(), design css() and both plugins
```

## Commands

```sh
pnpm install
pnpm --filter example dev       # dev server (runs codegen + scan first)
pnpm test                       # vitest + tstyche
pnpm typecheck
pnpm tw:codegen                 # regenerate types.d.ts + tw.ts
pnpm --filter example tw:scan   # regenerate the safelist
pnpm --filter example build     # production build (tw() inlined, css() extracted)
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
- Tailwind overloads utilities like `text-*` (size, color, alignment). One key
  per utility means you use an array: `tw({ text: ["2xl", "gray-900"] })`.
  Semantic sub-keys (`textSize`/`textColor`) are planned.
- Dynamic `css()` values (variables, `$input`) aren't covered by the static
  extractor — they need runtime styles, exactly like dynamic Tailwind classes.
- **What about node_modules?** Same answer as Tailwind: the tw() inliner
  transforms any module in the graph, but Tailwind's scanner only scans the
  sources it's configured to scan. Classes used by a library component need
  `@source inline "../node_modules/..."` or an explicit safelist entry. The
  css() extractor skips node_modules by default (configurable via
  `include`/`exclude`).
