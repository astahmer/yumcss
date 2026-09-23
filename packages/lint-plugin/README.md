# @pandwind/lint-plugin

Use this when you want CI or editor diagnostics for style code that should be
folded at build time. It catches common static-extraction mistakes without
pretending to know your project's tokens or framework configuration.

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

It does not treat an unrelated local function named `cx`, `tw`, or `css` as a
Pandwind API. Project configuration and ecosystem semantics remain owned by
codemod adapters and official loaders.

For application-local modules that re-export a preset-bound `createCss`
instance, provide the exact import source and exported instance once in plugin
settings. Every rule that resolves style calls uses this mapping:

```json
{
	"settings": {
		"pandwind-extraction": {
			"cssModules": [{ "source": "../app/css", "exports": ["css"] }]
		}
	}
}
```

## Rules

| Rule                          | Default intent                                                             | Fix                                    |
| ----------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| `no-spreads`                  | Finds spread arguments that cannot be statically folded.                   | —                                      |
| `no-dynamic-values`           | Finds dynamic values in static extraction lanes.                           | —                                      |
| `no-multiple-conditionals`    | Finds calls with more than one partially foldable conditional.             | —                                      |
| `no-dollar-raw`               | Finds `$raw` escape hatches in Pandwind style lanes.                       | —                                      |
| `prefer-intrinsic-auto`       | Finds CSS `auto` values that no longer need `$raw`.                        | Safe: unwraps static `auto` properties |
| `no-arbitrary-values`         | Finds arbitrary class values such as `w-[13px]`.                           | —                                      |
| `design-tokens-only`          | Checks design values against an explicit project policy.                   | —                                      |
| `migration-skip-reason`       | Requires every `pandwind:migrate-skip` marker to explain its residual.     | —                                      |
| `no-stale-migration-skip`     | Finds skip markers that now precede a statically foldable call.            | Safe: remove marker                    |
| `require-migration-residual`  | Requires an explicit skip marker when a static-lane value remains dynamic. | Safe: add marker                       |
| `no-conflicting-style-props`  | Finds explicit `className`/`style` props that conflict with `css.props()`. | —                                      |
| `no-dynamic-carrier-fallback` | Finds dynamic JSX carriers that cannot use direct build-time lowering.     | —                                      |
| `no-dynamic-keyframes`        | Requires `css.keyframes()` bodies to be statically extractable.            | —                                      |

`prefer-intrinsic-auto` recognizes only properties whose Pandwind CSS value
types explicitly include the intrinsic `"auto"` keyword, and it applies only
to preset-bound `createCss(...)` instances. Its fixer unwraps a whole `$raw`
object or a contiguous leading/trailing group when it can preserve property
order and avoid duplicate keys. It also unwraps static condition objects when
every leaf is `"auto"`; mixed responsive values are reported but left
report-only because their other values depend on the project's preset. The
rule follows module-scope static objects spread into a resolved CSS call.
Interleaved, computed, spread-containing, or comment-sensitive `$raw` objects
stay report-only. A per-rule option remains available for a narrow override;
shared application mappings should use the plugin setting above:

```json
{
	"rules": {
		"pandwind-extraction/prefer-intrinsic-auto": [
			"error",
			{
				"cssModules": [{ "source": "../pandwind/css", "exports": ["css"] }]
			}
		]
	}
}
```

The extraction rules are normally warnings. The carrier-boundary rule is shown
as an error because it marks the small set of shapes that cannot receive the
direct Vite lowering. The keyframe rule is an error because a dynamic body
cannot produce the matching extracted `@keyframes` rule. Token and migration-hygiene rules can also be errors
when a project wants CI to require verified design values and explicit residual
accounting. Explicit runtime carriers (`css.vars`,
`css.props`, `css.group`, `css.input`, and `css.raw`) are intentionally outside
the static-value rule because they are the documented runtime/escape-hatch
surfaces.

`design-tokens-only` is deliberately inert unless configured with verified
values or prefixes. It must not guess a project's theme from a hardcoded list
of scale words:

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

For generated project policy, prefer passing values derived from the project's
official config or `pandwind.interop.json` artifact at the composition boundary.
The lint plugin itself stays synchronous and does not load arbitrary packages.

## Wiring

Build Pandwind and then the TypeScript source before running Oxlint. The lint
rule reuses Pandwind's published carrier analyzer, so the workspace build
order matters; installed consumers receive it through the `pandwind` runtime
dependency. The generated JavaScript file is the runtime plugin entry because
Oxlint loads JavaScript plugins:

```json
{
	"jsPlugins": ["./packages/lint-plugin/dist/index.js"],
	"rules": {
		"pandwind-extraction/no-spreads": "warn",
		"pandwind-extraction/no-dynamic-values": "warn",
		"pandwind-extraction/no-multiple-conditionals": "warn",
		"pandwind-extraction/no-dollar-raw": "error",
		"pandwind-extraction/prefer-intrinsic-auto": "error",
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
