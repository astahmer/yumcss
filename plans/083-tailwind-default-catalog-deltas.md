# Versioned Tailwind baseline and project deltas

## Context

Plan 082 owns the broader performance evidence and contains the gate for the
generated `tw()` work. This plan owns the focused redesign only if that gate
shows a real benefit in consumer typechecking, build data, generated project
size, or runtime output.

The current generator loads the effective Tailwind design system through the
official loader, then emits project-specific types and several role-specific
artifacts. It materializes the active catalog rather than referring to a
versioned default catalog plus a project delta. The prior audit found large
Playground metadata files, while the ordinary `pandwind/tw` browser entry was
small. Source-file size alone does not prove a consumer cost; implementation
must compare total package, project, typecheck, build, and browser costs.

The installed Tailwind version is pinned in the workspace lockfile. Baselines
must be generated from that exact official package and keyed so a different
Tailwind or catalog version cannot silently reuse incompatible data. Tailwind
documents that `@theme` extends the default theme, redefining a variable
overrides it, `--color-*: initial` removes the default color utilities, and
`--*: initial` removes theme-driven defaults while retaining static utilities
([theme documentation](https://tailwindcss.com/docs/theme)). Those cases must
be reflected in type suggestions, compiler candidates, and migration metadata.

## Goal

Avoid regenerating and storing repeated default Tailwind data when a shared,
version-matched baseline plus a compact exact project delta lowers real
consumer cost. Preserve the authored `tw()` API, all current capabilities,
official Tailwind semantics, and the existing static/dynamic compiler
boundary.

## What

1. Generate and version a default Tailwind catalog from the official loader.
2. Represent project additions, replacements, and removals as an exact delta
   against a compatible baseline.
3. Reuse the baseline for editor types and build metadata where the consumer
   can resolve it; materialize the effective catalog for consumers that need
   a complete view.
4. Make full-generation fallback explicit when the baseline version or schema
   is unavailable.
5. Revisit which generated artifacts must be written by default, preserving
   every existing compile-time and runtime feature.
6. Replace the hand-authored small `tw` type benchmark with generated,
   representative Tailwind workloads and measure end-to-end costs.

## Why

The current benchmark does not exercise the large generated Tailwind
declarations. Generated sidecars have different consumers: editor types,
static compilation, optional runtime behavior, and migration context. A single
full catalog copied into several files can make project output expensive even
when that data never enters the browser. Conversely, moving it into the
Pandwind package may increase install size or type graph work. The design must
prove savings across those boundaries instead of counting only smaller
generated files.

## How

### Catalog model

```text
official Tailwind loader at exact version
        │
        ├── default configuration ──► versioned baseline catalog
        │
        └── effective project configuration ──► semantic project catalog
                                                   │
                         compatible baseline ─────┴──► exact delta
                         no compatible baseline ─────► full materialization
                                                           │
                         editor / compiler / interop consumers ◄───────────┘
```

The baseline is derived by running the official loader with Tailwind's stock
default import and no project customizations. Do not maintain a handwritten
copy of utilities, variants, conditions, tokens, or reset behavior. Store the
Tailwind package version, catalog schema version, and deterministic baseline
content hash in the baseline identity. Initially require an exact supported
version match; add wider compatibility only after loader-based parity proves
it safe.

Build a delta by comparing semantic catalog records, not CSS text or guessed
configuration vocabulary. It may contain additions, replacement values,
explicit removals, and metadata needed to resolve custom utilities, variants,
conditions, or tokens. An override replaces the matching baseline record; it
must not create duplicate type declarations or merge incompatible values.

Keep theme-driven and static utility candidates distinguishable. Derive that
distinction from the official loader's resolved design systems, including a
loader-generated `--*: initial` comparison if needed. A global theme reset
removes theme-driven defaults but retains static utility candidates. A
namespace reset removes defaults from that namespace, then includes any
project-defined replacements. Do not infer behavior from property names or
ship an adapter-owned partial Tailwind vocabulary.

### Artifact ownership and resolution

| Artifact | Consumer | Planned representation and invariant |
| --- | --- | --- |
| Versioned default catalog | Generated declarations and catalog resolvers | Shared, type-only data where possible; keyed by exact Tailwind and catalog versions. It must not add browser runtime imports. |
| `types.d.ts` | Editor and TypeScript | Baseline plus override-safe delta types; retain current suggestions and accepted inputs. Measure the full type graph, not just this file's byte count. |
| `tw.ts` | Authored runtime entry | Keep the current small API and static-folding behavior. Never import build-only metadata through this entry. |
| `tw.runtime.ts` | Explicit dynamic runtime features | Include only runtime data those features require. Preserve arbitrary-value and dynamic merge behavior. |
| `tw.conflicts.ts` | Runtime conflict handling and compiler/scanner paths | Keep every conflict/candidate record required for `cx()` folding and exact candidate verification. Split or omit data only after importer analysis and parity proof. |
| `tw.build.ts` | Vite/compiler | Use a compact baseline reference and project delta when resolvable; materialize exact candidates when required. Keep it out of browser bundles. |
| `pandwind.interop.json` | Analyze and migration consumers | Move to a versioned schema carrying the baseline identity and delta. Consumers that need a full catalog resolve or materialize it through an explicit path. |

Inventory every reader and writer before changing these contracts. The codegen
writer may stop writing a sidecar only when no enabled consumer needs it;
source files being absent from a browser bundle is not enough. Preserve the
current bridge ownership rule: codegen owns the interop artifact and bridge
generation refreshes only the bridge section.

The generated declarations need a resolvable shared type source to avoid
copying the baseline into every project. Prefer an existing Pandwind package
type surface or a generator-owned package artifact only if consumers can
resolve it reliably and its install/tarball cost is lower overall. Do not add
an authored `tw()` API or change its signatures. If sharing requires a new
published package export, stop at that boundary and write a separate API
design note for maintainer approval; this plan does not approve that surface
change.

### Fallback and interop behavior

Use the baseline only when its package version, catalog schema, and content
identity match. Otherwise generate the current complete representation from
the official effective design system. Never silently apply a nearby version
or emit a partial catalog. Consumers of the versioned interop artifact must
either resolve its baseline, request producer-side full materialization, or
return a typed unresolved-baseline diagnostic without discarding source data.

Update interop producers and consumers atomically to the new schema. The
repository is pre-launch, so do not keep dual readers or writers solely for
internal compatibility. Preserve the existing pre-artifact migration fallback
for projects that have not generated `pandwind.interop.json`.

### Generated workloads and measurements

Generate fixtures through the real codegen command and the pinned official
Tailwind package. Cover:

1. Stock default theme with no customization.
2. Theme extensions and project-added utilities or variants.
3. Overrides of stock values and utilities.
4. `--color-*: initial` with and without project replacement values.
5. `--*: initial`, proving theme-driven defaults disappear while static
   utilities remain.
6. Custom plugin utilities, variants, tokens, disabled features, and
   conditions from the resolved project configuration.
7. Dynamic/arbitrary `tw()` and runtime conflict merging, alongside equivalent
   static calls that the compiler folds.
8. A Tailwind version or baseline hash without a compatible baseline, proving
   full-generation fallback.

Measure each artifact's bytes, total generated project bytes, package tarball
and install contribution, generation wall time and peak memory, and complete
TypeScript check time, memory, and instantiations in a fresh process at small,
typical, and large usage counts. Measure actual static and dynamic consumer
bundles, CSS, and HTML separately. Keep `tw()` results separate from the main
`css()` benchmark lane. Smaller sidecars are not a win if package installs,
typechecking, generated runtime, or full builds get worse.

### Trade-offs

- A shared baseline can reduce duplicated project files but may enlarge the
  Pandwind package or TypeScript dependency graph.
- Exact version matching is safest but uses full generation for unsupported
  Tailwind releases until a compatible baseline is produced.
- A compact delta is not self-contained; interop consumers need a resolver or
  explicit full materialization.
- Demand-driven sidecars can reduce repository churn, but only when every
  compiler, runtime, migration, and tooling consumer has a precise generation
  contract.
- Full materialization fallback preserves reliability but may retain large
  outputs for custom or unsupported configurations. Measure before changing
  defaults.

### What this allows

- A default baseline generated from the exact official Tailwind package.
- Compact deltas that replace, add, and remove semantic records safely.
- Full fallback for incompatible baselines without dropping features.
- Internal representation changes to generated files and the versioned
  interop artifact, with atomic producer/consumer updates.
- Removing duplicate generated data when import, parity, and consumer-cost
  evidence supports it.

### What this does not allow

- Hand-maintained Tailwind utility or theme catalogs.
- A looser or guessed baseline match.
- Dropping arbitrary values, plugins, variants, conflicts, tokens, or runtime
  behavior to reduce bundle size.
- Treating declaration file bytes as a proxy for editor responsiveness.
- Changing the public `tw()` API or adding a package export without a separate
  design decision and maintainer approval.
- Optimizing only for benchmark rank or a synthetic generated-file total.

## Implementation steps

1. [ ] Complete Plan 082's evidence gate for `tw()`: verify current generated
   artifacts and importers; capture generated sizes, type diagnostics,
   generation cost, and real static/dynamic consumer bundles. Stop if no
   consumer cost is demonstrated.
2. [ ] Record the current resolved catalog and supported Tailwind versions.
   Add a deterministic baseline-generation command driven by the official
   loader and verify repeatable output. Do not hand-edit generated baseline
   files.
3. [ ] Define the versioned semantic catalog and delta operations. Cover
   additions, overrides, namespace resets, global theme resets, static
   utility retention, custom utilities/variants, and disabled features using
   official loader results.
4. [ ] Add override-safe type composition and a real generated `tw()` type
   benchmark. Compare baseline sharing against the current materialized
   declarations, including package/install cost and realistic TypeScript
   workloads. Resolve the shared-type packaging gate before changing consumer
   output.
5. [ ] Update `tw.build.ts`, `tw.conflicts.ts`, and runtime metadata readers
   to resolve the baseline and delta without adding build metadata to browser
   imports. Keep full materialization for unsupported baselines and preserve
   exact compile-time candidate and conflict behavior.
6. [ ] Version the interop artifact and update codegen, analyzer, migration,
   bridge, and tests together. Verify missing-baseline materialization and
   structured failure paths. Preserve bridge-section ownership.
7. [ ] Make writer output demand-driven only where the importer inventory
   proves a sidecar is unnecessary. Verify every current feature mode still
   generates the data it needs; do not change defaults based on file size
   alone.
8. [ ] Run the default, extension, override, reset, custom-plugin, dynamic,
   and fallback regression matrix. Compare exact candidates, diagnostics,
   type acceptance, runtime conflicts, compiler output, and interop results
   against the official loader and existing behavior.
9. [ ] Refresh generated-file, package, TypeScript, build, and browser
   measurements. Update the detailed report and summary only with demonstrated
   wins and label any trade-offs or no-change result.

## Open questions

1. Can a shared type baseline be resolved by consumers without creating a new
   published export or shifting more cost into the package tarball and type
   graph? If not, prepare the separate API design decision before coding that
   path.
2. Which interop consumers need a self-contained full catalog, and which can
   resolve a baseline from the installed Pandwind toolchain? Decide from the
   importer inventory rather than assumed portability.
3. Which generated sidecars are genuinely optional after accounting for
   compiler `cx()` folding, exact candidate filtering, dynamic runtime merges,
   migration, and editor types?

## Acceptance criteria

- [ ] No implementation begins unless Plan 082 demonstrates a real consumer
      benefit for changing Tailwind artifacts or type generation.
- [ ] Baselines are deterministic, generated from official Tailwind packages,
      and keyed by exact supported package/schema/content identity.
- [ ] Default, extension, override, namespace reset, global reset, plugin,
      token, condition, disabled-feature, and unsupported-version cases match
      the official loader's effective design system.
- [ ] An override replaces the default type and candidate; namespace resets
      remove affected defaults; global theme reset retains static utilities.
- [ ] Missing or incompatible baselines use complete official-loader
      generation or a typed failure path; no partial/guessed catalog escapes.
- [ ] Existing `tw()`, arbitrary-value, plugin, variant, conflict, `cx()`
      folding, static extraction, and runtime merge features remain covered.
- [ ] Static calls retain their current zero-marginal-JavaScript behavior;
      dynamic calls preserve runtime semantics and exact output.
- [ ] Interop producers and consumers use one new schema atomically, and
      bridge updates preserve the established ownership contract.
- [ ] No new public `tw()` API or package export lands without its separate
      design note and maintainer approval.
- [ ] Reports compare total project/package size, TypeScript cost, generation
      cost, real consumer JS/CSS/HTML, and full-build behavior; smaller files
      alone do not count as success.
- [ ] Detailed and summary benchmark reports keep the `tw()` lane separate
      from the primary `css()` API and report only measured improvements.

## Decisions log

- Keep Plan 082 as the broad evidence and comparison plan; this plan owns the
  conditional Tailwind generator and artifact redesign.
- Treat official loader output as the only source for baseline and project
  semantics.
- Preserve all current features and authored API unless future evidence and a
  separately approved design justify a change.
- Require an evidence gate before implementation; a no-change conclusion is
  valid when the generated files do not create a consumer cost.
