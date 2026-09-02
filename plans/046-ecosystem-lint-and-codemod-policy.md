# Ecosystem lint and codemod policy

Status: complete

## Question

Which ideas from the Panda, StyleX, Tailwind, Linaria, Emotion, Compiled, and
community Vanilla Extract lint ecosystems should Pandwind adopt, and where
should each check live?

## Decision rule

Use TypeScript when the compiler can prove the contract from the public API.
Use Oxlint when the check needs source-wide intent, project metadata, imports,
comments, JSX structure, or a policy that applies across several APIs. Use a
codemod only for a deterministic source rewrite whose semantic effect is
provable. Do not copy ecosystem-specific style preferences into the generic
plugin merely because another project calls them recommended.

## Candidate inventory

### Panda and Chakra

The official Panda plugin provides `file-not-included`,
`no-config-function-in-source`, `no-debug`, `no-deprecated-tokens`,
`no-dynamic-styling`, `no-escape-hatch`, `no-hardcoded-color`, `no-important`,
`no-invalid-token-paths`, `no-invalid-nesting`, `no-margin-properties`,
`no-physical-properties`, `no-property-renaming`, `no-unsafe-token-fn-usage`,
and longhand/shorthand, atomic/composite, and unified-property preferences.

Adopt the generic safety ideas as follows:

- dynamic extraction, explicit escape hatches, and residual accounting belong
  to Pandwind's existing rules;
- invalid token paths belong to the TypeScript-generated token types and the
  source adapter's official config loader;
- invalid nesting and CSS property/value validity belong to the semantic
  compiler and browser validator, not a second incomplete lint schema;
- physical/logical properties, margin policy, hardcoded colors, important,
  and atomic/composite preferences are project policy, so keep them opt-in and
  metadata-backed rather than defaults;
- debug/config-function/file-inclusion checks are Panda adapter rules, not
  generic Pandwind rules.

Chakra's analogous concerns are system/config loading, token-path validity,
style-prop forwarding, and recipe/slot semantics. Those require the official
Chakra system and belong to the Chakra adapter and migration validator.

### StyleX

The official plugin provides `valid-styles`, `sort-keys`, `valid-shorthands`,
`no-unused`, `no-legacy-contextual-styles`, `no-lookahead-selector`,
`enforce-extension`, and `no-conflicting-props`.

Adopt:

- import-aware static extraction checks, already shared by the Pandwind
  resolver;
- a generic conflict check for Pandwind-generated `className`/`style` props
  alongside a `css.props(...)` spread;
- property ordering only as a formatter/compiler policy, never as a
  correctness default;
- unused-style analysis only in the compiler, where cross-file references and
  generated artifacts are visible.

Do not duplicate StyleX's property allowlist: Pandwind's target backends and
TypeScript declarations own that contract.

### Tailwind and UnoCSS

The established community Tailwind plugin provides class ordering,
shorthand enforcement, important-modifier placement, arbitrary-value policy,
contradicting-class detection, unknown/custom-class detection, and
unnecessary-arbitrary-value detection. Other community plugins add invalid
at-rule, invalid modifier, `@apply`, `@reference`, and browser-baseline checks.

Adopt only the semantic parts:

- validate candidates and contradictions through the official Tailwind or
  UnoCSS engine plus project config, not hardcoded utility lists;
- preserve arbitrary values when they are the only equivalent representation;
- make class ordering a target emitter/codemod concern;
- make shorthand and arbitrary-value preferences opt-in project policies.

The generic lint plugin must not pretend to know a project's custom rules,
shortcuts, presets, variants, or plugins without verified loader metadata.

### Linaria, Emotion, Compiled, and Vanilla Extract

Linaria primarily recommends Stylelint for CSS syntax and uses build-time
evaluation for static values; its useful invariant is that dynamic styles use
the supported CSS-variable path rather than the static `css` tag. Emotion's
official plugin focuses on JSX/import migration (`jsx-import`, `styled-import`,
`import-from-emotion`, `no-vanilla`, and `syntax-preference`). Compiled's
plugin overlaps with a broader UI styling standard. Community Vanilla Extract
plugins add property ordering, empty-block checks, unit/value validation,
logical-property preferences, and wrapper detection.

Adopt:

- static-vs-runtime lane checks and migration import hygiene;
- wrapper/import identity only when explicitly configured or resolved by the
  adapter;
- empty/invalid CSS shape checks in the semantic compiler or TypeScript where
  they are mechanically provable.

Do not add a generic Stylelint replacement or a CSS property schema to the
Oxlint plugin.

## Implementation wave

Implement now:

1. Keep the import-aware, iterative static evaluator and migration hygiene
   rules as the generic foundation.
2. Add `no-conflicting-style-props` for JSX spreads from `css.props(...)` next
   to explicit `className` or `style` props. Report only; deleting either prop
   is not a generally safe fix.
3. Add safe Oxlint fixes only where the fix is mechanical: remove a stale
   migration marker when it is proven to precede a static call. Do not invent
   residual reasons or silently rewrite style semantics.
4. Add a configured, metadata-backed `no-physical-properties` policy only if
   the existing neutral property metadata can prove a one-to-one replacement;
   otherwise leave it as a future opt-in codemod policy.
5. Add contract tests for every new rule and keep ordinary assertions beside
   inline snapshots.

Completed decision: the current neutral metadata does not prove a safe,
universal physical-to-logical replacement. No speculative `no-physical-
properties` rule was added. The implemented wave is the import-aware
foundation, migration hygiene, the report-only JSX prop conflict rule, its
safe stale-marker fixer, and boundary tests for all of them.

Defer until there is a stable shared metadata API:

- custom Tailwind/UnoCSS utility validity and class ordering;
- Panda/Chakra recipe and token-path policy rules;
- StyleX unused-style and extension checks;
- Vanilla Extract unit/property policy rules;
- cross-file wrapper inference.

Reject for the generic plugin:

- hardcoded utility/token vocabularies;
- ecosystem-specific config-function/debug rules;
- style-preference defaults that can change CSS semantics;
- duplicate TypeScript property/value checking;
- a second codemod engine inside the linter.

## Codemod relationship

Oxlint JS plugins support automatic fixes, so a safe local fix should live on
the rule itself and be exercised through Oxlint. Pandwind's codemod remains the
place for multi-file or semantic rewrites: target-native property conversion,
imports, generated helpers, token remapping, and framework transforms. A new
codemod fix is warranted only when an Oxlint fixer cannot safely coordinate
those artifacts. Every such fix must have an input/output inline snapshot,
artifact deduplication coverage, and a source-preserving failure case.

## References

- https://github.com/chakra-ui/eslint-plugin-panda
- https://github.com/facebook/stylex/tree/main/packages/eslint-plugin
- https://github.com/francoismassart/eslint-plugin-tailwindcss
- https://github.com/callstack/linaria
- https://emotion.sh/docs/@emotion/eslint-plugin
- https://github.com/antebudimir/eslint-plugin-vanilla-extract
- https://oxc.rs/docs/guide/usage/linter/automatic-fixes
