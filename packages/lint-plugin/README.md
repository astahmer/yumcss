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

| Rule                         | Default intent                                                             | Fix                 |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------- |
| `no-spreads`                 | Finds spread arguments that cannot be statically folded.                   | —                   |
| `no-dynamic-values`          | Finds dynamic values in static extraction lanes.                           | —                   |
| `no-multiple-conditionals`   | Finds calls with more than one partially foldable conditional.             | —                   |
| `no-dollar-raw`              | Finds `$raw` escape hatches in Pandwind style lanes.                       | —                   |
| `no-arbitrary-values`        | Finds arbitrary class values such as `w-[13px]`.                           | —                   |
| `design-tokens-only`         | Checks design values against an explicit project policy.                   | —                   |
| `migration-skip-reason`      | Requires every `pandwind:migrate-skip` marker to explain its residual.     | —                   |
| `no-stale-migration-skip`    | Finds skip markers that now precede a statically foldable call.            | Safe: remove marker |
| `require-migration-residual` | Requires an explicit skip marker when a static-lane value remains dynamic. | Safe: add marker    |
| `no-conflicting-style-props` | Finds explicit `className`/`style` props that conflict with `css.props()`. | —                   |

The extraction rules are normally warnings. Token and migration-hygiene rules
can be errors when a project wants CI to require verified design values and
explicit residual accounting. Explicit runtime carriers (`css.vars`,
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

For generated project policy, prefer passing values derived from the project's
official config or `pandwind.interop.json` artifact at the composition boundary.
The lint plugin itself stays synchronous and does not load arbitrary packages.

## Wiring

Build the TypeScript source before running Oxlint. The generated JavaScript
file is the runtime plugin entry because Oxlint loads JavaScript plugins:

```json
{
	"jsPlugins": ["./packages/lint-plugin/dist/index.js"],
	"rules": {
		"pandwind-extraction/no-spreads": "warn",
		"pandwind-extraction/no-dynamic-values": "warn",
		"pandwind-extraction/no-multiple-conditionals": "warn",
		"pandwind-extraction/no-dollar-raw": "error",
		"pandwind-extraction/no-arbitrary-values": "error",
		"pandwind-extraction/migration-skip-reason": "error",
		"pandwind-extraction/no-stale-migration-skip": "error",
		"pandwind-extraction/require-migration-residual": "error",
		"pandwind-extraction/no-conflicting-style-props": "error"
	}
}
```

The adapter/validator layers remain responsible for effective Panda features
such as removed presets, strict token scopes, missing generated CSS, and
styling-only prop forwarding. Those require project configuration or runtime
evidence and do not belong in a generic source linter.
