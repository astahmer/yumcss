# Changelog

All notable changes to `pandwind` are documented here. The project has no
released version yet — entries group the development waves that produced the
current `0.1.0` state.

## Unreleased — 2026-09-15 static JSX style carriers

### API / codemod

- Treat finite literal style objects and arrays, including responsive JSX
  values, as static Pandwind styles. Migrations now emit one `css.class()` call
  instead of wrapping those values in `css.props(css.vars(...))`; unresolved
  expressions still stay on the runtime carrier path. Source revisions:
  `d29997b3`, `70e0f374`, `290bf570`, `6a18667a`.

## Unreleased — 2026-09-15 static color palettes

### API / codemod

- Add typed `defineColorPalettes` preset metadata for Panda/Chakra-style
  `colorPalette` usage. Palette assignments compile to one static class with
  custom-property mappings, while `colorPalette.*` references resolve through
  the app-owned color tokens.
- Preserve Panda color-palette roots, include/exclude settings, and virtual
  references when emitting a Pandwind preset, without importing Panda's default
  token catalog or introducing a runtime theme bridge.

Source revisions: `qqyulusz`, `rrxooprr`, `uspqzmlu`, `zwtzvqvk`, `nqoyxvkq`,
`tznxumys`.

## Unreleased — 2026-09-15 canonical condition names

### API / codemod

- Use underscore-prefixed names for Pandwind's built-in state, selector, and
  mode conditions. Generated Panda and project presets collapse bare aliases
  to that canonical spelling while leaving responsive and custom conditions
  unchanged. Source revision: `snuqwnpr`.
- Make the Pandwind target adapter consume the first-party preset condition
  catalog even without a loaded project config, so migrated `_hover`, authored
  underscore conditions, and common raw pseudo selectors stay on typed preset
  keys instead of becoming arbitrary selector properties.
- Fail closed for undeclared custom conditions: preserve the source with a
  typed capability residual instead of emitting an unverified selector.

Source revisions: `snuqwnpr`, `aad9c82d`, `83421402`, `e4caec1f`, `11be10fd`.

## Unreleased — 2026-09-15 condition migration fidelity

### API / codemod

- Carry target-owned condition catalogs through both synchronous and
  asynchronous migrations, so configured Pandwind conditions remain typed
  across every adapter route.
- Preserve Pandwind underscore condition keys when emitting Panda again,
  recognize nested media and selector objects as structural CSS conditions,
  and reuse the configured parser dialect for referenced style objects.
- Keep undeclared conditions and ambiguous values as source plus typed
  residual evidence instead of inventing arbitrary selectors or runtime
  carriers.

### Tooling

- Run generated-artifact checks through the built codemod CLI so Nub's
  TypeScript loader cannot resolve linked workspace packages against the wrong
  project root.

Source revisions: `utqmmrto`, `kwnsukvw`, `mkmlsrsv`.

## Unreleased — 2026-09-15 explicit runtime CSS carrier

### Fixes

- Keep ordinary migrated styles on the static `createCss()` lane, including
  dynamic `css.vars()` and `css.props()` output. Reserve `createRuntimeCss()`
  for sheet-backed global rules, keyframes, font faces, and runtime component
  registration.
- Give generated runtime modules an explicit `runtimeCss` export and preserve
  separate static and runtime project bindings when a migration needs both.
  Existing runtime modules exporting a custom binding remain supported through
  project binding discovery and aliasing.
- Make Pandwind's own runtime-rule parser accept the configured local binding,
  and remove duplicate host arrows when an adapter lowers a global component.

Source revisions: `38c52079`, `785d7229`.

## Unreleased — 2026-09-14 static style carrier hoisting

### Fixes

- Keep literal `css.class()` calls beside their JSX use by default. The
  `--hoist-static-styles` option opts into module-scope carriers for projects
  that prefer that source shape; the Pandwind Vite/unplugin compiler can still
  fold colocated literal calls to raw class strings at build time. Source
  revision: `70aa6df1`.
- Keep existing host classes inside `css.props` when migrating StyleX props
  spreads, covering both expression and quoted `className` attributes without
  generating a second `cx` merge. The static simplifier also flattens nested
  `cx` calls around hoisted Pandwind carriers into one `css.props(...).className`
  projection for every adapter. Source revision: `lqvmzxpt`.
- Keep Chakra and Panda migrations independently owned: each adapter recognizes
  its own imports and aliases, while a mixed file can run either adapter first
  and then the other without binding collisions or a second-pass rewrite. Panda
  aliases come from the host package's `imports` map or Panda's configured
  `importMap`; unrelated project aliases are ignored. Source revisions:
  `c09e1f27`, `969c5ff7`.

### Performance

- Apply Panda v2's type-graph lessons to Pandwind: use named value boundaries,
  one shared selector/condition nesting map, and an owned CSS property
  vocabulary instead of repeatedly expanding `csstype` unions.
- Remove the open CSS-config index signature's `any` and preserve arbitrary
  `$all` properties through a typed object fallback. Runtime token-map readers
  now narrow unknown configuration values at the boundary.
- Local package measurement with `tsc --extendedDiagnostics` improved from
  `399743` to `271161` type instantiations and from `299989K` to `285452K` peak
  memory; repeated check time moved from `0.168s` to `0.140s`. These are
  Pandwind package measurements, not a reproduction of Panda's fixture corpus.

Source revision: `c05a1b28`, `c05a1b28`

## Unreleased — 2026-09-13 curated CSS property contract

### API

- Export a curated `PandwindProperties` contract for common CSS declarations.
  The built-in preset applies Panda-style finite-value filtering to strict
  keyword properties while projects that need the complete grammar can
  explicitly bring their own `csstype` config.
- Apply one generic finite-value filter to strict properties and remove the
  display-specific WebKit escape hatch from the public contract.

Source revision: `c756d727d606533b6efdfdf9420c2ea3587cb65e`

## Unreleased — 2026-09-15 composable token catalogs

### API

- Make token catalogs composable through non-enumerable
  `tokens.defineSemanticTokens(conditions, layer)` and
  `tokens.defineColorPalettes(palettes)` methods. Semantic layers merge into a
  new catalog, so raw, semantic, and component token groups can be chained
  without a public type witness or standalone composer imports.

## Unreleased — 2026-09-13 static-first codemod output

### Fixes

- Centralize portable target emission so literal programs use `css.class()`
  while only genuine runtime values use `css.vars()`. Generated code now uses
  `css` by default, with a collision-specific fallback when source code already
  owns that binding.
- Make external-adapter routes into Pandwind target-aware: Chakra, Mantine, and
  MUI keep authored/static values instead of fabricating foreign CSS variables,
  canonicalize supported hosts to intrinsic elements, remove their source
  bootstrap when the migration is complete, and leave unsupported components or
  unresolved tokens as explicit residuals. Tokenami source sigils are also
  normalized to neutral target token paths. Source revision: `ktzymynt`.
- Collapse adjacent static `css.class()` calls and promote literal Stack layout
  declarations to native Stack props during generic and Panda migrations while
  preserving dynamic and responsive values. Source revision: `pmnvsvlx`.

## Unreleased — 2026-09-14 composed CSS HMR

### Fixes

- `pandwindCssVite` accepts the composed `createCss()` or `createDesignCss()`
  function used by the application and follows its Vite module graph during
  HMR. Editing the composition or its imported theme refreshes the virtual
  stylesheet without a preset path or separate config file.

## Unreleased — 2026-09-12 host CSS cascade

### API

- Replace declaration-wide `important` output with opt-in `cascade:
"specificity"` (StyleX-like priority specificity) or `cascade: "layers"`
  (`@layer pandwind`). Default CSS output remains unchanged.

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
