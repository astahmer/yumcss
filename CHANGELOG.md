# Changelog

All notable changes to `pandwind` are documented here. The project has no
released version yet — entries group the development waves that produced the
current `0.1.0` state.

## Unreleased — 2026-08-23 wave (perf, compiler, packaging)

### Performance

- **cx() merge-engine v2**: twMerge-parity semantics (multi-property groups
  keep partially-covered utilities instead of dropping them; arbitrary values
  disambiguated by value shape; directional kills matching tailwind-merge).
  Parity proven against real `tailwind-merge` in CI.
- **cx() whole-input result cache** (same strategy as tailwind-merge's LRU,
  with an atom-registry guard): long-pair merges ~11× faster, warm short pairs
  in the millions of ops/sec.
- **Interned integer signature plans**: conflict checks are single int ANDs;
  multi-prop kills are bit clears.
- Vite cx/tw passes: module-level constant propagation (same- and
  cross-module) and partial folding of conditionals with static branches —
  fold coverage on the reference corpus went **13% → 63%+**.

### Compiler / build-time

- Shared per-build engine context (`engine-context.ts`) letting the tw/cx and
  css vite plugins share one preset + registry.
- Literal `css()` / `css.class()` calls fold to atom classes inside `cx()` at
  build time (byte-identical to generated stylesheet rules).
- DTCG token groups bridge into a Tailwind v4 `@theme` block:
  `tw:codegen --tokens <preset>` emits `pandwind-theme.css` and injects token
  utilities into the generated types. Example app's hand-mirrored theme
  replaced by the generated artifact.

### API

- `ClassNameStrategy` object contract (`sheetBacked` flag) replacing the bare
  callable; legacy callables still work. Second bundled mode:
  `createNamedAtomsStrategy()` — readable, sheet-backed class names.
- Additive semantic sub-keys for overloaded Tailwind keys:
  `textSize/textColor/textAlign/textWrap/textOverflow` plus `bg*`, `border*`,
  `outline*`, `textDecoration*` families — derived from compiled property
  partitions; original spellings unchanged.

### Testing & safety nets

- Runtime-size regression gate (hard budgets + tolerance guard + exact
  snapshot), wired into every `pnpm test`.
- Differential suites vs real `tailwind-merge`, seeded fuzz + golden corpus,
  robustness suite (non-happy paths never crash or drop CSS), real-vite
  integration tests.

### Packaging

- Completed `exports` map: runtime subpaths (`./css`, `./tw`, `./cx`,
  `./preset`, `./design`, `./vite`), build-time codegen helpers
  (`./codegen/types|theme|collect`), and `./package.json`.
- GitHub Actions CI running the full gate (tests incl. size budget, tstyche,
  typecheck, oxlint, oxfmt).

## Initial development — 2026-08-22 wave

- `tw()` typed Tailwind classes: codegen from your real `tailwind.css`
  (literal value unions, opacity modifiers, recursive variant nesting),
  generated conflict map (tailwind-merge semantics without hand-maintained
  config), `tw:scan` safelist collector.
- `css()` atomic CSS-in-JS engine: hashed atoms, DTCG-style tokens,
  property-priority merging, conditions/selectors, `$input` dynamics;
  `createDesignCss()` Figma-inspector vocabulary (`$frame`/`$layout`/`$text`).
- `cx()` last-wins merge across raw strings, `tw()` output and css atoms via
  the generated conflict map + atom registry.
- `pandwindVite` / `pandwindCssVite` build-time plugins; tree-shakable barrel
  (`sideEffects: false`), proven by esbuild gate + real vite build tests.
- Tailwind-compatibility proof suite and the three-layer runtime-size
  regression gate (see SIZE.md).
