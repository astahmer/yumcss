---
title: Technical overview
description: How pandwind's APIs, compilers, adapters, scanners, backends, and validation pipelines fit together.
sidebar:
  order: 3
---

This page is the map of the system. It is intentionally organized around
entrypoints and data flow rather than individual files. The call trees were
checked against the working tree with `calldiff tree`; the file names below are
the ownership boundaries where policy currently lives.

## One-page summary

```text
application code
  ├─ tw(style intent) ────────┐
  ├─ css(style object) ───────┼─> semantic style program
  ├─ design css(vocabulary) ──┘       │
  └─ cx(class/style inputs)            ├─ Tailwind class backend
                                      ├─ extracted CSS backend
                                      ├─ React Native object backend
                                      └─ OpenTUI object backend

build tools
  ├─ Vite/unplugin: scan → fold/extract → emit artifact → serve/invalidate
  ├─ codegen: theme → catalog → conflicts/variants → types/runtime/bridge
  ├─ codemod: detect → config → scan → parse → semantic IR → lower → validate → rewrite
  └─ analyzer: scan → classify → residuals → CSS shape/budget → report/Studio
```

The stable center is semantic intent plus explicit capabilities. A backend or
adapter may reject a feature, but it must report the lossiness instead of
silently changing the result.

## API and artifact matrix

| Entry point             | Input                                                | Primary execution                          | Output                             | Best for                               |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------ | ---------------------------------- | -------------------------------------- |
| `tw()`                  | Typed utility object                                 | Static fold, Tailwind scan                 | Class string                       | Utility-first CSS with minimal runtime |
| `css()`                 | CSS/property object                                  | Atomic declaration lowering                | Class/declaration map              | CSS-in-JS and extracted atoms          |
| `createDesignCss()`     | `$frame`/`$layout`/`$text` object                    | Design vocabulary resolution, then `css()` | Class/declaration map              | A constrained design-system language   |
| `cx()`                  | Strings, arrays, conditional values, foldable styles | Conflict-aware merge                       | Class string                       | Composition across all lanes           |
| `pandwindVite()`        | Source modules                                       | Scan, fold `tw`/`cx`, optional CSS folding | Transformed modules                | Build-time elimination                 |
| `pandwindCssVite()`     | Source modules plus preset                           | Scan, extract, canonicalize, serve         | Virtual CSS sheet                  | Atomic CSS extraction                  |
| `pandwind-codemod swap` | Source ecosystem                                     | Adapter + semantic IR + target lowering    | Rewritten source and report        | Migration between style systems        |
| `pandwind-analyze`      | Source/generated artifacts                           | Shared scan/classify/inspect               | Coverage, residual, budget reports | Adoption and regression control        |

## The runtime lanes

### `tw()`

```text
tw(style object)
  → generated typed runtime (src/tw.ts)
  → utility/value lookup
  → conflict + composition policy
  → deterministic class string
  → Tailwind emits CSS
```

The generated runtime is produced by the codegen pipeline, not hand-written by
the application. Literal calls can be folded by `pandwindVite()`. Dynamic
values stay on the runtime path and must be discoverable by `pandwind-tw scan` or a
safelist.

### `css()`

```text
createCss(preset)
  → createCssBackend()
  → normalize class-name strategy
  → resolve/flatten declarations
  → register canonical atoms
  → return css(), .class(), .vars(), .props(), .group(), .input()
```

`css()` is the runtime-capable CSS-in-JS lane. `pandwindCssVite()` scans the
same source shape and emits the static portion into a deduplicated stylesheet.
`css.vars()` carries dynamic values as inline custom properties plus a stable
class, so value changes do not create unbounded rules.

### Design `css()`

```text
createDesignCss(preset)
  → createCss()
  → DesignStyleResolver
      ├─ $frame adapter
      ├─ $layout adapter
      └─ $text adapter
  → concrete CSS style object
  → shared CSS backend
```

The design lane is a vocabulary adapter over the same CSS engine. Its module
registry is replaceable, so another design language can implement the same
resolver port without changing the façade.

### `cx()`

```text
cx(inputs)
  → flatten strings/arrays/conditionals
  → resolve static constants and imported merges when safe
  → apply conflict + compose rules
  → preserve dynamic inputs for runtime
  → deterministic merged class string
```

The Vite `cx` compiler folds only what it can prove. Dynamic conditionals,
unknown helpers, spreads, and non-literal values retain runtime behavior.

## Build-time pipelines

### Vite and unplugin

The principal Vite composition root is `pandwindVite()`:

```text
pandwindVite(options)
  └─ createInlineTwPluginCore
      ├─ createPandwindEngineContext
      │   └─ createLiteralStyleCompiler
      ├─ createCssSourceService
      ├─ createCrossModuleConstResolver
      ├─ transform
      │   ├─ find imports
      │   ├─ load generated config
      │   ├─ inline tw calls
      │   ├─ fold css calls when configured
      │   └─ inline cx calls
      └─ invalidate on module changes
```

`pandwindCssVite()` uses the same source service but routes literal CSS calls
through extraction and a virtual stylesheet. The scanner is language-aware and
the service is shared with unplugin and analyzer consumers.

### Tailwind codegen

```text
generateDesignSystem(input)
  → load theme/token input
  → load Tailwind design system
  → build utility catalog
  → analyze conflicts and variants
  → emit declarations/runtime/bridge
  → write types, runtime, theme, and interop artifacts
```

The generated `pandwind.interop.json` is the project-context boundary consumed
by codemods and analysis. It avoids guessing from a collection of generated
files and keeps utility, variant, conflict, token, and theme facts together.

## Migration pipeline

Every source/target pair uses the same orchestration ports. The ecosystem
specific part is an adapter, not a branch in the CLI:

```text
runAdapterMigration(source, options)
  → resolve source + target adapters
  → detect source usage
  → load source and target config
  → shared source scan
  → adapter.parse()
  → normalize into StyleProgram / rule-level IR
  → lowering registry + capability checks
  → adapter.emit()
  → adapter.validate()
  → apply source edits/import rewrites
  → residual + lossiness report
```

The flat `SwapIR` remains the fast path for simple object/call rewrites. Rich
programs use the versioned semantic IR for globals, keyframes, font faces,
layers, supports, selectors, nesting, ordering, dynamics, themes, and
component subjects. Both paths preserve provenance and explicit residuals.

### Adapter shape

```text
StyleAdapter
  ├─ detection
  ├─ config loading
  ├─ parse → semantic program
  ├─ emit → target source
  ├─ dependencies
  ├─ capability/lossiness declaration
  └─ validation

StyleAdapterPlugin
  ├─ manifest/version/dependencies
  └─ one or more StyleAdapter implementations
```

Built-in adapters are composed in one catalog; third-party plugins can supply
the same contract through discovery. A Panda-to-Pandwind migration can choose
the `tw`, `dss`, or `css` target dialect without changing the Panda source
adapter.

## Shared scanner and analyzer

```text
SourceScannerRegistry
  ├─ TypeScript/TSX
  ├─ JavaScript/JSX
  ├─ Vue SFC
  ├─ Svelte
  ├─ Astro
  ├─ MDX
  └─ framework dialect adapters
           │
           ├─ Vite CSS extraction
           ├─ Vite tw/cx folding
           ├─ codemod source detection/parsing
           ├─ analyzer coverage/residual collection
           └─ Panda project migration
```

The scanner owns language selection, parsing, source ranges, exclusions, and
diagnostics. Callers should consume scanner contracts rather than checking
extensions or calling `parseSync` directly.

Analyzer flow:

```text
collect files
  → shared scan/classification
  → fold coverage + dynamic/residual collection
  → optional Tailwind artifact compilation
  → CSS shape, provenance, and budget metrics
  → human/JSON/GitHub/Studio report
```

## CSS artifact lifecycle

```text
RuleStore
  → Canonicalizer
  → OrderingPolicy
  → Serializer
  → StyleElementSink / SSR serializer / devtools provenance
```

The browser CSS backend and runtime sheet share identity and ordering rules.
SSR and hydration must consume the same canonical artifact inputs. Route
splitting adds common and route-exclusive buckets without changing rule
identity.

## Backend matrix

| Backend          | Artifact                          | Strongest semantics                    | Main capability boundary                  |
| ---------------- | --------------------------------- | -------------------------------------- | ----------------------------------------- |
| CSS              | Classes, rules, custom properties | Selectors, media/supports, layers, SSR | Browser CSS is required                   |
| React Native     | Style objects                     | Platform layout and native props       | No browser selectors/at-rules             |
| OpenTUI          | Terminal object/frame output      | Cell sizing, borders, theme states     | No browser cascade or DOM                 |
| Tailwind adapter | Utility class strings             | Existing Tailwind compiler/config      | Utilities must be catalogued/discoverable |

Object backends share conversion mechanics and expose typed capability and
lossiness contracts. Unsupported semantics are diagnostics, not silent drops.

## Validation pyramid

```text
                 browser / native / PTY / SSR
              ┌───────────────────────────────┐
              │ observable output + hydration │
              └───────────────────────────────┘
             integration: Vite, unplugin, CLI,
                       generated consumers
          ┌─────────────────────────────────────┐
          │ package boundaries and artifacts     │
          └─────────────────────────────────────┘
        unit/type: policies, IR, adapters, tokens,
                         conflict rules
```

Measured core-package coverage from the current gate:

```text
pandwind         statements 86.83%  █████████████████  branches 74.59%  ███████████████
codemod          statements 76.82%  ███████████████   branches 64.51%  █████████████
analyze          statements 74.07%  ██████████████    branches 61.79%  ████████████
```

These are regression floors, not a claim that every environment-only branch
is covered by a unit test. Run `nub run test:all` for the complete suite and
`nub run test:coverage` for the enforced package thresholds. See [Testing
pandwind](/contributing/testing/).

## Where to change the system

| If you need to change…  | Start at…                                     |
| ----------------------- | --------------------------------------------- |
| A user-facing style API | Its façade, preserving the frozen surface     |
| A source ecosystem      | One codemod adapter and its contract fixtures |
| A target runtime        | A backend adapter and capability contract     |
| A language/file format  | A scanner language adapter                    |
| A CSS rule policy       | Stylesheet/runtime policy ports               |
| A migration semantic    | Versioned IR plus lowering/validator plugin   |
| A report or budget      | Analyzer service ports and report renderer    |
| A build integration     | Thin Vite/unplugin composition root           |

For architecture rules and ownership constraints, see [Architecture](/contributing/architecture/).
For migration proof requirements, see [Compatibility](/interop/compatibility/)
and [the adapter contract](/reference/adapter-contract/).
