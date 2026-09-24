# @pandwind/lint-plugin

Use this when you want CI or editor diagnostics for style code that should be
folded at build time. It catches common static-extraction mistakes and reads
statically declared token vocabularies from the CSS factory's actual preset.

Start with warnings during adoption:

```json
{
	"jsPlugins": ["./packages/lint-plugin/dist/index.js"],
	"rules": {
		"pandwind-extraction/no-spreads": "warn",
		"pandwind-extraction/no-dynamic-values": "warn",
		"pandwind-extraction/no-dynamic-carrier-fallback": "error"
	}
}
```

Read the rule table below when you are ready to make specific boundaries
errors. The plugin is intentionally conservative: dynamic values that use a
documented Pandwind escape hatch stay valid.

Oxlint JavaScript plugin for Pandwind's static-extraction discipline. It
recognizes the real Pandwind package boundaries, including aliased and
namespace imports:

- `pandwind`: named `cx` and `tw`
- `pandwind/css`: preset-bound `createCss(...)` instances
- `pandwind/unsafe/css`: `createUnsafeCss()` instances
- `pandwind/design`: `createDesignCss()` instances
- local CSS/design facades whose source basename is `css` or `design`

It does not identify unrelated local functions named `cx`, `tw`, or `css`.
Direct Pandwind APIs resolve from their package source. Local facades use the
same `css` and `design` basename convention as the Vite plugin.

For application-local modules that re-export a preset-bound `createCss`
instance, provide the exact import source and exported instance once in plugin
settings only when the facade does not use the conventional `css` or `design`
basename. This mapping identifies the style factory; token names still come
from its source-resolved preset.

```json
{
	"settings": {
		"pandwind-extraction": {
			"cssModules": [{ "source": "../app/css", "exports": ["css"] }]
		}
	}
}
```

`prefer-typed-css-values` follows local and package imports from the linted
file to each `createCss(preset)` binding, then derives property-specific token
names with Pandwind's shared preset vocabulary logic. It needs no
`tokenVocabulary` setting. The resolver statically reads preset modules and
uses Pandwind's actual `define.*` builders; it never executes project code or
framework configuration. Dynamic preset expressions stay unresolved.

## Rules

| Rule                          | Default intent                                                             | Fix                                   |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| `no-spreads`                  | Finds spread arguments that cannot be statically folded.                   | —                                     |
| `no-dynamic-values`           | Uses the compiler evaluators to find values that stay on the runtime path. | —                                     |
| `no-multiple-conditionals`    | Finds `cx()` calls with multiple compiler-foldable conditional arguments.  | —                                     |
| `no-redundant-cx`             | Finds one static string passed through `cx()` unchanged.                   | —                                     |
| `no-dollar-raw`               | Finds `$raw` escape hatches in Pandwind style lanes.                       | —                                     |
| `prefer-typed-css-values`     | Finds CSS values and statically resolved preset tokens inside `$raw`.      | Safe: unwraps static supported values |
| `no-arbitrary-values`         | Finds arbitrary class values such as `w-[13px]`.                           | —                                     |
| `design-tokens-only`          | Checks design values against an explicit project policy.                   | —                                     |
| `migration-skip-reason`       | Requires every `pandwind:migrate-skip` marker to explain its residual.     | —                                     |
| `no-stale-migration-skip`     | Finds skip markers that now precede a statically foldable call.            | Safe: remove marker                   |
| `require-migration-residual`  | Requires an explicit skip marker when a static-lane value remains dynamic. | Safe: add marker                      |
| `no-conflicting-style-props`  | Finds explicit `className`/`style` props that conflict with `css.props()`. | —                                     |
| `prefer-css-props-spread`     | Preserves both `className` and `style` when projecting props onto JSX.     | Safe: spread host props               |
| `prefer-css-map-in-props`     | Finds `css.class()` strings passed into `css.props()`.                     | Safe: use mergeable `css()` map       |
| `no-dynamic-carrier-fallback` | Finds dynamic JSX carriers that cannot use direct build-time lowering.     | —                                     |
| `no-dynamic-keyframes`        | Requires `css.keyframes()` bodies to be statically extractable.            | —                                     |

`no-multiple-conditionals` applies to `cx()` class composition. Finite
property branches in `css.class()` are extracted independently.

`no-redundant-cx` reports only a single static string with no whitespace or
NUL characters, which `cx()` returns unchanged. Multi-token and dynamic inputs
remain valid because `cx()` may need to resolve conflicts or normalize them.
This rule does not ban unary calls by arity: `css.props(styleMap)` is the
documented projection from a compiled map or variable carrier to host props.

`no-dynamic-values` follows statically resolved identifiers through extraction
calls and accepts object spreads whose values are proven static. Runtime spread
inputs remain reported.

`prefer-css-map-in-props` keeps authored styles mergeable at component
boundaries. `css.class()` returns an opaque class string, so `css.props()` can
only concatenate it; pass `css(...)` maps to `css.props()` instead. Components
that accept caller-authored overrides can expose an `xcss` prop typed as
`ReturnType<typeof css>` and compose it after their base map.

A one-argument `css.props(styleMap)` is a valid projection from a compiled
`css(...)` map (or a `css.vars(...)` carrier) to host props. Do not ban unary
calls: they are how those values become `className` and `style` attributes.
`no-redundant-cx` covers the provable class-string no-op without narrowing
either API's TypeScript signature. Avoid wrapping an existing class string
just to forward it. The JSX spread
rule changes `.className` extraction into a full props spread only when there
is no sibling `style` prop or unknown prop spread that could change precedence.

`prefer-typed-css-values` recognizes CSS-wide keywords, numeric values, the
property-specific keywords from Pandwind's CSS value types, and exact tokens
from the preset bound to each `createCss(...)` instance. It applies only to
preset-bound CSS instances. The fixer unwraps a whole `$raw`
object or moves a group of supported properties when it can preserve their
order, avoid shorthand conflicts, and avoid duplicate keys. It also unwraps
static condition objects when every leaf is supported by the property's CSS
value type or an exact token in that instance's preset. Static local imports,
re-exports, and resolvable package modules are followed; dynamic preset
expressions and unresolved imports do not contribute token names. Unknown,
mixed, and unresolved values stay report-only when moving them could change
behavior. The rule follows
module-scope static objects spread into a resolved CSS call and intersects
vocabularies when an object is shared by multiple CSS factories.
Computed, spread-containing, or comment-sensitive edits and properties that
conflict with a CSS shorthand stay report-only. A per-rule option remains
available for a narrow override; shared application mappings should use the
plugin setting above:

```json
{
	"rules": {
		"pandwind-extraction/prefer-typed-css-values": [
			"error",
			{
				"cssModules": [{ "source": "../pandwind/css", "exports": ["css"] }]
			}
		]
	}
}
```

By default, the rule also recognizes local facades with `css` or `design`
source basenames. Use a `cssModules` mapping for a differently named local
module that re-exports a preset-bound instance.

The extraction rules are normally warnings. The carrier-boundary rule is shown
as an error because it marks the small set of shapes that cannot receive the
direct Vite lowering. The keyframe rule is an error because a dynamic body
cannot produce the matching extracted `@keyframes` rule. Token and migration-hygiene rules can also be errors
when a project wants CI to require verified design values and explicit residual
accounting. Explicit runtime carriers (`css.vars`,
`css.props`, `css.group`, `css.input`, and `css.raw`) are intentionally outside
the static-value rule because they are the documented runtime/escape-hatch
surfaces.

`design-tokens-only` is a separate generic policy rule and stays inert unless
configured with verified values or prefixes. The CSS `$raw` rule above
resolves tokens from its owning preset automatically. The policy rule must not
guess a project's theme from a hardcoded list of scale words:

```json
{
	"rules": {
		"pandwind-extraction/design-tokens-only": [
			"error",
			{ "allowedPrefixes": ["$"], "allowedValues": ["center", "space-4"] }
		]
	}
}
```

Migration markers are source-level accounting, not a way to silence an
unknown failure. They must name the preserved behavior, and a marker becomes
an error when it is left on a call that is now fully static:

```ts
// pandwind:migrate-skip (residual: runtime theme lookup)
tw(theme.colors.brand);
```

`require-migration-residual` catches an unmarked dynamic static-lane call and
offers a safe fixer that inserts a typed marker containing the detected reason.
`no-stale-migration-skip` catches the opposite case after a later compiler
improvement and offers a safe fixer that removes only the obsolete comment.
The other rules are report-only because their fixes require token/config
knowledge or could alter style behavior. `no-conflicting-style-props` is
report-only because
deleting an explicit host prop would change behavior; the Pandwind codemod must
merge those values through the target host semantics. All rules are
deliberately conservative when source ranges are not available.
`no-raw-ast-identities` keeps parser node discriminants such as
`"CallExpression"` behind the shared `NodeKind` table. It only recognizes
known parser node identities, so authored CSS properties and application data
remain ordinary strings.

The token rule reads the linted module's static import graph and statically
resolvable package modules. It does not execute project code or framework
configuration; dynamic presets remain unresolved, so those calls use only
Pandwind's CSS value types.

## Wiring

Build Pandwind and then the TypeScript source before running Oxlint. The rules
reuse Pandwind's published carrier analyzer, Tw literal evaluator, and `cx()`
partial-fold analysis, so the workspace build order matters. Lint tests run
the same static, dynamic, and conditional inputs through the compiler inliners
and the corresponding rules. Installed consumers receive the compiler
analysis through the `pandwind` runtime dependency. The generated JavaScript
file is the runtime plugin entry because Oxlint loads JavaScript plugins:

```json
{
	"jsPlugins": ["./packages/lint-plugin/dist/index.js"],
	"rules": {
		"pandwind-extraction/no-spreads": "warn",
		"pandwind-extraction/no-dynamic-values": "warn",
		"pandwind-extraction/no-multiple-conditionals": "warn",
		"pandwind-extraction/no-dollar-raw": "error",
		"pandwind-extraction/prefer-typed-css-values": "error",
		"pandwind-extraction/no-arbitrary-values": "error",
		"pandwind-extraction/migration-skip-reason": "error",
		"pandwind-extraction/no-stale-migration-skip": "error",
		"pandwind-extraction/require-migration-residual": "error",
		"pandwind-extraction/no-conflicting-style-props": "error",
		"pandwind-extraction/no-dynamic-carrier-fallback": "error",
		"pandwind-extraction/no-dynamic-keyframes": "error",
		"pandwind-extraction/no-raw-ast-identities": "error"
	}
}
```

The adapter/validator layers remain responsible for effective Panda features
such as removed presets, strict token scopes, missing generated CSS, and
styling-only prop forwarding. Those require project configuration or runtime
evidence and do not belong in a generic source linter.
