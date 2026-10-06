---
title: CSS-in-JS adapter migrations
description: Safely move CSS-in-JS styles through yumcss's semantic adapter boundary.
sidebar:
  order: 2
---

yumcss's codemod treats the semantic style program as the pivot boundary. A
source adapter detects a library, parses its declarations and rule structure,
and emits a target adapter without making the target understand the source
library.

## Migrate a project

Run a dry migration first. The external adapter path does not require generated
yumcss metadata:

```sh
yumcss-codemod migrate \
  --from=emotion \
  --to=css.class \
  --dry-run --diff --report \
  "src/**/*.{ts,tsx}"
```

The built-in adapter set covers `emotion`, `styled-components`, `chakra-ui`, `mui`, `mantine`,
`vanilla-extract`, `stitches`, `linaria`, `jss`, `fela`, `goober`,
`aphrodite`, `style9`, `treat`, `compiled`, `stylex`, `react-strict-dom`, `solid-styled`,
`vue-styled`, `bamboo`, `next-yak`, `tokenami`, `unocss`, and `yumcss`.
Static source adapters additionally cover `tamagui`, `css-modules`, `sass`,
`less`, and authored `css`. Their stylesheet-aware file migrations can emit
YumCSS class maps or preserve/emit authored CSS according to the target
contract; they are not treated as runtime CSS-in-JS libraries.
Bamboo's object dialect
and Next-yak's extracted `css`/`styled` template and css-prop lanes share the
same semantic adapter contract. `--to=css.class` is the yumcss target
spelling; external targets can be selected directly too:

```sh
yumcss-codemod migrate --from=styled-components --to=emotion --dry-run "src/**/*.tsx"
```

See the [official API matrix](/interop/official-api-matrix/) for the
documented syntax families each adapter recognizes, the forms that remain
explicit residuals, and the evidence source for every claim.

With `--from=auto`, the CLI uses adapter detection evidence from imports and
known authoring calls. Pass `--meta` when a migration needs generated project
metadata.

## Safety and residuals

Safe mode is the default. It rewrites a call only when the target capability
contract and parser prove that the complete call is representable. Dynamic
interpolations, unsupported at-rules, computed keys, and parse failures stay in
place with a `yumcss:migrate-skip` marker and a machine-readable residual in
the adapter result.

Adapters also declare the package modules they own. After a successful rewrite,
those source imports and source runtime bootstrap bindings are removed, while
target imports are consolidated. Component identity is part of the contract:
for example, a styled-components subject cannot be silently lowered to an
Emotion class factory in safe mode; it remains in place with a `components`
capability residual.

The `--report` output is a migration worklist: it shows converted and skipped
sites, residual counts, and capability blockers. Use `--dry-run --diff` before
applying a write; remove `--dry-run` when the result is ready to apply.

### Why a capability skip can still be correct

The semantic IR is the pivot boundary, not a universal target API. It preserves
meaning such as a named style map, a component subject, a theme lookup, a
function-valued declaration, or a framework binding. The target still needs a
safe representation for that meaning.

For example, `styled.div({ color: "red" })` produces a component factory,
while `css.class({ color: "red" })` produces a class string. Replacing one with
the other without rewriting the JSX/template use sites changes behavior. A
JSS `{ button: {...} }` map similarly needs either a target map API or a
class-map lowering plus use-site rewrites. A theme-dependent function needs a
static evaluation, a target-native runtime carrier, or an explicit custom
property binding; a Tailwind utility cannot safely invent one from syntax
alone.

Named style maps are projected through the target adapter when the target
declares `native-map` or `class-map` support. The generic emitters apply that
projection only to named style rules, so keyframe names cannot accidentally be
wrapped as style-map entries. Class/compiler targets such as UnoCSS emit a
named lookup object whose values are generated utility strings; the adapter
parser recognizes that projection on the reverse route. Project-specific
presets still require the official generator context, and unresolved utilities
remain explicit residuals.

That is why safe mode reports a typed capability residual instead of guessing.
The bidirectional guarantee is that every declared route is resolved to a
static representation first, then the smallest validated runtime carrier, or
the unchanged source with an actionable residual. It does not mean that an AST
can manufacture a target equivalent for semantics the target does not expose.
The current implementation emits `capability-blocked`, `parse-residual`,
`lowering-residual`, `host-rewrite-required`, or `configuration-residual`
markers; the old generic `adapter capability mismatch` marker is no longer a
valid current diagnostic.

When a marker is produced by the semantic adapter runner, it includes the
ordered route (`source -> target`) and the blocked capability. For example,
`styled-components -> unocss` may be blocked by `components` because a styled
component is a host component factory while UnoCSS is a class/compiler target.
The missing work is a target-owned host projection: rewrite the declaration and
all JSX/template use sites, select the target's class/style carrier, and prove
the result in the target framework. The HIR already carries the subject,
framework, declarations, conditions, and provenance; the projection is what
turns those nodes into valid target code.

The projection is contextual. A target may use a class carrier for a styled
binding that is consumed by JSX, while using its native component factory for
an exported standalone component. Dynamic declarations are not treated as
host rewrites merely because they are functions: the runner first checks for a
real host use, then asks the target policy whether a standalone class or
component representation is valid. This is why a valid Emotion/styled-
components theme callback can remain target-native while a static YumCSS
host use becomes `css.class(...)` plus an intrinsic element rewrite.

Framework provenance alone is not a framework requirement. A hostless carrier
such as `css.class({ color: theme.foreground })` can target a runtime style API
without a JSX/template rewrite; `framework-semantics` is required only when the
program contains a component subject or host-bound attributes. Goober and Fela
declare their object carriers as exact scalar-dynamic targets, so safe mode
preserves that expression instead of reporting a false framework or capability
skip. Chakra UI and next-yak likewise negotiate their own runtime carriers for
hostless dynamic values. Static-only targets still produce a residual for the
same input unless their own adapter can lower it to a custom property or other
validated carrier. Tailwind's class target now owns that latter projection for
React/Preact host bindings: it emits an arbitrary utility using
`var(--yumcss-dynamic-...)` and adds the matching inline custom-property
binding. Existing style props and non-JSX hosts remain residuals until their
host adapter can merge the binding safely. UnoCSS uses the same custom-property
carrier and host port, while preserving the same fail-closed behavior for
unsupported host shapes.

The same carrier is available to class-oriented CSS-in-JS targets that opt in
through their adapter contract: Bamboo, Vanilla Extract, JSS, Aphrodite,
Style9, Compiled, Treat, and Linaria. In safe mode, a scalar dynamic value
whose target declares only partial native dynamic support is lowered to a
static `var(--yumcss-dynamic-...)` declaration and an inline React/Preact
binding. This keeps the generated stylesheet static; only the value lookup is
runtime code. Targets that cannot prove this carrier, or hosts whose existing
style binding cannot be merged, remain residuals.

The host-aware path also handles simple function-valued styled subjects. For
example, `styled.div((props) => ({ color: props.color }))` can become a static
target class plus a generated intrinsic wrapper whose custom-property binding
evaluates the function with `props`. The generic lowering registry never
materializes a function as a custom property without that host contract, so the
function is never stringified into CSS. More complex functions, unsupported
hosts, and targets without this contract remain explicit `function-dynamic`
residuals.

There is one additional safe static case: a styled intrinsic used as a
discarded expression statement has no component value to preserve. The shared
host boundary detects that shape and lets class-valued targets lower it in
place. Assignments, returns, calls, exports, and actual host uses still require
the component/host projection contract; this distinction prevents both false
skips and accidental class-for-component coercion.

Target representation negotiation is also fail-closed. When a target
explicitly refuses the detected framework or host shape, the runner does not
reuse its default representation and hope that a later validator catches the
mistake. The original source remains intact and the result carries a typed
`host-framework` residual. Migrating an adapter to itself is an identity
operation and therefore leaves the source unchanged without producing a
capability diagnostic.

Some targets also require a host use to carry the converted value. MUI's
`sx`-based target declares that contract explicitly, so a bare style binding
is preserved with a target-owned explanation instead of being emitted as an
object that has nowhere to attach. Once a component prop is present, the same
adapter can project the value to `sx={...}`.

Some targets have a native component projection instead of a class projection.
For example, a React styled-components subject can become MUI's
`styled("div")({...})`; the MUI adapter does not claim that the same source is
valid Solid or Vue output. Those cross-framework migrations need a host
adapter that rewrites bindings, attributes, and lifecycle semantics, so safe
mode reports `framework-semantics` until that adapter exists.

MUI also demonstrates a host-prop projection in the other direction. A
YumCSS class binding used as `className={card}` becomes an object binding
plus `sx={card}`. An inline expression becomes an object-valued `sx` prop.
There is deliberately no standalone MUI `sx()` function. Static unused
standalone bindings therefore select an explicit portable-artifact fallback:
the MUI adapter keeps YumCSS's `css.class(...)` carrier and declares the
extra YumCSS dependency, preserving the style without pretending that MUI
has a standalone `sx()` API. Dynamic unused bindings use the same YumCSS
carrier as an explicit runtime fallback, while dynamic unknown hosts still
produce a typed `host-framework` residual. Intrinsic hosts
such as `<div>` become `<Box component="div" sx={...}>`, preserving the
rendered element because `sx` is not a native DOM prop. Unknown custom
components use the portable static fallback when their declarations are fully
static; dynamic custom hosts remain residuals unless their MUI ownership is
proven by the source imports.

StyleX uses the same target-owned host port with a different representation.
A static React styled subject can become a StyleX style object and its
intrinsic use is rewritten from `<Card />` to
`<div {...stylex.props(Card)} />`. This is not a generic class rewrite:
StyleX's `props` helper owns the returned host props, and the adapter keeps a
residual for unsupported framework or attribute shapes.

JSS has a target-native static class carrier as well. A static YumCSS style
used by a React host can become
`jss.createStyleSheet({ style: {...} }).attach().classes.style`, preserving the
existing `className` contract. The adapter does not substitute a
`react-jss` hook where the source needs a class value; dynamic/function-valued
styles still require their own host-aware lowering.

Style9 is another class-oriented target with a different native call shape:
static styles become `style9(style9.create({ style: {...} }).style)` and can
continue to feed an existing React `className`. This target emission is
adapter-owned, so the central route runner remains independent of Style9's
callable wrapper.

React Native is a style-prop target rather than a DOM class target. A static
YumCSS binding used by a file importing `react-native` becomes
`StyleSheet.create({ style: {...} }).style`, and the host use is rewritten from
`className={card}` to `style={card}`. The projection is deliberately rejected
for ordinary React or template hosts until a compatible host adapter is
selected; the HIR is preserved, but it cannot make a DOM class attribute valid
React Native code by itself.

Standalone subjects are a separate case from class bindings. For static
`const Card = styled.div\`...\``declarations without a local`<Card />` use,
the YumCSS target emits a static class carrier inside a host-native component
wrapper. React-family/Solid JSX and Vue SFC output have different wrapper
contracts, so the host adapter owns the syntax and import placement. Runtime
CSS is used only when the declaration contains a genuinely dynamic
interpolation that cannot be statically evaluated.

The same rule applies when the target is an external class-oriented adapter:
the target emits its native class carrier first, and the host port wraps it
back into an intrinsic component if the styled subject has no local use. It
must never leave a class string assigned to a component binding. Target-owned
normalization also runs before validation; for example, StyleX converts a
numeric `padding: 16` into its equivalent `padding: 16px` while preserving
unitless numeric properties.

Likewise, `JSS/StyleX/Aphrodite -> UnoCSS` can be blocked by `named-rules`.
Those adapters expose a named lookup object, while UnoCSS currently accepts
class literals and generated CSS, not a runtime style map. Flattening
`styles.button` into one class would be a semantic regression. The correct
next adapter feature is a generated stylesheet plus a stable lookup projection
and use-site rewrite; until then the residual is intentional and source
preserving.

The benchmark acceptance corpus is pinned in `reference-repos.md` and
`plans/evidence/real-repository-migrations-v2.json`. It exercises the
`css-in-js-bench` Bamboo and Next-yak lanes plus the existing ecosystem
references. `vanilla`, `tailwind-merge`, and `cnfast` in that benchmark are
control/utility lanes, not CSS-in-JS source adapters, so they remain outside
the adapter registry. The report is schema `/3` and carries a typed
`promotion` object. `source-static` means the source excerpt converted and
canonicalized; it does not imply a full browser, SSR, dependency, or CSS-size
promotion. `runtime-pending`, `source-mismatch`, and `pipeline-unpaired` are
explicit non-promoted states with dimension-level reasons.

### Tokenami

Tokenami encodes CSS keys in custom-property names. Its adapter decodes
properties, pseudo/selector prefixes, media/supports conditions, aliases, and
`includes` composition into the semantic program. Static `css({...})` calls
are safe when their values are literal; composition remains explicit until a
target provides an equivalent mixin or recipe lowering.

```sh
yumcss-codemod migrate --from=tokenami --to=css.class --safe --diff \
  "src/**/*.{ts,tsx}"
```

### UnoCSS

UnoCSS is a class/compiler dialect rather than an object-style runtime.
Literal `class`/`className` attributes are parsed through an injectable
project resolver. The no-config resolver handles only syntax-level arbitrary
properties; production migrations should load the project's official UnoCSS
config/generator or generated CSS so custom rules, shortcuts, presets, theme
tokens, and variants are authoritative. Unknown utilities remain residuals
instead of being guessed.

```ts
import { createUnoCssResolverFromCss } from "@yumcss/codemod/swap";

const resolver = createUnoCssResolverFromCss(generatedUnoCss);
// Register createUnoCssAdapter({ resolver }) in the explicit plugin registry.
```

The pinned Tokenami and UnoCSS references are source-static corpus evidence.
Goober is the first external adapter promoted through the installed browser/
SSR runner; run `pnpm run pivot:proof:installed` to reproduce it.

## Runtime and host boundary

The runtime side uses `RuntimeSemanticRule` for ordered style, global, keyframe,
font-face, layer, supports, and `@property` rules. A `RuntimeSheet` can collect
CSS during SSR, hydrate it in a browser, and mount one deduplicated `<style>`
element. React, Preact, Solid, Vue, Svelte, and Astro bindings are
renderer-neutral host adapters, so migration output does not force a framework
dependency into the semantic core. `@media`, `@container`, and `@supports`
conditions on local styles remain ordinary typed style conditions; the semantic
rule path is for explicit stylesheet-level rules.
