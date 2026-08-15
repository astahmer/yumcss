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
- **`pandwindVite()`** — a vite plugin that runs _before_ Tailwind's scanner
  and statically inlines `tw({ ... })` calls with literal arguments into plain
  class strings. The runtime cost becomes zero and the classes are found
  naturally; the whole runtime and conflict map tree-shake out of the bundle
  (the generated `tw.ts` is marked `@__PURE__`). Dynamic calls keep working
  through the runtime and can still be covered by the safelist.

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

Note: `css({ color: ... })` and `tw({ text: ... })` produce _different_ class
names (hashed atoms vs literal Tailwind utilities) that happen to set the same
CSS property. `cx()` is what makes them interchangeable in one className;
emitting the _same_ class name from both APIs is planned (tokens -> `@theme`
bridge, see TODO).

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

- byte-identical class names between `css()` atoms and `tw()` utilities
  (that's the token -> `@theme` bridge in TODO, not a parity claim);
- Tailwind's internal `--tw-*` custom properties, `@property` blocks and
  keyframes (implementation details, not authored styles);
- media-query syntax: Tailwind v4 emits `@media (width >= 40rem)` range
  queries, presets write `(min-width: 640px)` — semantically equivalent,
  documented in the test header, not byte-compared.

## Runtime size

The browser runtime is the three small modules above — no stylesheet
generator, no PostCSS, no parser. Measured by `tests/runtime-size.test.ts`
(esbuild, minified + gzip): `css()` ≈ 1.0 KB, `tw()` ≈ 0.8 KB, `cx()` ≈ 1.8 KB,
all three together ≈ 2.4 KB gz. The build-time stylesheet generator would add
~20 KB gz (postcss-selector-parser) and is deliberately not exported from the
runtime barrel.

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
- **No panda-like runtime bloat** — the shipped runtime is ~2.4 KB gz for
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
