# Plan 021 — Multi-target style backends (CSS / RN StyleSheet / canvas / TUI)

**Status: in progress — steps 1–3 landed 2026-08-25 (IR + css backend
extraction, object-emitting skeleton, `pandwind/react-native`); step 4
(opentui) next. Design decisions approved 2026-08-25; implementation
not started (needs explicit go-ahead per AGENTS.md).**

## Context

What exists today (the whole pipeline assumes CSS as the terminal artifact):

```
design vocabulary (css()/createDesignCss: ~30 Figma-style props, $frame/$layout/$text)
  → resolveDesignStyle()        design/types.ts + design/resolve.ts
  → flat StyleObject            keys like `_hover__color`, values are strings
  → ClassNameStrategy           css/class-name-strategy.ts (plan 005)
       ├─ default atomic        hash → opaque class, atom registry
       ├─ named-atoms           readable classes, sheetBacked
       └─ tailwind adapter      external compiler, not sheetBacked
  → atom registry               css/atoms.ts
  → generated stylesheet        vite/css-extract.ts (pandwindCssVite), unplugin.ts
  → cx()                        merge = drop shadowed class names
```

- Tokens are DTCG (`definePreset`, plan 002); conditions (`_hover`, `_dark`) are
  preset-declared and flattened into keys before any strategy sees them.
- `tw()` is Tailwind-class-string-shaped by definition — it is NOT the portable
  layer. Everything portable lives in `css()`/`createDesignCss`.
- Precedent: plan 005 proved "one `css()` API, swappable output" at the class-name
  level. This plan generalizes the _terminal artifact_ itself (classes+sheet →
  whatever the target consumes).

## Goal

One sentence: the same `css()`/design-vocabulary source code can be lowered to any
style system — web CSS, React Native StyleSheet, canvas draw styles, TUI styles —
by choosing a backend, with the design layer (vocabulary, tokens, conditions, cx
semantics) staying target-independent.

## What

A `StyleBackend` (name TBD) layer below `resolveDesignStyle()` that owns the
lowering from resolved style objects to target artifacts:

| Backend        | Terminal artifact                                             | Registry/sheet equivalent               |
| -------------- | ------------------------------------------------------------- | --------------------------------------- |
| `css` (today)  | class strings + stylesheet                                    | atom registry + `pandwindCssVite` sheet |
| `react-native` | style objects / refs on the RN `style` prop (array-mergeable) | runtime registry keyed by atom hash     |
| `opentui`      | plain style objects on OpenTUI's `style` prop (spread-merged) | runtime registry keyed by atom hash     |
| `canvas`       | plain style objects consumed by draw code (later — see steps) | runtime registry                        |

In scope:

- Backend interface + the `css` backend as the reference (behavior-preserving).
- Per-backend vocabulary subsets: what compiles, what is a compile error, what
  downgrades with a warning (e.g. `_hover` on RN).
- cx() merge semantics per backend (class merge today; object merge elsewhere).
- Token reuse: same DTCG preset feeds all backends; per-target unit policies
  (px vs unitless numbers vs cells).

Reference: `~/.references/state-machine` (see `reference-repos.md`) — its
"core never imports a substrate / targets are thin" boundary is the same split
this plan makes (design core vs backends). Mined facts: its `native` target
merges styles as RN arrays (`[own, library]`), its `opentui` target merges
OpenTUI styles by spread (`{ ...consumer, ...library }`) — OpenTUI style is a
plain camelCase, unitless-number object (yoga layout). Both non-CSS targets are
therefore "style-object emitters" differing only in merge semantics + registry
wrapper.

Out of scope:

- `tw()` on non-CSS targets (it stays web-only).
- Runtime theme switching on non-CSS targets (plan 015 is var-based = CSS-only).
- Full RN platform-conditioning (`.ios.ts`/`.android.ts` file conventions).

## Why

- The design layer is the differentiator (typed, token-constrained, ~30 props).
  Today it is web-locked; RN/canvas/TUI apps get nothing from it.
- Dogfooding: any of our own TUI/canvas tooling could consume the same tokens.
- Competitive framing (plan 019): tamagui/nativewind solve RN by forking the API
  or compiling Tailwind classes at runtime; pandwind's design layer is a cleaner
  portable core if the terminal artifact is pluggable.

## How

### Conceptual model

The design layer produces a **target-independent IR**: flat, condition-nested,
token-resolved style objects. A backend is a pure(ish) lowering IR → artifacts:

```
                       ┌─ css backend    → class names + stylesheet (today)
style object → IR ─────┼─ rn backend     → style refs + generated StyleSheet module
(tokens, conditions    ├─ canvas backend → style objects for draw calls
 already resolved)     └─ tui backend    → TUI style objects
```

`ClassNameStrategy` does not disappear — it becomes an internal concern of the css
backend (the existing three strategies keep working unchanged).

### Operations / behavior

- Backend selection lives in **subpath exports** (`pandwind/rn`, `pandwind/opentui`):
  each re-exports target-bound `css` / `createDesignCss` / `cx`. Zero changes to
  the frozen core API; per-app granularity (the right scope — a module graph
  should not mix targets); two css instances can't fight over one registry.
  Internally implemented as `createCss({ backend })` — the option exists but the
  subpath is the documented surface.
- Each backend declares: vocabulary subset + per-key value policy, condition
  policy (fold / error / warn), artifact emission, cx merge implementation.
- Runtime-only emission for non-CSS targets (decision): `css()` resolves against
  the preset at runtime and returns target-native values (style objects / refs).
  No Metro/babel integration needed; the atom-hash registry gives dedup for free.
  A build-time Metro story can come later without API change.
- Condition policy (decision, per-backend declared, strict by default):
  unsupported condition = **type error + runtime throw** (loud beats a silently
  dead style). A backend may whitelist conditions that map to a native notion
  (e.g. `_dark` on RN via `Appearance.getColorScheme()` — only if the style
  resolution path can observe it; otherwise it errors too). No build-time
  folding in v1 (that requires the build integration we're deferring).

### Tech choices

| Choice                     | Decision                                                                                                    | Rationale                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Where the abstraction sits | Below `resolveDesignStyle`, not inside `ClassNameStrategy`                                                  | Strategy only names classes; RN/canvas don't have classes at all                                |
| `tw()` portability         | none — stays CSS-only                                                                                       | Tailwind semantics are class-string-shaped; faking it elsewhere is nativewind's pain, not ours  |
| IR shape                   | reuse today's flat `StyleObject` (keys `_cond__prop`)                                                       | Already target-independent; zero churn for the css backend                                      |
| Target selection surface   | subpath exports (`pandwind/rn`, `pandwind/opentui`)                                                         | Frozen-API-safe; per-app granularity; no registry collisions                                    |
| Non-CSS emission           | runtime-only                                                                                                | No Metro/babel integration; dedup via atom-hash registry; build-time can layer on later         |
| Ambition model             | layered: shared tokens+vocabulary always; shared call sites wherever the backend's vocabulary subset allows | "Both" of write-once and share-the-system, enforced by the type system instead of a mode switch |
| TUI target                 | OpenTUI (plain style objects, yoga layout)                                                                  | Concrete consumer identified via ~/.references/state-machine                                    |

### Architecture

```
app code (css()/createDesignCss calls, any target)
   │
   ├─ web: vite/unplugin fold+extract (unchanged)
   └─ non-web: backend-specific pipeline (codegen CLI? babel? runtime?)  ← Q4
```

## What this allows

- One design system + token preset across web, RN, OpenTUI (and later canvas) apps.
- Per-target compile errors instead of silent style drift (RN can't hover → type
  error, not a dead style).
- cx() semantics defined once at the IR level, implemented per backend.

## What this does not allow

- No cross-target _runtime_ style sharing (a TUI build can't consume a web sheet).
- No new user-facing API beyond target selection (freeze policy holds).
- No promise that every CSS property makes sense on every target — the vocabulary
  subsets are per-backend and typed.

## Implementation steps (draft, post-go-ahead)

1. Formalize the IR: document today's flat StyleObject as the contract (types +
   tests), extract the css backend from `create-css.ts` behind the new interface —
   pure refactor, byte-identical outputs.
2. Object-emitting skeleton (serves RN + OpenTUI + canvas): runtime registry
   keyed by atom hash, per-backend value/unit policy, per-backend merge
   (array vs spread), strict condition policy.
3. `pandwind/rn` subpath: RN vocabulary subset (flexbox, camelCase, unitless
   numbers, no selectors/units/cascade), cx() → merged registered style object,
   parity tests vs css-backend merge semantics.
4. `pandwind/opentui` subpath: same skeleton, OpenTUI vocabulary (borders,
   color downsample policy, cell spacing policy `round(step/4)` default),
   parity tests.
5. canvas backend — only when a concrete consumer appears (draw-call semantics
   are a different beast: no layout, paint-state only).
6. Docs + parity suites per target (pattern: existing tw/css parity suites).

## Open questions

1. ~~Ambition~~ → **resolved**: layered model (see Tech choices) — tokens and
   vocabulary always shared; call-site portability wherever the backend's typed
   vocabulary subset allows. Write-once is a property of the subset, not a mode.
2. ~~API surface~~ → **resolved**: subpath exports (`pandwind/rn`,
   `pandwind/opentui`), implemented via an internal `createCss({ backend })`.
3. ~~Priority~~ → **resolved**: RN and OpenTUI together — they share the
   object-emitting skeleton; canvas deferred until a real consumer exists.
4. ~~Metro gap~~ → **resolved**: runtime-only; build-time Metro story deferred.
5. ~~Conditions~~ → **resolved**: strict per-backend policy (error by default;
   whitelisted native mappings like RN `_dark` only where observable at
   resolution time).
6. ~~TUI consumer~~ → **resolved**: OpenTUI, identified via the state-machine
   reference repo (`packages/opentui` shows the exact style-prop shape).

Remaining (smaller):

7. ~~cx() return shape on object backends~~ → **resolved**: single merged value
   everywhere (see decisions log) — matches today's eager conflict-resolution
   semantics and the existing cx parity tests.
8. ~~Token unit policy~~ → **resolved**: per-backend unit policy over the same
   DTCG tokens (see decisions log); RN automatic, OpenTUI declared-with-default.
9. ~~Package split~~ → **resolved**: no new packages — subpath exports only.
   Object backends emit structurally-typed plain objects and never import
   `react-native` / opentui types, so `pandwind` stays dependency-free.

## Acceptance criteria

- [x] css backend behind the new interface: existing suites (parity, adapter,
      named-atoms) green byte-identical (step 1, size baseline +91 B min for the
      seam — intentional, sanctioned via `pnpm test:size -u`).
- [ ] Each new backend: vocabulary-subset typing, condition policy tests,
      cx merge parity tests against the css backend semantics.
  - [x] react-native (step 3): value/unit policy + shorthand expansion +
        condition-policy + stable-identity/cx tests (`backends-react-native.test.ts`).
        Note: export is `pandwind/react-native` (module `src/rn.ts`, avoids the
        `react-native.ts` vs `react-native/` resolution clash).
- [x] No new required user-facing API for existing web apps (zero-churn upgrade;
      object backends are additive subpath exports).

## Decisions log

| Date       | Decision                                                                                                                                                                                              | Rationale                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-25 | Abstraction below `resolveDesignStyle`, not in `ClassNameStrategy`                                                                                                                                    | Strategy names classes; other targets have no classes                                                                                                                                  |
| 2026-08-25 | `tw()` stays CSS-only                                                                                                                                                                                 | Class-string semantics are inherently web                                                                                                                                              |
| 2026-08-25 | Target selection via subpath exports                                                                                                                                                                  | Frozen-API-safe; per-app scope; no registry collisions                                                                                                                                 |
| 2026-08-25 | Runtime-only emission for non-CSS targets                                                                                                                                                             | No Metro/babel integration; hash-registry dedup; build-time can layer later                                                                                                            |
| 2026-08-25 | Layered ambition: shared tokens+vocabulary always, shared call sites per vocabulary subset                                                                                                            | Both user goals without a mode switch; typing enforces portability                                                                                                                     |
| 2026-08-25 | Strict condition policy (error by default)                                                                                                                                                            | Loud failure beats silently dead styles; folding needs build integration we defer                                                                                                      |
| 2026-08-25 | TUI target = OpenTUI; RN + OpenTUI first, canvas deferred                                                                                                                                             | Concrete consumer mined from ~/.references/state-machine; both share the object-emitting skeleton                                                                                      |
| 2026-08-25 | cx() returns one merged value on every backend (class string / merged registered style object)                                                                                                        | Today's cx resolves conflicts eagerly; arrays would defer resolution to render order and break parity semantics. Hash-registry the merged object → stable reference for RN memoization |
| 2026-08-25 | Unit policy per backend over the same DTCG tokens: RN = automatic (px token value → unitless dp number, 1:1); OpenTUI = declared policy, default `step → round(step/4)` cells, per-preset overridable | RN dp ≈ px at 1x so the mapping is honest; px→cells has no honest automatic conversion, so OpenTUI declares one with a 4px-per-step default                                            |
| 2026-08-25 | No split packages — subpath exports only; object backends never import react-native/opentui types                                                                                                     | Keeps pandwind dependency-free; plain objects type structurally                                                                                                                        |
