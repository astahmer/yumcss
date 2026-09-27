# Pandwind product focus and codemod audit plan

## Context

Pandwind already has a small frozen authoring API, a primary `css()` path,
Tailwind compatibility through `tw()`, a broad codemod registry, and tooling
for learning, inspecting, and validating projects. The candid review in
[`current-limitations-and-criticism.md`](../docs/src/content/docs/reference/current-limitations-and-criticism.md)
identifies the central risk: users can see many capable surfaces before they
see one clear reason to adopt Pandwind.

Related plans already cover adjacent work:

- [`059-product-surface-and-package-boundary.md`](./059-product-surface-and-package-boundary.md)
  records the package ownership, API, and maturity boundaries.
- [`060-real-world-migration-proof.md`](./060-real-world-migration-proof.md)
  establishes installed-project, build, browser, SSR, hydration, and CSS proof
  for bounded migration routes.
- [`046-ecosystem-lint-and-codemod-policy.md`](./046-ecosystem-lint-and-codemod-policy.md)
  defines where semantic codemods belong.

Those plans do not provide one read-only review of whether every current
codemod emits the idiomatic, canonical, or recommended code for the exact
target library version. Runtime and CSS equivalence alone do not answer that
question. This plan adds that output-quality audit and uses its results to
shape product claims and route priority.

The public API remains frozen. This plan adds no authoring API, adapter API, or
parallel migration engine. Counts, route names, and dependency versions must
be read from the current registry and lockfile when work begins rather than
copied from this plan.

## Goal

Make Pandwind's primary adoption story easy to explain, audit every currently
registered codemod route for target-native output quality before changing any
emitter, and present other tools as support for that workflow.

The working product promise is: **Pandwind helps TypeScript teams keep their
styling system, gain project-aware typed styles, and migrate incrementally with
evidence.** The default new-authoring path remains `css()`; `tw()` remains the
Tailwind compatibility lane.

## What

This plan covers:

- one product promise and one first-use path in the README and product docs;
- a role map for authoring APIs, migration, learning, inspection, and research
  surfaces;
- a read-only, route-by-route audit of every codemod currently reachable from
  the CLI or migration tooling;
- a canonicality verdict distinct from semantic, build, and browser proof;
- a reviewed decision about which migration routes and tools deserve
  first-class positioning;
- a follow-up queue for any fixes approved after the audit.

The audit is the first phase. It produces findings and recommendations, not
codemod fixes. Adapter, emitter, expected-output, and route-policy changes wait
until the audit report has been reviewed. Approved findings then start as
source-specific issue fixtures before implementation, following the
repository's codemod output-quality rules.

## Why

Panda, vanilla-extract, Tailwind, and StyleX already describe strong typed,
static, or zero-runtime styling workflows. Pandwind's distinguishing promise
must come from helping a team use its actual project configuration and move
between styling systems safely, not from claiming those generic capabilities
alone. Recheck the exact competitor versions and positioning before publishing
comparisons; useful primary references include [Panda](https://panda-css.com/docs/overview/getting-started),
[vanilla-extract Sprinkles](https://vanilla-extract.style/documentation/packages/sprinkles/),
[Tailwind](https://tailwindcss.com/docs/installation/framework-guides), and
[StyleX](https://stylexjs.com/).

Migration breadth only helps if generated code is something a target-library
maintainer would recognize as normal, maintainable usage. Auditing that output
before editing the codemods prevents fixes from being chosen from assumptions
or from a single convenient fixture.

## How

### Conceptual model

```text
Existing project and official configuration
                 │
                 ▼
       Project-aware typed authoring
       or migration preview
                 │
                 ▼
 Target-native code + ordinary CSS
       + explicit residuals
                 │
                 ├── semantic/build/browser proof
                 └── canonical-output audit
                          │
                          ▼
             accurate route and product claims
```

Playground, Inspector, Studio, Analyzer, Migration Preview, DevTools, and MCP
sit around this flow to teach, inspect, or verify it. They do not each become
a separate top-level product promise.

### Operations / behavior

1. New users see one default setup and one short `css()` authoring path.
2. Existing Tailwind projects see `tw()` as an integration lane with explicit
   generated-file and Tailwind requirements.
3. Teams considering a migration preview a route, inspect target code and
   residuals, then validate the result in the target project.
4. The codemod audit compares current output with version-matched target
   recommendations before any emitter changes.
5. Product docs claim only the maturity and route coverage supported by both
   the existing proof gate and the new output-quality audit.

### Tech choices

| Choice | Decision | Rationale |
| --- | --- | --- |
| Authoring API | Preserve `css()`, `tw()`, `cx()`, presets, and existing strategies | API surface is frozen; product focus comes from hierarchy and workflow. |
| Target-library truth | Use exact installed versions, official versioned docs, and project configuration | Avoid judging generated output against remembered or guessed conventions. |
| Audit scope | Include every route selectable through the current CLI or migration tooling | The audit must expose the real catalog's quality, including weak or unverified routes. |
| Audit execution | Read-only against isolated fixtures or disposable copies | Capture current behavior without changing adapter or user source. |
| Route promotion | Keep existing route-proof gates and add canonical-output review | Idiomatic source does not replace semantic, build, SSR, or browser evidence. |
| Tool boundaries | Classify tools by their role in the primary workflow; defer deletion decisions | A supporting or experimental surface can remain available without leading the product story. |

### Architecture

The audit adds a review artifact and decision gate around the existing adapter
registry. It does not add an adapter engine or duplicate the migration pipeline.

```text
Current route registry ──► isolated current-output capture
                                      │
Exact target package/docs ──► canonicality review
                                      │
Existing route proof ───────► combined route assessment
                                      │
                                      ▼
                       reviewed findings and route tiers
                                      │
                                      ▼
                  issue fixture → approved focused fix
```

Each audit row uses one of these outcomes:

- **Canonical** — target-recommended shape and expected source semantics are
  preserved.
- **Valid but noncanonical** — behavior is equivalent, but output misses a
  documented target convention or a more maintainable target-native API.
- **Incorrect or lossy** — output is invalid, changes behavior, misuses target
  configuration, or hides unsupported semantics.
- **Safe residual** — unsupported behavior is preserved and clearly reported.
- **Unverified** — there is not enough target-version or fixture evidence to
  make a reliable judgment.

### Product surface roles

| Role | Surfaces | Rule |
| --- | --- | --- |
| Primary authoring | `css()` and the short Vite setup; `createDesignCss()` as an advanced syntax | First path shown to a new Pandwind user. |
| Existing-stack integration | `tw()`, `cx()`, token and class strategies | Explain as ways to work with an existing stack, not competing starting points. |
| Migration | Codemod CLI and Migration Preview | Show supported routes, target-native output, residuals, and evidence per route. |
| Supporting tools | Playground, Analyzer, Inspector, Studio, DevTools, MCP | Teach or validate the primary workflows; keep maturity and limitations visible. |
| Research / experimental | Long-tail adapters and non-web backends | Keep discoverable for interested users, but out of the main adoption promise until real demand and proof support promotion. |

This role map does not authorize deleting tools or splitting packages. Any
future removal or package-boundary change needs its own evidence and plan.

## What this allows

- A prospective user can tell what Pandwind does first and whether it fits
  their existing stack.
- Migration status describes both runtime evidence and the quality of emitted
  target code.
- Maintainers can rank codemod work using specific target-library findings.
- Supporting tools can improve onboarding and trust without multiplying the
  headline product promises.

## What this does not allow

- It does not add or expand public API surface.
- It does not treat CSS parity, successful conversion, or a passing small
  fixture as proof of idiomatic target usage.
- It does not change codemod output while the read-only audit is underway.
- It does not promote a migration route without its existing required project
  proof plus a reviewed canonicality result.
- It does not delete a tool or adapter only because the feature lacks usage
  analytics.
- It does not claim every target library has one universal style; findings are
  tied to exact package versions and documented project conventions.

## UI & UX

### Desktop

The README and docs home show one “start here” path for `css()`. Existing
Tailwind users get a nearby `tw()` path. Migration is a separate guided path
that begins with preview and explains residuals and evidence. Tool pages are
grouped by learning, migration, and verification roles rather than presented
as a flat set of equally central products.

### Common interactions

| User action | Result |
| --- | --- |
| Start a new Pandwind project | One short `css()` setup with a working example. |
| Keep an existing Tailwind project | A clearly labeled `tw()` integration guide with generated-file ownership and verification steps. |
| Evaluate a migration | A route-specific preview with target-native output, residuals, and proof level. |
| Explore advanced or experimental tools | Clear labels show the tool's supporting role and current evidence boundary. |

## Implementation steps

1. [x] Enumerated the current registry, target package versions, route corpus,
   fixture outputs, residuals, and proof reports.
2. [x] Applied a target-native review rubric for imports, carriers, tokens,
   composition, framework/host behavior, artifacts, CSS, and residuals.
3. [x] Captured every registered pair's primary input and output; linked route
   tests retain configured, secondary, and malformed scenarios.
4. [x] Recorded exact installed versions and authoritative API guidance;
   missing packages and rolling-doc limits remain explicit.
5. [x] Classified all 1,024 pairs in the ledger and kept output canonicality
   separate from route maturity and project proof.
6. [x] Reviewed the report before edits; A1–A4 were approved for focused fixes.
7. [x] Added issue fixtures before each approved fix and used separate,
   described JJ revisions. Route proof exposed one additional validation/host
   rewrite defect, which also received a fixture-first fix.
8. [x] Re-ran the full route and round-trip matrix: 1,984 files and 8,928 tests
   passed. Refreshed all primary route outputs and the audit report without
   promoting route maturity.
9. [x] Updated README, docs landing, navigation, migration/tool descriptions,
   and backend guidance for the primary `css()` path, `tw()` integration,
   audited migration tiers, and supporting/experimental roles.
10. [x] Kept remaining unverified routes and evidence gaps visible in the
    ledger and product documentation.

## Remaining evidence questions

Repository evidence cannot establish market interest or real-project adoption.
Keep these questions for a future evidence-gathering pass:

- Which two or three migration routes gain demonstrated interest after their
  canonical output and project proof are established?
- Which real projects or design partners can validate the first-use path?
- Which individual Inspector, DevTools, MCP, or backend surfaces merit more
  investment once usage evidence exists?

## Acceptance criteria

- [x] Every route currently selectable from the CLI or migration tooling is
      listed in the audit report, with unavailable or thin evidence marked
      `unverified` rather than skipped.
- [x] Every audited route records its target package/version, authoritative
      target guidance, representative input, current output, residuals, and
      canonicality verdict.
- [x] The audit distinguishes source-semantic correctness from target-native
      idiom and from installed-project proof.
- [x] The audit report has been reviewed before any adapter, emitter, expected
      output, or migration policy is changed.
- [x] Every approved codemod fix begins with a source-specific fixture and
      separate JJ revision; no bulk snapshot refresh alone can establish its
      correctness.
- [x] The product entry path explains one primary `css()` workflow, presents
      `tw()` as existing-stack integration, and does not add a public API.
- [x] Every major tool and backend has an explicit primary, supporting, or
      experimental role in product docs.
- [x] Migration claims use both existing route-proof requirements and the
      reviewed canonicality result; unverified routes remain clearly labeled.
- [x] No tool or adapter is removed solely because usage analytics are absent.

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-27 | Keep `css()` as the single default authoring path; describe `tw()` as Tailwind integration. | One entry path reduces choice burden without changing the frozen API. |
| 2026-09-27 | Audit every current codemod route for target-native output before changing emitters. | Existing semantic and runtime proofs do not establish idiomatic target-library usage. |
| 2026-09-27 | Keep tools and non-web backends available but classify them by supporting or experimental role. | Product focus does not require deleting surfaces without demand evidence. |
| 2026-09-27 | Complete the reviewed audit and approved fixes without promoting route maturity. | All route and round-trip fixtures pass, while 815 registry pairs remain unverified. |
