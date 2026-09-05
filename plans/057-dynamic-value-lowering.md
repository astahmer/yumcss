# 057 - Dynamic value lowering (static-first, runtime fallback)

Goal: make dynamic styling values (\`tw({ bg: color })\`, \`css({ color: "blue." + shade })\`)
static-first instead of "runtime-only, hope the class exists". Every dynamic
shape gets one of three honest outcomes:

1. **static**: the value set is finite and provable -> compiler emits all
   candidates (tw) or folds the static part and lowers only the dynamic
   remainder through a stable custom-property carrier (css);
2. **target-native carrier**: \`css.vars\` / \`css.props\` with the value delivered
   inline - no dynamic value is ever serialized into generated CSS;
3. **structured residual**: unbounded expressions keep runtime behavior and are
   reported (\`unresolved\` lane for tw, migration residuals for codemods).

Routing table (from the approved design):

\`\`\`
dynamic CSS value -> css.vars / css.props carrier (inline style)
dynamic Tailwind token -> finite candidate extraction -> safelist/@source inline
unknown/unbounded expr -> preserve runtime behavior + report missing static proof
\`\`\`

User-facing API note: \`css.vars\` and \`css.props\` already exist in the frozen
surface; this plan adds no new public API. Compiler/codemod work only.

## Tasks

- [x] T1 - Finite-value evaluation layer. New evaluator API beside
      \`evalLiteral\` (\`packages/pandwind/src/tw/literal.ts\` or sibling) that
      returns a _set_ of possible values for ConditionalExpression, Logical
      \`&&/||/??\`, arrays and object property values. \`evalLiteral\` semantics
      unchanged. Unit tests: ternaries, nested ternaries, \`||\`/\`??\`, arrays,
      consts scope, mixed static/dynamic.
- [x] T2 - Finite candidate discovery in \`inlineTwCalls\`
      (\`src/vite/inline.ts\`): when a \`tw()\` argument is not fully literal but
      every dynamic position has a finite value set, do NOT inline; instead
      compile one class string per combination and return the candidate list so
      the host can register them (safelist). Cap combinations (<= 256 per
      call); beyond the cap -> residual diagnostics. Runtime call stays
      untouched.
- [x] T3 - Candidate output wiring. Plugin exposes collected candidates; tests
      cover \`@source inline\` emission shape and \`pandwind-tw scan\` module mode
      (extend \`src/tw/collect.ts\` to consume the same evaluator). Unbounded
      values produce an explicit coverage diagnostic, never a guessed class.
- [x] T4 - Official-engine validation of finite candidates through the
      existing \`tokenHasCss\` conflict-map lane (\`src/vite/unresolved.ts\`) with
      inline snapshots; unresolved candidates surface via \`onUnresolved\` as
      today.
- [x] T5 - Partial lowering in \`StaticCssCallRewriter\`
      (\`src/vite/css-call-rewriter.ts\`): per-declaration analysis of \`css()\`
      objects. Static declarations fold; dynamic declarations rewrite to the
      \`css.vars\` carrier form (inline emission when the call site shape is a
      JSX-safe class+style pair). Whole-call fallback unchanged. Inline
      snapshots for mixed objects, conditions, and refusal cases.
- [x] T6 - Token preservation: when a dynamic value selects among known
      configured tokens (finite value set matches preset token values), emit
      candidates that reference tokens (e.g. \`bg-blue-500\`) rather than
      arbitrary values; exact-match only, verified against the preset catalog.
- [x] T7 - Codemod lane: migrate dynamic CSS values to \`css.vars\`/\`css.props\`
      when the host shape makes it safe (source adapters -> pandwind css
      dialect). Issue-driven fixtures first; unbounded expressions keep source + typed residual. Bounded interpolations lower through the T5 carrier
      lanes; JS call heads (non-CSS functional notation) fail closed with a
      capability residual (\`opzlszkq\`).
- [x] T8 - Runtime-sheet dynamic-value tests: repeated dynamic values dedupe
      rules; var toggle rules resolve condition-specific custom properties with
      base fallback (extends \`tests/runtime-sheet.test.ts\`, \`css-vars.test.ts\`).
- [x] T9 - SSR/hydration/browser dynamic tests: theme changes, responsive
      conditions, pseudo states through the vars carrier; assert no dynamic
      value leaks into generated CSS (extends \`tests/css-ssr.test.ts\`).
- [x] T10 - Docs: dynamic-values section in docs reflecting the routing table
      and diagnostics; update plan checkboxes as tasks complete. Added the
      tw() dynamic-values/token-preservation section, the token branch in the
      technical-overview routing tree, and the plan-057 record in
      shipped-plans.

## Definition of done

- \`tw({ bg: color })\` with a finite dynamic value set: all candidates registered
  for Tailwind scanning; runtime call unchanged; no CSS invented silently.
- \`css({ color: "blue." + shade })\`: static part folded at build time, dynamic
  part carried by \`css.vars\` with inline style; no runtime CSS injection.
- Unbounded expressions: runtime preserved + structured diagnostic/residual.
- All new behavior covered by inline snapshots + ordinary \`expect\` assertions
  (issue-driven workflow). Focused vitest runs only during development.
