# pandwind

Panda-like typed style objects that compile to real Tailwind classes.

`tw()` gives you a small typed function with autocomplete driven by your actual
Tailwind design system — utility names, value completions and variants — while
plain `className` strings keep working right next to it. Tailwind remains the
single CSS engine: no PostCSS config, no runtime CSS-in-JS, no generated
`styled-system` to typecheck against.

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

## How it works

- **`tw:codegen`** — loads your `tailwind.css` through Tailwind's own design
  system (`@tailwindcss/node`), then generates `types.d.ts` (one key per
  utility, literal value unions, recursive variant nesting) and `tw.ts` (the
  typed `tw` instance wired with variant metadata). Autocomplete comes from the
  real engine, so it always matches what Tailwind compiles.
- **`tw()` runtime** — a few dozen lines that walk the style object and compose
  class strings: camelCase keys, array values (`ring: ["1", "gray-900/5"]`),
  negative utilities (`"-translateX": "1/2"`), compound bases
  (`flex: "col"` -> `flex flex-col`) and variant stacks.
- **`tw:scan`** — Tailwind v4 scans source files for literal candidates, so
  dynamically composed classes are invisible to it. The scanner statically
  evaluates every `tw({ ... })` call through the same runtime and writes a
  safelist file (`pandwind.safelist.ts`) that Tailwind then generates CSS for.

## Variants

Nesting mirrors the class syntax: `{ dark: { hover: { ... } } }` becomes
`dark:hover:...`. Variants that require an argument are handled too:

```ts
tw({ group: { hover: { opacity: "100" } } }); // group-hover:opacity-100
tw({ max: { md: { bg: "red-500" } } }); // max-md:bg-red-500
tw({ aria: { checked: { bg: "sky-600" } } }); // aria-checked:bg-sky-600
tw({ "@": { md: { hover: { bg: "red-500" } } } }); // @md:hover:bg-red-500
```

The join separator (`:`, `-` or none) is detected at codegen time by compiling
sample candidates with Tailwind's own engine.

## Known limitations

- Dynamic values (`tw({ bg: color })` with a variable) can't be scanned into the
  safelist — same constraint as dynamic class names in plain Tailwind.
- Tailwind overloads utilities like `text-*` (size, color, alignment). One key
  per utility means you use an array for several values:
  `tw({ text: ["2xl", "gray-900"] })`. Split semantic keys are planned.
- The safelist step is a codegen script today; a Vite plugin that inlines `tw()`
  calls at compile time is the planned replacement.

See [TODO.md](./TODO.md) for the roadmap.

## Repo layout

```
packages/pandwind/   the library: runtime, codegen, scanner, preset, tests
apps/example/        Vite + React app using both plain Tailwind and tw()
```

## Commands

```sh
pnpm install
pnpm --filter example dev       # dev server (runs codegen + scan first)
pnpm test                       # vitest
pnpm typecheck
pnpm --filter example build     # production build
```
