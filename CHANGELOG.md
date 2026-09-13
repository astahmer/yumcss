# Changelog

All notable changes to `pandwind` are documented here. The project has no
released version yet — entries group the development waves that produced the
current `0.1.0` state.

## Unreleased — 2026-09-13 static-first codemod output

### Fixes

- Centralize portable target emission so literal programs use `css.class()`
  while only genuine runtime values use `css.vars()`. Generated code now uses
  `css` by default, with a collision-specific fallback when source code already
  owns that binding.

## Unreleased — 2026-09-13 preset-aware runtime values

### API

- Add `createCssOpen(preset, options)` for applications that need an open
  style-object surface with the preset's token resolution in `css.vars()`.
  Raw CSS values remain unchanged, and no app-level `css.vars` monkey patch is
  required.

## Unreleased — 2026-09-12 Vite preset HMR

### Fixes

- `pandwindCssVite` can reload a configured preset source module and its
  imports during Vite HMR, keeping the virtual stylesheet in sync without a
  manual dev-server restart. Configure `presetModule` and, for named exports,
  `presetExport`.

## Unreleased — 2026-09-12 host CSS cascade

### API

- Replace declaration-wide `important` output with opt-in `cascade:
"specificity"` (StyleX-like priority specificity) or `cascade: "layers"`
  (`@layer pandwind`). Default CSS output remains unchanged.

## Unreleased — 2026-09-12 CSS alias lowering

### Fixes

- CSS output can lower Chakra/Panda-style aliases such as `bg`, `px`, and
  `minH` through the optional `pandwind/css/shorthands` catalog. Default CSS
  factories preserve authored property names, keeping the alias table out of
  bundles that do not opt in.

## Unreleased — 2026-08-25 wave (multi-target backends)

### API

- **Style backends** (`pandwind/react-native`, `pandwind/opentui`, plus the
  render-agnostic `pandwind/stack` / `pandwind/stack/react` subpaths): the
  design layer now lowers a resolved flat style IR to non-web targets — RN
  registered style objects, OpenTUI plain style objects — with per-target
  unit policies and a strict condition policy (unresolvable conditions throw
  loudly). See [BACKENDS.md](./BACKENDS.md).
- New example/e2e apps: `apps/css-example`, `apps/rn-example`,
  `apps/opentui-example`, each asserting rendered output on a real host.

### Fixes

- opentui-example: disable mouse-movement tracking and restore terminal modes
  on teardown via `renderer.destroy()` before exit — no more raw SGR mouse
  fragments leaking into the terminal.

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
