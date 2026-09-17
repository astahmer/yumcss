# Feature Plan: Build-time keyframes utility

**Status:** Implemented — the maintainer answered `go ahead` for the lane in
the same thread that dropped the `animations` token groups (plan 074 §7.32),
and declined `positionTry()` and `@property` in the same message. §7 holds
the decisions the implementation follows; §8 records what shipped.
**Created:** 2026-09-17
**Owner:** Pandwind maintainers

## 1. Summary and context

The ask was: _"ok we can have a small util to get a 'build-time,
component-local, tree-shaken.' keyframes fn. i dont even know what positionTry
is for; i dont think people will use '@property' (and afaik we already support
that somehow)"_.

Plan 074 §7.32 dropped the `animations` token group from every starter preset,
because each entry of those scales was a shorthand whose `@keyframes` body
lives in the upstream project's own stylesheet. That decision left one hole: a
project that writes `animation: spin 1s linear infinite` has no way to declare
the `spin` body through the Pandwind API, and Pandwind's own diagnostic still
says so — `css.keyframes(...)` is listed in the unsupported-construct map
(`packages/pandwind/src/vite/css-source-scanner.ts`) with the message
"Authored keyframes are not extracted yet."

Two lanes already exist for keyframes, and neither is the ask:

- The **runtime sheet** registers semantic rules of kind `keyframes`
  (`RuntimeSemanticRuleKindTag.Keyframes`) and serializes them as
  `@keyframes <name>{...}`. The Panda→Pandwind codemod emits that shape today
  (`runtimeKeyframes()` in `pandwind-codemod`). It is a runtime registration
  path: nothing exists in the emitted stylesheet until the app runs.
- **Authored CSS** (`import "./animations.css"`) works and stays supported, but
  it is a second source of truth for a component-local animation.

The ask is the third lane: a compile-time utility that emits the `@keyframes`
rule into the Pandwind stylesheet and returns the animation name the authored
`animation` shorthand references. A preset-free shorthand is exactly what 074
left behind — `animation` keeps its literal-value handling, so the util only has
to produce a name.

## 2. Goals

- `css.keyframes({ from: {...}, to: {...} })` on every CSS factory returns a
  deterministic animation name, and the bundler emits the matching
  `@keyframes` rule into the generated stylesheet.
- The name is stable across build, SSR, and client, so a server-rendered
  element and its hydrated client element reference the same animation without
  any registry, counter, or hydration handshake.
- The utility is component-local and tree-shakeable: a statically-authored call
  is folded to its name literal, so the body does not ship to the browser and a
  module whose only CSS use is a keyframe can drop the factory entirely.
- Values inside a step resolve through the same preset path as any other
  declaration, so `$blue-500` resolves and its custom property lands in the
  "used" token set.
- Remove the blanket `css.keyframes` diagnostic; report only the bodies that
  cannot be expressed at build time.
- Keep the addition inside the frozen API: no new package export, no new
  subpath, one new projection on the existing factory.

## 3. Non-goals

- `positionTry()` — declined by the maintainer in the same message, and
  `@position-try` has no upstream or preset-side vocabulary to port.
- `@property` definitions (the `css.property(...)` diagnostic) — declined in
  the same message, and Pandwind already publishes typed custom properties
  through the token lane.
- `css.global`, `css.fontFace`, `css.layer`, `css.supports` — each keeps its
  unsupported-construct diagnostic. This lane ports keyframes only.
- No `animations` token group returns to any preset (074 §7.32 stands).
- No runtime-sheet keyframe registration from the new utility. The
  `pandwind/css/runtime` lane the codemod targets keeps its own path; the new
  utility is the static lane.

## 4. Design

### 4.1 Carrier and call shape

```ts
const spin = css.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

<div style={{ animation: `${spin} 1s linear infinite` }} />;
```

The carrier is the factory the module already imports (`css.keyframes`), not a
new import or subpath. The scanner already resolves CSS carrier imports by name,
so an imported `css`, `design`, or aliased carrier all work, and the
diagnostic that recognized `css.keyframes` today becomes the extraction path
instead of a warning. `createUnsafeCss` exposes the same projection so the
untyped lane stays complete.

### 4.2 The name

``${namespace}-kf-${hash}`` (namespace defaults to `pw`), where the hash is taken over a
canonical form of the authored body:

- step keys normalized: `from` → `0%`, `to` → `100%`;
- steps sorted by position (numeric percentage);
- declarations sorted by property name.

The canonical form is shared by the runtime factory and the extractor through
one function, so the folded literal and the emitted rule cannot drift. Two
spellings with identical semantics (`from`/`to` versus `0%`/`100%`, or a
reordered declaration map) produce one name and one rule. The emitted CSS keeps
the normalized step spelling for the same reason.

### 4.3 Emission

`createStylesheet` gains a keyframes lane:

- `sheet.processKeyframes(body)` resolves every declaration through the
  existing property/token path, registers one rule keyed by the animation name,
  and marks the referenced token paths used.
- `sheet.gen.keyframesEntries()` returns those rules in deterministic
  name order; `generate()` and the bundler's `render()` place the lane after
  the token block and before the atomic and var rules.
- Conditions inside a step are rejected: a keyframe step has no selector, so
  `_hover` could only be dropped silently. The sheet throws the way
  `processVarKey` does for `colorPalette` in `css.vars`.
- Per-route splitting treats a keyframe rule as one more identified rule with
  the `k:` kind prefix, so a body used by two route buckets is shared into the
  common chunk and a body used by one route stays in that route's chunk.

### 4.4 Extraction and folding

- The extractor walks `css.keyframes(...)` calls, evaluates a literal body, and
  records `{ name, body, provenance }` next to the extracted styles.
- The static rewriter replaces a fully literal call with the name string
  literal, which is what makes the lane build-time and tree-shakeable. A body
  that is not provably literal stays on the runtime call and is reported as
  `unsupported-construct` ("the body must be a static object literal"),
  because a dynamic body can compute a name but cannot emit a rule.

## 5. Impact

- `pandwind/css` runtime: one small attachment (`attachKeyframes`), measured
  and added to the size evidence.
- Build lane: one new sheet section threaded through `render`,
  `collect`, `buildBucket`, and `collectSplit` in the extractor core.
- Extraction contracts: `CssFileExtraction` gains `keyframes`, the provenance
  `callKind` union gains `"css.keyframes"`.
- Prebuilt lib artifacts (published design-system artifacts) keep their
  current shape: no producer can emit a keyframe rule today, and the artifact
  generator reads a preset rather than scanned source. Recorded here so a
  later producer must extend the artifact contract deliberately.
- Docs to rewrite: the authored-CSS page's claim that keyframes are
  intentionally absent, the `css.md` globals row, the limitations and
  getting-started pages, and the capability ledger
  (`keyframes-font-face` moves from runtime-only to a static-plus-runtime
  split).

## 6. Approval gate

`AGENTS.md` freezes the user-facing API and requires a written plan plus an
explicit maintainer go-ahead before new surface lands. This document is the
plan and the maintainer gave the go-ahead for this lane in message, so
implementation proceeded.

## 7. Decisions

1. **Carrier: `css.keyframes(...)`, no new export.** The diagnostic already
   recognized the call shape, the scanner already resolves carrier names, and
   a separate subpath would add a package export for one function.
2. **Content-hashed names, not a counter or registry.** A counter needs shared
   mutable state, which breaks SSR/client parity and dedup alike. The hash is
   computed from the canonical body, so both lanes agree by construction and
   identical bodies collapse to one rule.
3. **Normalized steps and sorted declarations.** Keyframe order and
   declaration order carry no semantics beyond duplicate-percentage overrides,
   which the preset lane does not allow anyway (one step object per key).
   Normalizing makes the name independent of authoring sugar.
4. **Keyframes in their own sheet lane, before atomic rules.** `@keyframes` is
   order-independent against class rules and must not participate in the
   priority bands, so it stays out of the ordering policy and is sorted by
   name instead.
5. **Conditions are rejected in steps.** Dropping them silently would ship a
   wrong animation; the sheet throws, and authored CSS remains the documented
   fallback for anything a step cannot express.
6. **Literal-only extraction, with a named failure.** A dynamic body cannot
   produce a rule, so the diagnostic reports it instead of leaving a silent
   hole. The runtime call still returns a name so nothing crashes at runtime.
7. **Token references resolve inside steps.** A step is a normal declaration
   map, so `$blue-500` resolves and its custom property joins the used-token
   set. A keyframe that referenced an unemitted token would be a silent break.
8. **Route splitting treats a keyframe as an ordinary identified rule.** The
   `k:` kind prefix keeps ids collision-free, and the shared-rule rule (two
   route buckets → common chunk) is exactly the semantics an animation name
   needs: the name must exist wherever the element using it renders.
9. **No runtime-sheet registration from the new utility.** `pandwind/css` is
   DOM-free by design; the `pandwind/css/runtime` lane keeps owning dynamic
   registration for converted projects, and this utility stays static.
10. **Lib artifacts are unchanged.** Nothing produces keyframe rules for a
    prebuilt artifact today; extending that contract without a producer would
    be untested surface.
11. **`positionTry`, `@property`, `global`, `fontFace`, `layer`,
    `supports` are declined.** The maintainer declined the first two; the rest
    keep their existing diagnostics and no vocabulary to port.
12. **Debug-mode readable names are not offered.** The name must be identical in
    both lanes under every flag, and `createHashFn(debug)` switches spelling
    between builds. Keyframes keep the hashed form in debug.

## 8. Progress

Landed as its own described revision.

- **Plan** — this document.
- **Runtime projection** — `css.keyframes(...)` on `createCss`,
  `createGeneratedCss`, and `createUnsafeCss` through `attachKeyframes`,
  backed by one shared canonical-name function.
- **Static lane** — the keyframes section in `createStylesheet`, threaded
  through the extractor core, the per-route buckets, and the external rule
  merge.
- **Extraction and folding** — `css.keyframes` artifact extraction, the
  literal fold in the static rewriter, and the narrowed diagnostic.
- **Evidence** — extraction, sheet, runtime-factory, rewriter, route-splitting,
  and size tests, plus the docs, capability ledger, size snapshot, and
  `PERF.md` rows.

