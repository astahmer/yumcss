# @pandwind/lint-plugin

oxlint JS plugin: static-extraction discipline rules for pandwind
`cx()` / `css()` / `tw()` call sites (rule namespace `pandwind-extraction`,
mirrors plans/012 §3.1). All rules run at the warning tier.

| rule                       | flags                                                                  |
| -------------------------- | ---------------------------------------------------------------------- |
| `no-spreads`               | spread arguments in `cx()` — never folds at build time                 |
| `no-dynamic-values`        | template interpolations, member expressions, helper calls as arguments |
| `no-multiple-conditionals` | >1 dynamic conditional in one call (only one partially folds)          |

## Wiring

```jsonc
// .oxlintrc.json
{
	"jsPlugins": ["./packages/lint-plugin/src/index.js"],
	"rules": {
		"pandwind-extraction/no-spreads": "warn",
		"pandwind-extraction/no-dynamic-values": "warn",
		"pandwind-extraction/no-multiple-conditionals": "warn",
	},
}
```

Known limitation: identifier arguments are not resolved across scopes by
design — the build's constant propagation handles same/cross-module consts;
this lint only flags shapes that NEVER fold.
