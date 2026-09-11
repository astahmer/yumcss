# Migration examples

The examples below deliberately start in read-only mode. Remove `--dry-run`
only after reviewing the diff and residual report.

## Styled-components to Pandwind CSS

```sh
pnpm exec pandwind-codemod migrate \
	--from=styled-components --to=pandwind-css \
	--dry-run --diff --report \
	'src/**/*.{ts,tsx}'
```

Use `--safe` when only capability-proven rewrites are acceptable. Keep
interpolations or framework-specific host behavior as residuals until a browser
fixture proves the replacement.

## Panda to Pandwind CSS

```sh
pnpm exec pandwind-codemod migrate \
	--from=panda --to=pandwind-css --out=pandwind \
	--dry-run --diff --report \
	'src/**/*.{ts,tsx}'
```

Run this against a representative recipe and pattern before the whole project.
Check that semantic tokens, conditions, recipes, generated modules, and host
props all have an explicit target representation.

## Tailwind classes to typed `tw()`

Generate the target contract first:

```sh
pnpm exec pandwind-codemod tw generate ./src/tailwind.css ./src --bridge
```

Then preview the class migration:

```sh
pnpm exec pandwind-codemod migrate \
	--from=tailwindcss --to=pandwind-tw \
	--dry-run --diff --report \
	'src/**/*.{jsx,tsx}'
```

If class names are assembled dynamically, run `tw scan` and import the emitted
safelist stylesheet from the Tailwind entrypoint. The scan makes candidates
discoverable; it does not make arbitrary runtime strings type-safe.

## Existing Pandwind utility calls to CSS objects

For a route that already has Pandwind metadata, pass its generated directory:

```sh
pnpm exec pandwind-codemod migrate \
	--from=tw --to=pandwind-css --meta=src \
	--dry-run --diff --report \
	'src/**/*.{ts,tsx}'
```

Use `--to=pandwind-dss` when the destination is the design-system style-object
API. Do not hand-edit `tw.ts`, declarations, bridge, interop, theme, agents, or
freshness files to make this route pass; regenerate their source contract.

## Dynamic and unsupported behavior

```tsx
const className = css.vars({ color: props.color });

return <output className={className.class} style={className.style} />;
```

Static declarations should remain extracted. A runtime carrier is appropriate
only for a value that cannot be known at build time. If a selector, token edge,
or framework behavior cannot be represented, keep the authored source and
report a typed residual instead of stringifying the expression.

## Evidence checklist

For each migrated slice, retain:

- the source revision and migration command;
- the dry-run diff and JSON report when used in CI;
- typecheck, lint, test, build, browser, and SSR results that apply;
- canonical CSS/state comparison and generated CSS-size measurements;
- every intentional residual and the follow-up decision.
