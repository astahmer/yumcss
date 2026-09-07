# Real-world migration proof plan

## Context

Pandwind's codemod has a broad adapter registry and a strong semantic residual
model. The current evidence still mixes small official API probes, synthetic
fixtures, source-static reference entries, and real runtime proof. The checked-in
reports contain meaningful successes but also many pending dimensions and
pipeline-unpaired entries.

The codemod must be judged by the output a staff engineer would accept in a
real repository: correct target imports, project configuration, package
changes, component and host behavior, generated artifacts, typechecking, build
output, browser state, SSR/hydration, and an actionable residual report.

Related work:

- `plans/040-pivot-any-to-any-lowering.md`
- `plans/041-any-direction-adapter-completeness.md`
- `plans/052-pivot-ecosystem-correctness.md`
- `plans/evidence/real-repository-migrations-v2.json`
- `plans/evidence/adapter-reference-proof.json`
- `packages/codemod/README.md`

## Goal

Turn the migration matrix from a breadth claim into a small number of deeply
verified, repeatable production migration lanes, while making all unverified
routes visibly experimental instead of implying universal conversion.

## What

This plan covers:

- selecting a first supported migration tier;
- real repositories or realistic installed reference projects for that tier;
- project-aware config and dependency loading;
- source conversion plus generated files and shared-file rewrites;
- typecheck, build, browser, SSR, hydration, dependency, and CSS-size proof;
- removal of silent test skips and clearer unavailable-reference reporting;
- route-specific residual and lossiness reporting;
- consistent codemod documentation and CLI examples.

The first tier should be intentionally small:

1. Tailwind CSS -> Pandwind `tw()`;
2. Panda -> Pandwind CSS/design;
3. styled-components or Emotion -> Pandwind CSS;
4. UnoCSS <-> Tailwind/Pandwind where the official project generator proves
   the utility and token semantics.

The remaining adapters stay registered, but their maturity and proof status
must be explicit.

## Why

A codemod that claims many source and target libraries without full project
proof creates the worst kind of tooling failure: it produces output that looks
reasonable, then fails later in typechecking, CSS generation, or browser
behavior. Narrower proven routes are more valuable than a large matrix of
shallow examples.

This also gives adapter authors a concrete bar and prevents synthetic fixtures
from becoming the only evidence for framework-specific behavior.

## How

### Conceptual model

```text
Pinned project/reference
  -> project discovery + official loader
  -> source adapter + StyleProgram
  -> target adapter + generated artifacts
  -> dependency/config rewrite
  -> typecheck -> build -> browser -> SSR/hydration -> size
  -> promotion report with residuals and evidence provenance
```

Every promotion record must distinguish:

- converted and source-preserved sites;
- adapter-level canonical CSS proof;
- host/framework proof;
- project build proof;
- unavailable dimensions;
- target dependencies and generated files;
- residuals that require manual work.

### Operations / behavior

1. Define stable, experimental, and research tiers in the adapter catalog.
2. For each stable route, pin a real repository or a dependency-installed
   reference fixture at a deterministic commit.
3. Run the source adapter with its official configuration loader from the
   project root. If loading fails, preserve source and record a configuration
   residual; never silently substitute a guessed default.
4. Apply the target migration into an isolated checkout with generated files,
   package changes, aliases, and shared configuration included.
5. Typecheck the converted project with its actual dependencies.
6. Build the converted project with its actual bundler and target plugin.
7. Execute browser states for representative conditions, including responsive,
   hover/focus, theme, and component states where applicable.
8. Execute SSR and hydration checks for frameworks that support them.
9. Measure CSS and JavaScript size against the source or baseline where a
   meaningful comparison exists.
10. Store evidence with command, commit, dependency, environment, and
    unavailable-dimension metadata.
11. Make tests fail when a required stable-route dimension is skipped. Missing
    optional reference repositories should produce a distinct unavailable
    result, never an ordinary green skip.
12. Update the migration docs from the same route catalog used by the CLI.

### Tech choices

| Choice             | Decision                                                        | Rationale                                                              |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Stable routes      | Start with four high-value directions                           | Depth is more valuable than an unverified all-to-all matrix            |
| Config loading     | Official package from project root through an injectable loader | Custom presets and plugins must be interpreted by their owner          |
| Reference projects | Pinned, dependency-installed, isolated workspaces               | Source snapshots alone cannot prove build or host behavior             |
| Browser proof      | Existing browser/SSR differential harness                       | Reuse the current validator instead of creating route-specific scripts |
| Missing reference  | Explicit unavailable result; required stable route fails        | A skipped test must not look like proof                                |
| Residual policy    | Preserve source and emit typed residuals                        | Safe failure is better than plausible incorrect code                   |
| Route catalog      | Registry-owned metadata generates docs and tests                | Avoid stale hand-maintained matrices                                   |

### Architecture

```text
Route registry
  -> AdapterRouteProofPolicy
      -> ReferenceProjectProvider
      -> OfficialConfigLoader
      -> MigrationUseCase
      -> ProjectValidationPort
      -> EvidenceWriter

CLI, CI, Playground, and MCP
  -> consume the same route/evidence contracts
```

The migration engine remains a use case over ports. Repository installation,
command execution, browser driving, and evidence persistence stay in explicit
composition roots.

## What this allows

- A user can identify which routes are production-proven before migrating.
- A stable route can prove target imports, config, dependencies, types, CSS, and
  runtime behavior together.
- Adapter failures explain what configuration or host behavior is missing.
- CI can detect real regressions rather than only snapshot changes.
- The Playground and MCP can display the same evidence and maturity status as
  the CLI.

## What this does not allow

- It does not promise lossless migration for arbitrary framework behavior.
- It does not make recipes, plugins, theme callbacks, or runtime interpolation
  portable across libraries without target evidence.
- It does not promote a route because a tiny fixture passes.
- It does not install every ecosystem package into Pandwind's runtime.
- It does not hide unavailable reference repositories behind skipped tests.

## UI & UX

### Desktop

The CLI report should show a route promotion table:

```text
route                         source  target  build  browser  SSR  status
tailwindcss -> pandwind-tw    12/12   12/12   pass   pass     n/a  stable
panda -> pandwind-css          8/8     8/8   pass   pass     pass stable
emotion -> pandwind-css        7/9     7/9   pass   pass     pass partial
```

Residuals and unavailable dimensions should be expandable and linked to the
source range and validation command.

### Mobile

Not applicable. Reports must still have a compact summary suitable for CI
comments and MCP responses.

### Common interactions

| Action                         | Result                                                                  |
| ------------------------------ | ----------------------------------------------------------------------- |
| Run a stable route             | Conversion and all required proof dimensions execute                    |
| Run an experimental route      | Output is produced with an explicit maturity label                      |
| Reference repository is absent | The report says unavailable and CI applies the route policy             |
| Official loader fails          | Source is preserved and a configuration residual identifies the failure |
| Build or browser proof fails   | Route is not promoted and the failing artifact is retained              |

## Data model

```ts
interface MigrationRouteProof {
	readonly route: { readonly from: string; readonly to: string };
	readonly maturity: "stable" | "experimental" | "research";
	readonly reference: {
		readonly repository: string;
		readonly commit: string;
		readonly path: string;
	};
	readonly dimensions: Readonly<
		Record<
			"canonical-css" | "typecheck" | "build" | "browser" | "ssr-hydration" | "css-size",
			{
				readonly status: "passed" | "failed" | "unavailable" | "not-applicable";
				readonly evidence?: string;
			}
		>
	>;
	readonly converted: number;
	readonly residuals: readonly {
		readonly kind: string;
		readonly file: string;
		readonly range?: string;
		readonly hint: string;
	}[];
}
```

## Implementation steps

1. Normalize the route catalog and add maturity plus required-proof metadata to
   each registered route.
2. Audit the 33 existing real-repository reports and classify every pending,
   pipeline-unpaired, source-static, and passed dimension.
3. Select and pin the first stable reference projects for Tailwind, Panda,
   Emotion/styled-components, and UnoCSS.
4. Build the reference-project provider and dependency installation workflow
   using isolated, deterministic workspaces.
5. Connect official loaders and project context to each stable route; add
   configuration failure fixtures.
6. Run converted output through actual typecheck and build commands through an
   explicit validation port.
7. Add browser and SSR/hydration promotion fixtures for the stable routes.
8. Add CSS-size and dependency evidence where the source and target comparison
   is meaningful.
9. Replace silent external-reference skips with unavailable results and
   route-policy failures.
10. Generate the docs/API matrix and CLI report from the route catalog.
11. Re-run the full codemod matrix and update snapshots surgically; retain
    route-specific assertions and residual fixtures.
12. Promote only routes whose required dimensions pass; label all others.

## Open questions

1. Which real repositories are legally and operationally suitable for stable
   pinned fixtures?
2. Should stable proof run on every push or on a scheduled CI lane with a
   required lightweight contract gate on every push?
3. What CSS-size delta is acceptable when the target intentionally changes the
   runtime model?
4. Should UnoCSS remain a stable first-tier route or stay experimental until
   more preset/plugin cases are installed and proven?
5. Which framework hosts need first-class promotion beyond React/Vite?

## Acceptance criteria

- [ ] Stable routes and their required proof dimensions are declared in one
      registry-owned catalog.
- [ ] At least four high-value migration directions have pinned,
      dependency-installed project proof.
- [ ] Stable routes pass typecheck, build, canonical CSS, and applicable
      browser/SSR/hydration checks.
- [ ] Missing reference repositories produce explicit unavailable evidence and
      cannot silently satisfy a stable-route gate.
- [ ] Official-loader failures produce structured configuration residuals and
      preserve source.
- [ ] The checked-in evidence report contains no unexplained pending dimension
      for a route labeled stable.
- [ ] CLI, docs, Playground, and MCP show the same route maturity and residual
      semantics.
- [ ] Existing adapter-specific tests remain meaningful and are not replaced by
      regenerated snapshots alone.

## Decisions log

| Date       | Decision                                                                 | Rationale                                                                          |
| ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 2026-09-07 | Start with four high-value routes instead of promoting the entire matrix | Real build and host proof is expensive and breadth currently overstates confidence |
| 2026-09-07 | Treat unavailable external references as evidence, not green skips       | A passing local suite must describe what it actually executed                      |
