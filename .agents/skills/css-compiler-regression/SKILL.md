---
name: css-compiler-regression
description: Validate YumCSS compiler, CSS serialization, extraction, and lint changes across authored input, emitted CSS, runtime behavior, and performance boundaries.
---

# CSS Compiler Regression

Use when changing YumCSS's compiler, CSS emitters, style extraction,
typed-CSS rules, codemods, or runtime serialization.

## Establish the behavior boundary

1. Trace the authored input through parsing, semantic analysis, IR/lowering,
   generated CSS, and browser/runtime consumption.
2. Identify every affected emitter or runtime path. A clean diagnostic report
   does not prove that the emitted selectors, tokens, or browser behavior are
   correct.
3. Separate compiler semantics from lint policy. Share a pure helper only when
   both paths require the same stable semantic decision; do not run the full
   compiler from a linter or make policy-only lint decisions compiler-owned.

## Build a regression matrix

Choose relevant cases from the changed boundary:

- authored CSS versus emitted CSS, including exact selector ancestry and
  selector-list behavior;
- responsive and nested composition across cascade layers;
- token names that collide with CSS keywords, and token serialization such as
  alpha, shadow, or composite values;
- recipe and atomic paths, generated aliases, and design-system replay;
- extraction that must ignore non-style component props or ambiguous values;
- each supported source parser/runtime affected by the change.

Add a minimal source fixture and an explicit expected result for every reported
regression. Keep unsupported or ambiguous inputs conservative and preserve
source with a typed residual where the codemod cannot prove semantics.

## Prove output and cost

- Run focused unit and fixture checks for the semantic change.
- Compare generated CSS or output trees when multiple emitters could drift.
- Use browser/runtime assertions for selector, token, hydration, or DOM
  behavior that static diagnostics cannot establish.
- If a hot path changed, compare a focused benchmark with the same inputs and
  environment. Keep local, upstream, and published measurements distinct.
- Report focused proof separately from unrelated baseline failures. Do not
  claim full runtime parity from a compiler snapshot alone.
