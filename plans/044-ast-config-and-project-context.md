# AST-backed adapter parsing and project-context plan

## Context

Pandwind already has a shared source scanner and a versioned `StyleProgram`, but
several migration adapters still use regular expressions for semantic work:
finding imports, identifying calls, discovering style objects, and rewriting
host syntax. Regex is appropriate for cheap candidate prefilters and CSS text
normalization; it is not a reliable representation of JavaScript/TypeScript
bindings. In particular, aliased imports, namespace imports, re-exports,
shadowed locals, nested expressions, and JSX references are not consistently
handled today.

Official project-context loading is also uneven. Panda, Chakra, Tailwind,
UnoCSS, and Tokenami have official-package paths, but some still fall back to
heuristic file discovery or hand-normalized configuration. Most other adapters
have only generic fallback configuration. The fallback path must be explicit
and observable rather than silently presenting defaults as a complete project
model.

The pinned repository corpus is valid evidence data, but production adapter
code must not contain repository-specific branches. A few proof fixtures shape
inputs with literal replacements, which makes the proof less representative
than a generic scenario model should be.

This plan complements the versioned `StyleProgram` core plan and follows the
architecture rules in `AGENTS.md`: ports first, one cohesive adapter plugin per
ecosystem, no ecosystem branches in orchestration, and focused JJ revisions.

## Goal

Make adapter semantics binding-aware and project-context-aware so migrations
work for arbitrary source names and custom configuration while corpus proofs
remain honest, generic, and reproducible.

The result should preserve the fast flat `SwapIR` path, use `StyleProgram` for
rich semantics, and produce structured diagnostics whenever an official
loader, capability, or static proof is unavailable.

## What

In scope:

- A shared AST binding/reference service built on `pandwind/source`.
- AST-owned semantic call discovery and source ranges for adapter rewrites.
- Support for default, named, aliased, namespace, and re-exported imports,
  with local-shadowing protection.
- A versioned, injectable project-context/config-loader port with official
  package loading first, explicit fallback provenance, and configuration
  residuals on failure.
- Adapter-owned config/token/preset/plugin normalization for every ecosystem
  that declares those capabilities.
- Generic proof scenarios and architecture guards that reject corpus-specific
  production logic and silent semantic loss.
- Custom theme/token/config fixtures and focused adapter contract tests.

Out of scope:

- A JavaScript evaluator or arbitrary execution of untrusted project code.
- A promise that dynamic runtime behavior can always be statically invented.
- New author-facing Pandwind APIs; existing `tw`, `css`, `cx`, and design
  presets remain the surface.

## Why

The pivot only works if the semantic input is the project’s actual program,
not a best-effort match for the names used by a benchmark repository. A staff
engineer would reject regex-only semantic matching because it can silently
select the wrong binding or miss a custom one. They would also reject a
hand-maintained config approximation when the ecosystem already publishes a
loader capable of resolving presets, plugins, paths, and generated context.

## How

### Conceptual model

```text
DocumentWorkspace
      |
      v
SourceScanner -> AST + source map -> BindingIndex -> Semantic adapter parser
                                      |
                                      v
ProjectContextLoader -> official context -> normalized tokens/patterns/plugins
                                      |
                                      v
                         StyleProgram / SwapIR
                                      |
                         target adapter + validator
```

Regex may narrow candidate documents or normalize authored CSS values. It may
not decide which imported symbol a semantic call belongs to, calculate a
rewrite range, or replace AST syntax when the scanner can represent the node.

### Operations / behavior

1. Parse each document once through the shared scanner.
2. Build an immutable binding index for imports, re-exports, declarations,
   and source ranges.
3. Let an adapter query neutral bindings and AST call sites instead of
   matching local spellings.
4. Resolve project context through an injected official-loader port. Record
   loader package, resolved files, config mode, and fallback reason.
5. Normalize custom themes, tokens, presets, shortcuts, variants, recipes,
   and plugin output into adapter-owned neutral context.
6. Preserve token references only when the normalized context proves them;
   otherwise emit a typed residual with source provenance.
7. Run generic contract, purity, and differential tests without special cases
   for a named repository.

### Tech choices

| Choice              | Decision                                  | Rationale                                                                |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Semantic discovery  | OXC/shared scanner AST                    | Correct binding and source-range semantics without a runtime evaluator   |
| Candidate filtering | Masked regex allowed                      | Keeps hot paths cheap while leaving meaning to AST services              |
| Project config      | Official package first, injected loader   | Uses ecosystem semantics and remains testable without installed packages |
| Fallback config     | Explicit and provenance-bearing           | A partial model is safer than silently claiming full support             |
| Rich representation | `StyleProgram`; flat `SwapIR` retained    | Supports bidirectional semantics without taxing simple migrations        |
| Proof inputs        | Generic scenarios plus pinned corpus data | Corpus projects validate reality but must not define behavior            |

### Architecture

```text
Codemod composition root
  ├─ SourceScannerPort
  ├─ BindingIndexPort
  ├─ ProjectContextPort
  ├─ AdapterRegistry
  │    └─ one plugin per ecosystem
  ├─ StyleProgram / SwapIR
  └─ ValidatorRegistry

Adapter plugin owns:
  detection · AST matching · config loading · normalization · emission
  dependencies · capabilities · lossiness · adapter validation
```

## What this allows

- `import { css as makeStyles } from "..."` and namespace/default aliases to
  resolve without adapter-specific spelling assumptions.
- Custom project themes and token references to survive migration when the
  official context makes them knowable.
- Unsupported or partially loaded configuration to be reported as structured
  residuals rather than silently dropped.
- New language adapters, official loaders, and ecosystem plugins to be added
  without editing the migration runner.
- Real-repository proofs to exercise generic adapter behavior instead of
  corpus-shaped production branches.

## What this does not allow

- Executing arbitrary project config or runtime style functions during a safe
  static migration.
- Claiming browser/SSR parity for a capability that has no validator evidence.
- Converting framework behavior unrelated to styling, such as component
  lifecycle or event semantics.

## UI & UX

This is a library/tooling change. User-visible diagnostics should identify the
source file and binding, the official loader attempted, the fallback mode (if
any), and the exact residual/capability that needs review.

## Data model

The new internal ports should carry structured evidence rather than strings:

```ts
interface BindingReference {
	local: string;
	imported: string;
	source: string;
	kind: "named" | "default" | "namespace" | "reexport";
	range: { start: number; end: number };
}

interface ProjectContextEvidence {
	mode: "official" | "fallback" | "unavailable";
	packageName?: string;
	configFiles: readonly string[];
	reason?: string;
}
```

The exact public shape remains internal until the contracts have substitution
tests and are documented in the SDK reference.

## Implementation steps

1. Add the AST binding/reference port and default implementation over the
   shared scanner; cover aliases, namespaces, re-exports, shadowing, and
   source ranges with focused unit tests.
2. Add AST semantic call-site helpers and migrate the generic object/function
   adapter runtime plus Emotion, Panda, and StyleX semantic paths. Keep regex
   only as a bounded prefilter or CSS/text fallback.
3. Define the project-context loader contract and provenance model. Make
   Panda, Chakra, Tailwind, UnoCSS, Tokenami, MUI, and Mantine official
   loaders strict-first and explicit about fallback; keep the Tamagui compiler
   probe fail-closed when it cannot evaluate a discovered config.
4. Add normalized custom-context fixtures for every adapter that declares
   themes, tokens, presets, plugins, shortcuts, variants, or generated CSS.
5. Replace proof fixture string shaping with generic scenario builders and add
   static architecture checks for repository-name branches and corpus imports.
6. Expand adapter contract tests for aliasing, custom context, unsupported
   semantics, residuals, and target emission. Add substitution tests using a
   fake adapter and fake official loader.
7. Run focused tests, typecheck, lint, and Knip. Update architecture and
   migration documentation with the verified boundaries and remaining
   capability claims.

## Open questions

1. Which additional ecosystem packages expose stable official loaders suitable
   for safe in-process use, versus requiring an adapter-owned subprocess?
2. Should re-export resolution follow one project boundary or traverse package
   exports as a separate dependency-analysis capability?
3. Which browser/SSR validators are required before promoting a custom config
   capability from fixture evidence to production evidence?

## Acceptance criteria

- [x] Shared semantic adapter matching is AST-backed for imports, bindings,
      calls, and rewrite ranges; scanner-owned host ranges back the supported
      JSX host projections and shared Next integration. Regex remains only in
      documented candidate/text roles. Adapter-owned template dialect rewrites
      remain conservative target policy and must preserve residuals.
- [x] Aliased, namespace, and default imports are tested, and nested shadowed
      locals do not produce false positives.
- [x] Cross-file re-export resolution is implemented and exercised by adapter
      parsing tests, including bounded `export *` barrels.
- [x] Official config loaders are attempted first where supported, with
      explicit provenance and configuration residuals for unavailable or
      unevaluated paths. Focused failure coverage includes Tailwind, UnoCSS,
      Tokenami, Chakra, MUI, Mantine, and Tamagui's discovered-config case.
- [x] Custom themes/tokens/presets/plugins are preserved or reported for every
      adapter that declares a supported project-context capability; the neutral
      token catalog and custom-context suite cover Panda, Tailwind, UnoCSS,
      Tokenami, Chakra, MUI, and Mantine, while adapters without an official
      loader use explicit fallback evidence.
- [x] No production adapter contains corpus-name branches or imports proof
      fixture data; generic purity checks enforce this.
- [x] Every port added by this plan has an injectable default and substitution
      coverage: fake adapter/configuration ports, scanner/lowering injection,
      the stylesheet source port, and host framework registry substitution.
- [x] Focused unit/integration tests, targeted lint, typecheck, and Knip pass
      without running the full codemod corpus or generating `.tmp-codemod-e2e`.

## Decisions log

| Date       | Decision                                                                                              | Rationale                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 2026-09-01 | Use AST for semantic binding/call work and retain regex only for bounded filtering/text normalization | Regex cannot safely model aliases, shadowing, nested syntax, or source ranges                                       |
| 2026-09-01 | Official loaders are strict-first but fallback remains explicit and observable                        | Ecosystem packages contain semantics Pandwind should not reimplement, while missing dependencies must remain usable |
| 2026-09-01 | Pinned corpora remain evidence data, never adapter control flow                                       | Proof must validate generic behavior rather than reward repository-specific branches                                |

## Progress — 2026-09-02

The shared binding service now records nested function and catch-parameter
shadow scopes and exposes `isShadowedAt(localName, offset)`. It also indexes
imported call expressions and tagged templates with exact AST ranges. The
generic adapter parser uses those ranges for semantic-binding candidates and
retains a regex only as a bounded local syntax prefilter, so a nested parameter
no longer suppresses a valid imported call outside its scope. Focused tests
cover aliases, namespace imports, re-exports, nested shadowing, exact call
ranges, and the outer-call regression.

The production adapter tree also has a purity guard that rejects pinned corpus
names and repository URLs. The one corpus-specific StyleX comment was
rephrased around the generic `xstyle` host contract. This closes the
corpus-independence enforcement gap without moving proof data into adapters.

Cross-file relative re-export resolution is implemented by
`SourceProjectBindingIndex`: it follows bounded AST named and `export *` chains,
stops at package boundaries, caches indexes per project file, and is injected
into adapter detection/parsing. Focused source and real adapter migration
tests cover aliased imports through multiple barrels. Adapter-specific
template dialects remain deliberately outside the shared JSX range service and
must keep their own target-specific proof.

## Progress — 2026-09-09

The shared Next host integration now locates config and webpack hook ranges
through the scanner and fails closed for expression-bodied hooks. Host changes
are composed with migrated source instead of replacing it. The supported JSX
host projection path consumes scanner-owned ranges, while adapter-specific
template dialects continue to own their syntax and emit a residual when their
framework contract is not proven.

The official-context suite now proves both successful custom-token recovery and
missing-loader behavior for Tailwind, UnoCSS, Tokenami, Chakra, MUI, and
Mantine. Tamagui no longer treats the presence of `@tamagui/static` as proof
that a discovered project config was evaluated: an unavailable or unevaluated
compiler produces a configuration residual. This prevents a false “official
config loaded” claim.

The substitution tests are complete for the ports introduced here. The
focused commands are:

```sh
pnpm --filter pandwind-codemod exec vitest run \
	tests/adapter-contract-suite.test.ts \
	tests/stylesheet-source-adapters.test.ts \
	tests/migration-use-case.test.ts \
	tests/official-loader-failures.test.ts \
	tests/tamagui-adapter.test.ts
```
