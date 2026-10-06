# Repository migration reference

## Choose the migration lane

Start by choosing the target that matches the code you want to own after the
migration:

- `yumcss-tw` (also accepted as `tw`) keeps utility classes and generates a
  typed `tw()` binding.
- `yumcss-css` (also accepted as `css.class`) emits YumCSS atomic CSS
  declarations and is the normal target for CSS-in-JS or style-object systems.
- `yumcss-dss` (also accepted as `dss`) targets YumCSS design-system style
  objects with `$frame`, `$layout`, and `$text` vocabulary.
- A project-specific route, such as Panda project migration, can emit a
  complete target folder with `--out`.

Do not generate Tailwind artifacts merely because a repository is being moved to
YumCSS. `tw.ts`, `types.d.ts`, and the Tailwind bridge are needed for the
utility-class lane or for a migration route that explicitly consumes generated
YumCSS metadata. Native `css()` and design `css()` work starts with the typed
preset/theme contract instead.

## Preserve the source

Before writing files:

1. Record the source revision and current package-manager/build commands.
2. Identify framework entry points, styling packages, theme/config files,
   generated files, SSR/RSC paths, and browser states.
3. Use a disposable JJ workspace or output directory when the source must stay
   runnable during comparison.
4. Pick one representative component containing static styles, a state, a
   responsive rule, and one dynamic or unsupported case.

The codemod writes by default. Use `--dry-run` while reviewing and add
`--diff --report` so every change and residual is visible. `--safe` and
`--partial` are mutually exclusive: safe mode requires the target capability
contract, while partial mode explicitly permits a lossy target projection.

## Prepare generated metadata only when needed

For a Tailwind or metadata-dependent route, run the project-owned generation
script or the published binary:

```sh
pnpm exec yumcss-codemod tw generate ./src/tailwind.css ./src --bridge
```

This can produce `types.d.ts`, `tw.ts`, `bridge.ts`,
`yumcss.interop.json`, `yumcss-theme.css`, `yumcss.agents.json`, and the
`yumcss.generated.json` freshness manifest, depending on the flags and input.
They are generated outputs. If the route needs them from a different directory,
pass that directory with `--meta=<dir>`.

Run the scanner only for the Tailwind utility lane, especially when dynamic
class candidates are present:

```sh
pnpm exec yumcss-codemod tw scan ./src/tw.ts ./src ./src/yumcss.safelist.css
```

The consuming package may wrap these commands. In this repository,
`examples/example` has both `tw:generate` and `tw:scan`, while
`apps/playground` has `tw:generate` plus its editor declaration check.

## Run and review the route

Use a dry preview for an external source:

```sh
pnpm exec yumcss-codemod migrate \
	--from=styled-components --to=yumcss-css \
	--dry-run --diff --report \
	'src/**/*.{js,jsx,ts,tsx}'
```

Use the same shape for Panda, StyleX, Emotion, vanilla-extract, and other
registered source adapters. The source adapter owns configuration loading and
source semantics; the target adapter owns YumCSS emission. Do not add a
source-specific branch to the shared runner.

For a project route that owns generated modules, use its output directory:

```sh
pnpm exec yumcss-codemod migrate \
	--from=panda --to=yumcss-css --out=yumcss \
	--dry-run --diff --report \
	'src/**/*.{ts,tsx}'
```

Review, in order:

1. imports and package dependencies;
2. token references and theme/condition edges;
3. host/framework rewrites and component props;
4. static versus runtime-carrier decisions;
5. residuals, skipped sites, and generated artifacts.

Unknown utilities, dynamic expressions, unsupported selectors, and ambiguous
tokens must remain visible as residuals. Never replace them with a guessed token,
drop them silently, or claim parity from matching class names.

## Prove the result

Run the source and target typechecks, lint, tests, production builds, and the
browser/SSR checks that apply to the repository. Compare canonical CSS and
observable states rather than generated class names. At minimum cover:

- default, hover/focus/active, disabled, responsive, and theme states;
- hydration or streaming/RSC when the framework uses them;
- runtime dynamic values and intentionally preserved residuals;
- generated CSS size and runtime dependency changes.

Record the source revision, exact commands, converted/skipped/residual counts,
CSS-size evidence, screenshots, and validation results in the repository's
evidence report. A successful process exit is not equivalence proof.
