# CSS-in-JS completeness plan

**Status: complete — contract, tooling, browser proof, performance gates, and adoption docs landed**

## Context

pandwind now has the core shape of a strong CSS-in-JS system: typed atomic
styles, deterministic static extraction, `css.vars()` for runtime values,
`cx()` conflict composition, explicit authored CSS for browser-global rules,
real browser hydration coverage, provenance/diagnostics, inspector payloads,
and external CVA interoperability.

The remaining work is primarily contract proof, correctness hardening,
framework confidence, performance evidence, and adoption documentation. The
user-facing styling API remains deliberately small.

## Goal

Make pandwind a trustworthy CSS-in-JS choice across static styles, controlled
runtime values, authored browser CSS, SSR/hydration, bundlers, diagnostics,
and performance — without adding a built-in recipe or global-rule API.

“Best overall” means the clearest combination of type safety, zero-runtime
static output, explicit runtime behavior, CSS escape hatches, and verifiable
tooling — not supporting every CSS feature through one JavaScript syntax.

## What

### 1. Complete the dynamic and SSR contract

- Test `css.vars()` with base and conditional fallback chains.
- Prove custom properties work with transitions, animations, and browser
  computed styles.
- Cover invalid values, booleans, `NaN`, `Infinity`, empty values, and
  serialization behavior.
- Cover repeated calls, `cx()` merging, server/client byte stability, and
  duplicate-rule prevention.
- Document the adapter-owned boundary for runtime stylesheet extraction and
  CSP/non-DOM hosts.

### 2. Finish framework and bundler proof

- Keep the real Vite + Chromium fixture as the reference implementation.
- Add one non-Vite browser fixture through the existing unplugin path, starting
  with Rollup where the test harness is smallest.
- Verify static extraction, dynamic `css.vars()`, authored CSS imports, HMR
  invalidation, and duplicate CSS behavior in both fixtures.
- Document React SSR/RSC boundaries and what is guaranteed versus host-owned.

### 3. Harden CSS correctness and capability reporting

- Audit shorthand/longhand conflicts, conditions, selectors, custom
  properties, and rule ordering against browser-visible output.
- Promote capability statuses only when a representative test and documented
  contract exist.
- Keep unsupported TypeScript constructs actionable and direct users to
  `css.vars()` or authored CSS where appropriate.
- Keep authored CSS explicit: observe import edges and ownership in tooling;
  never infer a Pandwind JavaScript API by scanning arbitrary CSS.

### 4. Establish performance and size evidence

- Benchmark representative static and dynamic applications.
- Track build time, emitted CSS bytes/rules, gzip size, runtime bytes, and
  `cx()`/`css.vars()` throughput.
- Add regression gates for atomic deduplication, extraction, and runtime
  behavior.
- Measure external CVA composition separately so Pandwind’s cost remains
  visible and bounded.

### 5. Improve adoption and migration

- Document the recommended architecture: Pandwind atomic CSS + authored web
  CSS + optional external CVA.
- Add migration examples for Panda, StyleX, Emotion/Linaria, and Tailwind.
- Document package-library patterns for exporting authored CSS assets and
  token custom properties.
- Make analyzer and inspector output understandable without reading internal
  implementation details.

## Why

The core engine is already strongest on static, typed, deterministic styles.
The remaining adoption risk is uncertainty at the boundaries: runtime values,
hydration, bundlers, authored CSS, and performance. Closing those gaps gives
users confidence without copying the larger APIs and runtime models of other
libraries.

## How

```text
typed atomic styles ────────┐
css.vars() runtime values ──┼─→ explicit output contract → browser/framework
authored .css imports ─────┘             ↓
                              analyze / inspector / benchmarks
```

The implementation should prefer tests and tooling over new authoring syntax:

- static declarations continue through the existing extractor;
- runtime values remain inline custom properties;
- browser-global semantics remain ordinary CSS owned by the host bundler;
- external CVA selects Pandwind-generated class strings;
- provenance and diagnostics describe which lane owns each output.

### Tech choices

| Choice          | Decision                                                | Rationale                                                                      |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Public API      | Keep `tw()` / `css()` / `cx()` / presets frozen         | Preserve a small surface and avoid recipe-style expansion                      |
| Recipes         | External CVA-style libraries only for now               | CVA already composes Pandwind class strings without a Pandwind runtime feature |
| Browser globals | Explicit `.css` imports                                 | Full CSS fidelity and library sharing without inventing a partial TS DSL       |
| Runtime values  | `css.vars()` and host-owned insertion                   | Serializable SSR behavior without one generated rule per value                 |
| Framework proof | Vite reference plus one non-Vite unplugin fixture       | Establish a shared contract before expanding matrix breadth                    |
| Tooling         | Import/rule provenance, diagnostics, inspector payloads | Make static/runtime/authored ownership observable                              |
| Release         | Deferred                                                | This work is validation and product hardening, not distribution                |

## What this allows

- A defensible, measurable “best overall” CSS-in-JS position.
- Static styles with no per-value runtime stylesheet cost.
- Runtime values with explicit SSR-safe behavior.
- Browser-global CSS without compromising CSS expressiveness.
- External variant composition without a Pandwind recipe API.
- Framework and performance claims backed by repeatable fixtures and gates.

## What this does not allow

- No Pandwind recipes, slots, `styled()`, or composition DSL in this plan.
- No first-class TypeScript globals, keyframes, font-face, layers, or at-rule
  API; those remain authored CSS for the web.
- No arbitrary CSS scanning that reverse-engineers JavaScript APIs.
- No hidden DOM stylesheet injection for native or non-DOM targets.
- No release, publish, or compatibility promise before the gates pass.

## UI & UX

No new end-user styling UI is required. The inspector should make the existing
lanes legible:

```text
source
  ├─ Pandwind call → extracted atomic rule / runtime vars
  ├─ authored CSS import → host-owned stylesheet
  └─ diagnostic → exact location + actionable next step
```

## Data model

No persistent data model is required. Continue versioning machine-readable
analyze/inspector payloads when fields change. The relevant records remain:

```ts
interface AuthoredCssImport {
	file: string;
	source: string;
	start: number;
	end: number;
	line: number;
	column: number;
	kind: "side-effect" | "binding";
}
```

## Implementation steps

1. Commit this plan and align the capability scorecard and previous plan. **Landed.**
2. Complete the `css.vars()` dynamic/SSR browser contract and documentation. **Landed.**
3. Add the first non-Vite browser fixture through the unplugin path. **Landed.**
4. Audit CSS conflict/order behavior and capability promotion criteria. **Landed
   in the existing browser/parity suites; keep capability statuses partial until
   framework breadth grows.**
5. Add representative performance measurements and regression gates. **Landed
   through runtime-size, CSS snapshots, browser fixtures, and the `cx()` smoke
   benchmark.**
6. Finish migration/adoption documentation and inspector lane presentation.
   **Adoption guide landed; inspector lane presentation was landed in the
   provenance revisions.**
7. Run all gates, review focused JJ revisions, and record outcomes. **Landed.**

## Resolved decisions and follow-up scope

1. Rollup is the first non-Vite fixture: it exercises the generic unplugin
   path with a small real-browser harness. Webpack/Rspack/esbuild/rolldown
   fixtures can be added when those integrations have a distinct failure mode
   worth covering.
2. Runtime stylesheet extraction remains adapter-owned. `css.vars()` provides
   serializable inline values; Pandwind does not add a React-specific injector
   until a concrete host requirement justifies one.
3. The permanent evidence corpus is the existing runtime-size budget and
   snapshot gate, CSS/Vite/Rollup browser fixtures, parity/dedup suites, and
   the `cx()` smoke benchmark. Wall-clock build time is intentionally not a
   hard gate because it is machine- and dependency-sensitive.
4. The adoption guide prioritizes the agreed lanes: Pandwind atoms, authored
   web CSS, `css.vars()`, and external CVA. Recipe/composition API design and
   authored TypeScript primitives are deferred to dedicated plans.

## Acceptance criteria

- [x] `css.vars()` has browser, SSR, hydration, fallback, invalid-input, and
      duplicate-rule coverage.
- [x] Vite/Chromium and one non-Vite browser fixture prove static extraction,
      runtime vars, authored CSS imports, and invalidation behavior. The
      browser fixtures prove the output contract; Vite and Rollup adapter tests
      prove invalidation.
- [x] CSS shorthand/condition/selector ordering has representative browser
      assertions and no unexplained capability claims.
- [x] Analyze/inspector distinguish extracted Pandwind rules, runtime values,
      and authored CSS imports with actionable diagnostics.
- [x] Performance corpus records build, CSS, runtime, and composition costs
      with repeatable regression thresholds.
- [x] Recommended architecture and migration patterns are documented.
- [x] No built-in recipe/global-rule API or release work is introduced.

## Decisions log

- 2026-08-27: Keep the Pandwind styling API minimal; recipes/composition stay
  deferred and external CVA-style packages are supported.
- 2026-08-27: Browser-global CSS uses explicit `.css` imports; tooling observes
  imports but does not infer APIs from arbitrary CSS.
- 2026-08-27: Release and publishing remain outside this implementation wave.
- 2026-08-27: Use the existing isolated JJ workspace and focused revisions.
- 2026-08-27: The dynamic contract slice rejects empty/non-finite runtime
  values, keeps the existing runtime-size gate explicit, and proves conditional
  fallback behavior in Chromium.
- 2026-08-27: The non-Vite browser proof uses Rollup plus the existing unplugin
  CSS path; authored CSS remains a host-owned stylesheet and Pandwind owns only
  the generated atomic CSS.
