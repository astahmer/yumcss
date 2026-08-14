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
- **`pandwindVite()`** — a vite plugin that runs *before* Tailwind's scanner
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

The napcss-derived engine: `createCss(preset)` returns a typed `css()` that
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

## Why pandwind exists

The short version of the decisions behind this repo lives in [TODO.md](./TODO.md)
under *What we deliberately don't do (and why)*. The highlights:

- **No chakra/emotion-style runtime CSS-in-JS** — a mini runtime that resolves
  styles at runtime is exactly the perf and caching cost we're avoiding.
- **No panda-style PostCSS pipeline or mini runtime** — Tailwind compiles once,
  statically; `tw()` output is plain class strings.
- **No cva/sva, no config files** — a minimalist API you can hold in your head;
  codegen stays plain scripts.
- **No hand-maintained tailwind-merge config** — conflict rules are generated
  from the engine, so they can't drift from what Tailwind compiles.

## Repo layout

```
packages/pandwind/        the library: css engine, tw codegen/runtime, vite plugin
  src/css/                napcss-derived atomic css() engine
  src/tw/                 tw() runtime, oxc scanner, type/codegen
  src/vite/               pandwindVite() static inliner
  tests/                  vitest + tstyche suites
apps/example/             Vite + React app using plain Tailwind, tw() and the plugin
```

## Commands

```sh
pnpm install
pnpm --filter example dev       # dev server (runs codegen + scan first)
pnpm test                       # vitest + tstyche
pnpm typecheck
pnpm tw:codegen                 # regenerate types.d.ts + tw.ts
pnpm --filter example tw:scan   # regenerate the safelist
pnpm --filter example build     # production build (plugin inlines tw() calls)
```

## Known limitations

- Dynamic values (`tw({ bg: color })` with a variable) can't be statically
  inlined or scanned — same constraint as dynamic class names in plain
  Tailwind. The safelist covers calls that are statically evaluable; fully
  dynamic values need `@source inline` or an explicit safelist entry.
- Tailwind overloads utilities like `text-*` (size, color, alignment). One key
  per utility means you use an array: `tw({ text: ["2xl", "gray-900"] })`.
  Semantic sub-keys (`textSize`/`textColor`) are planned.
