# Pandwind migration playbook

## 1. Establish a reproducible workspace

Before editing:

- Create a new JJ workspace when the default checkout contains unrelated or
  concurrent work. Do not rebase or rewrite another agent's workspace.
- Record `jj status`, the current revision, the source repository commit, and
  the package-manager lockfile state.
- Keep the reference checkout immutable. Materialize migrated output in a
  temporary directory or a dedicated migration workspace.
- Discover commands from `package.json`, workspace configuration, and CI.
  Do not guess that `build`, `dev`, or `test` means the same thing across
  frameworks.

Capture this inventory:

| Boundary | Questions                                                            |
| -------- | -------------------------------------------------------------------- |
| Host     | React/Next, Vue, Svelte, Astro, Solid, MDX, RN, OpenTUI?             |
| Styling  | Which packages, entrypoints, aliases, plugins, presets, and loaders? |
| Runtime  | SSR, hydration, streaming, RSC, client-only islands, CSP?            |
| Sources  | TSX/JSX, Vue SFC, Svelte, Astro, MDX, CSS, config files?             |
| Outputs  | Generated CSS, manifests, theme artifacts, class maps, declarations? |
| Proof    | Routes, interactive states, snapshots, SSR fixtures, size budgets?   |

Do not begin with a blind global replace. First locate the style factories,
merge helpers, theme/config definitions, compiler plugins, and generated
artifacts.

## 2. Prepare Pandwind before converting calls

The target design system must exist before the codemod runs:

1. Define or import the target preset and tokens.
2. Generate the target artifacts (`types.d.ts`, `tw.ts`, `bridge.ts`, theme
   CSS, safelist/agents metadata where applicable).
3. Import the target stylesheet in the actual application entrypoint.
4. Configure the Vite/host compiler plugin and shared source scanner for every
   language used by the repository.
5. Run the scanner once and verify that representative literals are present.

Generated artifacts are contracts. If a value is absent from generated types,
fix the preset or token source; do not silence the error with `any` or a string
cast.

Use the codemod metadata directory explicitly when the repository has more
than one app:

```sh
pnpm tw:codegen
pnpm tw:bridge
pnpm tw:scan
pnpm codemod 'apps/**/*.{ts,tsx,vue,svelte,astro,mdx}' --to=keep --meta=apps/site/src
```

## 3. Understand the migration architecture

Every route is composed through ports:

```text
DocumentWorkspace
  → SourceScanner(language adapter)
  → SourceStyleAdapter
  → StyleProgram or flat SwapIR
  → LoweringRegistry
  → TargetStyleAdapter
  → Host/Backend adapter
  → ValidatorRegistry
  → MigrationReport
```

`SwapIR` remains the cheap path for flat static swaps. Use the versioned
`StyleProgram` for rule-level semantics: globals, keyframes, font-face, layers,
supports, selectors, nesting, ordering, themes, composition, runtime context,
provenance, and residuals.

A new ecosystem should be one registered plugin/adapter. It owns detection,
config loading, parsing, normalization, emission, dependencies, capabilities,
lossiness, and adapter validation. Do not add its package name to the CLI,
runner, scanner, or a central strategy switch. Built-in identities are typed;
third-party identities use the registry's branded identifier factory.

The scanner is language-agnostic. Filesystem providers read documents;
language adapters parse TSX, Vue, Svelte, Astro, MDX, or another dialect. Do
not duplicate extension checks or parser calls in each consumer.

## 4. Migrate in a safe order

### 4.1 Normalize merge helpers

Convert `clsx`, `classnames`, `classcat`, and `tailwind-merge` wrappers to
`cx()` first. Preserve falsy values, arrays, conditional objects, and existing
class strings. Never concatenate class strings manually after the pass.

### 4.2 Convert static utility/class usage

Run the `tw` pass in dry-run mode, review the diff, then write it. Preserve
unknown or arbitrary classes when the target cannot prove equivalence. Verify
conflict ordering and responsive/state variants.

### 4.3 Convert static CSS-in-JS

Prefer:

```tsx
const className = css.class({ color: "$blue-500", _hover: { color: "$blue-600" } });
const styleMap = css({ display: "flex", gap: "4" });
const dynamic = css.vars({ color: props.color });
const merged = cx(tw({ px: "4" }), className, props.className);
```

Use `css.class()` for the normal static element path. Use `css()` only when
individual declaration classes are needed for composition. Use `css.vars()`
for a value that genuinely depends on runtime input; it carries values as
custom properties while the rule shape remains statically extracted. Use
`css.raw()` only for an explicit authored-style escape hatch or a non-CSS
backend.

For design vocabulary use `createDesignCss`/`dcss` and keep the shared design
object independent of its CSS, React Native, or OpenTUI backend.

## 5. Static-first dynamic lowering

Classify every dynamic value:

| Case                                     | Preferred result                                  |
| ---------------------------------------- | ------------------------------------------------- |
| Compile-time constant/theme expression   | Evaluate and emit a static declaration            |
| Runtime declaration value                | Static rule + `css.vars()` custom property        |
| Conditional value with a known host prop | Host wrapper + static carrier + vars              |
| Runtime selector/component subject       | Framework-aware rewrite or residual               |
| Dynamic media/container condition        | Evaluate if constant; otherwise explicit fallback |
| Global/keyframe/font-face semantics      | Rule-level IR and target validator                |
| Imperative injection/API side effect     | Dedicated runtime adapter or residual             |

Do not retain a CSS-in-JS runtime merely because the source used a template
literal or a function-valued declaration. First ask whether the declaration,
rule shape, theme lookup, or host carrier can be statically extracted.

Runtime CSS is justified only when static lowering would change behavior, such
as an opaque mixin, a selector whose subject is a runtime component, a truly
runtime media/container query, imperative JSS rule application, or framework
execution semantics that need a prop/theme wrapper. The fallback must be
counted and named in the report.

## 6. Ecosystem-specific guidance

### styled-components / Emotion / Goober / Fela

- Convert intrinsic `styled.tag` declarations to static classes.
- Preserve component subjects with a host wrapper and JSX/template rewrite.
- Keep `as`, `className`, `style`, forwarded props, and existing attributes.
- Convert theme reads to target tokens or a target-owned theme context.
- Handle composed selectors with stable component identity classes and correct
  zero-specificity/base ordering.
- Keep component-selector interpolation, opaque fragments, dynamic conditions,
  and imperative behavior as explicit residuals until a safe lowering exists.

### Panda / Stitches / Vanilla Extract / StyleX / Linaria

- Load config and generated artifacts through the source adapter.
- Preserve recipes, variants, compound variants, tokens, CSS variables, and
  plugin transforms in semantic IR rather than flattening them into text.
- Map target recipes to `createRecipe`, static classes, or explicit residuals.
- Treat generated files as evidence and regenerate them after source changes.

### JSS / React-JSS

Separate declarative rule objects from imperative `link`, `update`, sheet,
and plugin APIs. Declarative static rules can lower to classes; imperative rule
application needs a runtime adapter or a framework-specific rewrite. Never
claim a JSS migration is complete because the object syntax parsed.

### Tailwind / UnoCSS / Tokenami

Use the generated utility/token bridge. Preserve arbitrary values, variants,
important modifiers, custom plugins, and theme aliases. Unknown utilities stay
verbatim or become residuals; never guess a nearest utility without a declared
lossiness policy.

### Chakra UI / MUI / Mantine / next-yak

Distinguish component behavior from styling. Migrate style props and static
theme values through a source adapter, but keep accessibility behavior,
polymorphism, slot structure, variant logic, and framework-specific wrappers.
Use real component examples, not only isolated style objects.

## 7. Residual policy

Residuals are a product surface, not a failure to hide. Each residual should
contain a stable kind, source location/provenance, adapter, capability, and a
human-readable explanation. Report at least:

- skipped call sites and why they were skipped;
- parse failures and unsupported syntax;
- dynamic selectors/subjects/conditions;
- theme/runtime context dependencies;
- plugin-generated or imperative behavior;
- lossy token/property/variant conversions;
- required manual edits, if any.

If a residual is safe to preserve, retain the source import/call and mark it.
If it is unsafe to preserve, fail the migration rather than emit partial code.
The next implementation step is a lowering or adapter capability, not a
central special case.

## 8. Validation matrix

Run validation at increasing cost:

1. Parse all changed documents and verify imports/exports.
2. Run codemod contract, scanner contract, lowering, backend, and validator
   suites.
3. Assert idempotence: a second dry run reports zero changes.
4. Typecheck, lint, unit tests, integration tests, and production builds.
5. Compare canonical CSS after normalizing hashes and implementation-owned
   style-node placement. Check rule order, specificity, media queries, tokens,
   keyframes, font-face, and custom properties.
6. Run SSR output and hydration checks. For Next/RSC, include streaming and
   client/server boundary fixtures.
7. Run browser route/state snapshots at desktop, mobile, dark/light, reduced
   motion, hover/focus, open/closed, and data-loading states.
8. Compare CSS transfer/unique bytes and runtime bundle impact. Equal or
   smaller is the default acceptance bar; document every intentional increase.

The browser harness must assert HTTP status, rendered error text, console/page
errors, geometry, computed styles, SVG shape/style, interaction behavior,
hydration, and screenshot differences. A screenshot alone is insufficient.

## 9. Evidence and acceptance report

Pin a machine-readable report containing:

```text
source repository + commit
target Pandwind revision
adapter/plugin ids and versions
source files / changed files
converted / static / dynamic / fallback / skipped counts
residual list and lossiness
canonical CSS result
SSR/hydration/streaming result
route/state browser result
reference and candidate byte totals/deltas
commands and environment
```

Track both `staticExtractionRatio` and `staticCssCoverageRatio`: the former
counts fully static calls; the latter counts calls whose CSS rule is extracted
without runtime stylesheet injection. Do not conflate dynamic values carried
by `css.vars()` with runtime CSS injection.

## 10. Architecture and JJ completion checklist

- [ ] Source and target are registered adapters, not route-specific branches.
- [ ] Scanner and filesystem providers are shared and language-agnostic.
- [ ] Framework and backend behavior is selected through host/backend ports.
- [ ] Typed identities and registries replace repeated magic-string switches.
- [ ] Generated files were regenerated, not hand-edited.
- [ ] Residuals are explicit, reproducible, and never silently dropped.
- [ ] Contract tests accept a fake adapter without core changes.
- [ ] Real repository fixtures cover every claimed capability.
- [ ] Unit/integration/browser/SSR/RSC/size proofs pass as applicable.
- [ ] Docs and evidence match current counts and pinned commits.
- [ ] Work is split into focused JJ revisions; unrelated workspace changes
      remain untouched.

If a check fails, fix the owning adapter/port or record a bounded residual.
Do not weaken the validator, add a central ecosystem branch, or claim a wider
compatibility surface than the evidence supports.
