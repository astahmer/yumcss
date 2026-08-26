# Plan 022 — Bidirectional style-API codemods (swap anything with anything)

**Status: LANDED 2026-08-26 — IR + parsers + core emitters + outbound
(tailwind/panda/stylex) + `swap` CLI + 19 tests incl. CLI e2e; 72/72
codemod tests green. Approved by maintainer 2026-08-25 ("lets make a plan then work on it directly,
dont wait for my approval"). Implementation starting immediately.**

## Context

The codemod package (`packages/codemod`, see plans/008) already migrates INTO pandwind:
`--to=tw|cx|css` rewrites `className="..."` strings using generated metadata, and
`--from=styled-components,stylex,panda` converts foreign libraries. Paths/globs are
positional args today. All mapping intelligence comes from codegen artifacts
(`types.d.ts`, `tw.ts`, `bridge.ts`), nothing hand-maintained.

What it cannot do yet:

- Convert BETWEEN pandwind APIs (`tw()` ↔ `css.class()` ↔ `createDesignCss()` `$frame`
  vocabulary ↔ raw `css()` objects).
- Convert OUT of pandwind to external libs (tailwind class strings, panda-css,
  stylex).
- Be validated end-to-end from the CLI (tests exercise functions, not the binary).

## Goal

One sentence: any styling call site in any of our apps can be mechanically swapped to
any other pandwind API — or exported to tailwind/panda/stylex — with one CLI command,
where adding a new target library means writing exactly one adapter.

## Design

### 1. The pivot IR (`src/ir.ts`)

Every conversion goes source-API → IR → target-API. The IR is the resolved-declaration
level (same level as the backends IR in plan 021 — deliberately reused concepts):

```ts
interface SwapIR {
	entries: Array<{
		conditions: string[]; // variant chain, outermost-first: ["hover","dark"]
		prop: string; // camelCase canonical CSS property
		value: string | true; // resolved value (tokens already lowered)
	}>;
	residuals: Array<{
		kind: "dynamic" | "unknown-prop" | "unrepresentable";
		text: string;
		hint?: string;
	}>;
}
```

Residuals keep conversions lossless-in-intent: anything that cannot be represented in
the target is emitted verbatim in the closest construct plus a `pandwind:migrate-skip`
marker (existing convention).

### 2. Parsers (source side, one per input API)

| Parser            | Input shape                                    | Mechanism                                                                                                                                             |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseTwCall`     | `tw({ key: value, hover: {...} })` literals    | metadata-driven: dash-case key via `UTILITY_SUBKEYS`, value resolution through conflict-map disambiguation + bridge inverse for concrete declarations |
| `parseCssLiteral` | `css.class({ ... })` / `css({ ... })` literals | existing `parseFlatDeclarations` machinery                                                                                                            |
| `parseDesignCall` | `css.class({ $frame: {...}, _hover: {...} })`  | `resolveDesignStyle(style, tokens)` imported directly from `pandwind/design` — pure, offline                                                          |

All parsers reuse the oxc comment/string masking (`computeExcludedRanges`) — closing the
gap where only styled-components had it (recon finding).

### 3. Emitters (target side, one per output API)

| Emitter               | Output                                                          | Notes                                                                                                          |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `emitCssClass`        | `css.class({ camelCase })`, conditions as `_cond__prop` nesting |                                                                                                                |
| `emitTwObject`        | `tw({ typedKey: value, hover: {...} })`                         | bridge forward lookup; miss → arbitrary `[prop:value]`; conditions → variant nesting when named variants exist |
| `emitDesignVocab`     | `css.class({ $frame/$layout/$text })`                           | greedy vocabulary match over the ~30 Figma-style props; leftovers land in `$raw`                               |
| `emitTailwindClasses` | `className="bg-blue-500 hover:bg-blue-700"`                     | pure bridge/arbitrary emission — leaves pandwind entirely                                                      |
| `emitPanda`           | `css({ camelCase })` + `styled-system/css` import               | token values emitted as literals (v1); shorthands off by default                                               |
| `emitStylex`          | `stylex.create({ name: {...} })` + `stylex.props(...)`          | pseudo/media conditions flagged (stylex needs static keys)                                                     |

Emitter registry: `EMITTERS: Record<string, Emitter>` in `src/emitters/index.ts`.
Adding a library = one file + one registry line (the user's explicit bar).

### 4. CLI surface

New subcommand, keeping every existing flag/behavior untouched:

```
pnpm codemod swap --from=<api> --to=<api> [--write] [--diff] [--report] <paths...>
```

- `--from`: `tw | css | design` (auto-detect default: infer per call site)
- `--to`: `css | css.class | design | tw | tailwind | panda | stylex`
- Same dry-run-by-default, diff/report/skip-marker semantics as existing modes.
- `--report` finally documented in README (recon finding), DBG console.error removed.

### 5. Testing strategy

- Unit: parser × emitter matrix tests against real generated metadata (harness pattern
  already in `packages/codemod/tests`).
- Round-trip property: `tw → ir → css.class → ir → tw` stabilizes (idempotence at IR level).
- **CLI e2e (new)**: spawn `tsx src/cli.ts swap ...` as a child process against fixture
  apps checked into `packages/codemod/tests/fixtures/` (a small tw-styled app, a
  css.class app, a design-vocab app), assert rewritten file contents byte-exactly, and —
  for pandwind-target swaps — typecheck the converted fixture with the real app tsconfig.

## Out of scope (v1)

- Dynamic/template-literal call sites (unchanged from existing codemods' stance: flagged).
- Panda token-function emission (`tokens.colors.red.500`), stylex media queries.
- Vue/Svelte adapters (plans/008 backlog).

## Implementation waves

1. IR + parsers + core emitters (css.class / tw / design) + `swap` CLI wiring + unit tests.
   2a. Outbound emitters (tailwind / panda / stylex) + their unit tests.
   2b. CLI e2e harness + fixture apps (runs concurrently with 2a; disjoint files).
2. README/docs, full gates, commit split.

## Follow-up wave (2026-08-26, landed)

- **Single-line emission** — emitters never pretty-print; call sites stay one-liners.
- **Token-reference emission** (`--token-refs=<off|bare|group>`): value-capable
  targets emit preset-derived refs (`blue.500` / `colors.blue.500`) instead of
  resolved literals; authored `$tokens` normalize too. Design-vocab target keeps
  RAW preset keys on purpose ($frame values re-enter resolveDesignStyle).
- **`tokens` subcommand — the config-conversion interface**: normalized TokenSet
  IR with importers/exporters for `dtcg` JSON, tailwind `@theme` css,
  panda.config tokens ({value} leaves), and pandwind definePreset modules
  (dynamic import). Adding a format = one importer + one exporter.

Deferred (explicitly): --engine flag (Tailwind candidatesToCss resolution of
bridge misses), stylex-config importer.
