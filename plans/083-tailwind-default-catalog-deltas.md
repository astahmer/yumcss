# Versioned Tailwind baseline and project deltas

Status: complete. The evidence gate rejected shared baseline packaging; lossless interop value-catalog compaction shipped instead.

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

| Artifact                  | Consumer                                             | Planned representation and invariant                                                                                                                                 |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioned default catalog | Generated declarations and catalog resolvers         | Shared, type-only data where possible; keyed by exact Tailwind and catalog versions. It must not add browser runtime imports.                                        |
| `types.d.ts`              | Editor and TypeScript                                | Baseline plus override-safe delta types; retain current suggestions and accepted inputs. Measure the full type graph, not just this file's byte count.               |
| `tw.ts`                   | Authored runtime entry                               | Keep the current small API and static-folding behavior. Never import build-only metadata through this entry.                                                         |
| `tw.runtime.ts`           | Explicit dynamic runtime features                    | Include only runtime data those features require. Preserve arbitrary-value and dynamic merge behavior.                                                               |
| `tw.conflicts.ts`         | Runtime conflict handling and compiler/scanner paths | Keep every conflict/candidate record required for `cx()` folding and exact candidate verification. Split or omit data only after importer analysis and parity proof. |
| `tw.build.ts`             | Vite/compiler                                        | Use a compact baseline reference and project delta when resolvable; materialize exact candidates when required. Keep it out of browser bundles.                      |
| `pandwind.interop.json`   | Analyze and migration consumers                      | Move to a versioned schema carrying the baseline identity and delta. Consumers that need a full catalog resolve or materialize it through an explicit path.          |

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

1. [x] Complete Plan 082's evidence gate. The pinned Tailwind 4.3.3 default-only CLI workload and generated Playground project were measured across artifacts, package size, TypeScript diagnostics, generation, and the real migration route chunk. The full baseline redesign was not started before this comparison.
2. [x] Resolve the baseline identity question from official loader output. The stock import produced 414 utilities and 88 variants. The resulting type and interop files are recorded in the benchmark snapshot; no handwritten baseline or shared baseline package file was added.
3. [x] Close the semantic delta design as a no-go. No project catalog composition was introduced, so additions, overrides, resets, static utilities, plugins, tokens, variants, and conditions remain resolved by Tailwind's official loader and the existing code generator.
4. [x] Resolve shared type packaging. The stock declaration was 134,434 raw bytes and the customized Playground declaration was 142,978 bytes. The complete Playground check showed no typecheck improvement, and the package had a 338,079-byte tarball before this change. There is no demonstrated total cost reduction that justifies a shared type source or new package export.
5. [x] Inventory the generated artifact consumers. Keep types.d.ts, tw.ts, tw.runtime.ts, tw.conflicts.ts, tw.build.ts, bridge.ts, and pandwind.interop.json generation unchanged. Migration and Playground continue to consume a self-contained interop artifact; compiler and scanner paths retain their conflict/candidate metadata.
6. [x] Version and update the interop contract atomically. Schema v2 stores each generated utility value union once in valueTypes, keyed by generated type alias. Utility rows reference their valueType. The codegen writer, bridge refresh, project bootstrap, codemod reader, Playground reader, analyzer resource fixture, and generated project files now use v2. The codemod rejects stale v1 artifacts.
7. [x] Keep codegen output demand-driven policy unchanged. No sidecar was removed, made opt-in, or moved into the browser runtime. Existing static folding, dynamic tw behavior, conflict metadata, and compiler candidate verification remain intact.
8. [x] Cover producer and consumers with regression tests. Producer tests prove two utilities sharing one alias serialize one value list. Codemod tests cover v2 value recovery and v1 rejection. Playground tests prove shared aliases resolve to the same candidate set. Existing Tailwind/Cx compiler and runtime tests passed.
9. [x] Refresh generated outputs and evidence. Both generated example projects are fresh. The detailed report and overview include total project bytes, interop gzip, browser route output, generation samples, TypeScript diagnostics, and the baseline decision. CSS-in-JS Bench and Arena ranks remain unchanged because this tooling route is outside those benchmark lanes.

## Completion record

The broad versioned default-catalog plus project-delta redesign is closed without implementation: baseline sharing did not establish a lower combined package, generated-project, and TypeScript cost. The measured no-public-export alternative is schema v2 value-list sharing. Playground interop fell by 232,891 raw bytes and 4,026 gzip bytes; its MigrationLabPage bundle fell by 105,288 raw bytes and 3,882 gzip bytes. All nine generated Playground artifacts fell by 232,891 raw bytes.

The Playground TypeScript check remained statistically inconclusive: the snapshot moved from 340,769 to 340,499 instantiations while check time changed from 0.462 s to 0.604 s, with one additional test file. Whole-command generation samples moved from 4.71–5.26 s to 3.36–4.06 s and peak RSS stayed around 123–125 MiB; the command includes pnpm, formatting, and manifest refresh, so it is supporting evidence rather than an isolated generator speed claim.

The benchmark renderer's median calculation was corrected for odd sample counts while refreshing these reports. Raw benchmark inputs and external ranking snapshots were not changed. The report continues to separate this generated Tailwind tooling evidence from the primary css() and tw() comparison lanes.

## Open questions

1. [x] Can a shared type baseline be resolved without a new export and lower total cost? No measured typecheck gain or total size reduction justified adding that dependency surface.
2. [x] Which interop consumers require a self-contained catalog? Migration and Playground use the artifact directly, so v2 retains the complete value catalog and does not require a baseline resolver.
3. [x] Which sidecars can be omitted by default? None were removed. The producer and importer inventory does not justify changing writer defaults.

## Acceptance criteria

- [x] The evidence gate was completed before the baseline design decision.
- [x] The default Tailwind catalog was measured through the official loader at the pinned package version.
- [x] Baseline/delta type composition was explicitly rejected because total package, generated-project, and TypeScript cost savings were not demonstrated.
- [x] No new public tw() API or package export was added.
- [x] Interop producers and consumers use one v2 schema; stale v1 artifacts fail clearly.
- [x] Value unions are stored once per generated type alias, remain self-contained, and recover the exact candidate sets in codemod and Playground readers.
- [x] Existing Tw/Cx compiler/runtime, conflict, candidate, and generated-runtime-size tests pass; no static or dynamic feature was removed.
- [x] All generated project outputs remain enabled and generated artifacts/manifests are fresh.
- [x] Detailed and summary reports include the measured browser/tooling result without changing CSS-in-JS Bench or Arena ranks.
- [x] The broad redesign's no-go decision, the targeted improvement, and remaining trade-offs are recorded above.

## Decisions log

- Keep Plan 082 as the broad benchmark evidence plan; this plan's baseline redesign is closed by its evidence gate.
- Keep the official Tailwind loader as the source of the effective default and project semantics.
- Do not add a shared catalog package/type export without evidence of lower total cost.
- Use the versioned v2 interop dictionary because it cuts repeated values in a real Playground browser consumer while preserving a self-contained artifact.
- Preserve the current codegen writer set, public authoring APIs, and static/dynamic behavior.
- Report the tooling result separately from css() and tw() benchmark rankings.
