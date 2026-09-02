# @pandwind/lint-plugin

Oxlint JavaScript plugin for Pandwind's static-extraction discipline. It
recognizes the real Pandwind package boundaries, including aliased and
namespace imports:

- `pandwind`: named `cx` and `tw`
- `pandwind/css`: `createCss()` instances
- `pandwind/design`: `createDesignCss()` instances

It does not treat an unrelated local function named `cx`, `tw`, or `css` as a
Pandwind API. Project configuration and ecosystem semantics remain owned by
codemod adapters and official loaders.

## Rules

| Rule                       | Default intent                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `no-spreads`               | Finds spread arguments that cannot be statically folded.                                      |
| `no-dynamic-values`        | Finds interpolations, member expressions, functions, and helper calls that stay runtime-only. |
| `no-multiple-conditionals` | Finds calls with more than one partially foldable conditional.                                |
| `no-dollar-raw`            | Finds `$raw` escape hatches in Pandwind style lanes.                                          |
| `no-arbitrary-values`      | Finds arbitrary class values such as `w-[13px]`.                                              |
| `design-tokens-only`       | Checks design values against an explicit project policy.                                      |

The first three rules are normally warnings. The strict-token rules can be
errors when a project intentionally enforces them.

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

For generated project policy, prefer passing values derived from the project's
official config or `pandwind.interop.json` artifact at the composition boundary.
The lint plugin itself stays synchronous and does not load arbitrary packages.

## Wiring

```json
{
	"jsPlugins": ["./packages/lint-plugin/src/index.js"],
	"rules": {
		"pandwind-extraction/no-spreads": "warn",
		"pandwind-extraction/no-dynamic-values": "warn",
		"pandwind-extraction/no-multiple-conditionals": "warn",
		"pandwind-extraction/no-dollar-raw": "error",
		"pandwind-extraction/no-arbitrary-values": "error"
	}
}
```

The adapter/validator layers remain responsible for effective Panda features
such as removed presets, strict token scopes, missing generated CSS, and
styling-only prop forwarding. Those require project configuration or runtime
evidence and do not belong in a generic source linter.
