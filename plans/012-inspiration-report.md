# Plan 012 — Inspiration report: stealable ideas from pandabox / tokenami / stylex / panda-css

Researched 2026-08-23 by direct source study (shallow clones of astahmer/
pandabox, tokenami/tokenami, facebook/stylex) and live docs (panda-css.com,
npm registry). Each item: what it does → what to steal for pandwind → concrete
adoption sketch (files/mechanics), or why it does not apply.

Pandwind assets to map against: codegen-first types (`types.d.ts`, conflict/
variant/compose meta), vite folding passes (`vite/inline.ts`, `cx-inline.ts`,
shared engine context), `ClassNameStrategy` contract, DTCG → `@theme`
pipeline (`generate-theme.ts`), `packages/analyze` fold-coverage CLI,
`packages/codemod`.

---

## 1. astahmer/pandabox

### 1a. `unplugin-panda-macro` — "make your styled-system disappear at build time"

**What:** an unplugin that statically evaluates `css()`, `cva()`, recipes and
JSX factory calls and inlines them as final class names; removes unused CSS
variables/keyframes from output. Zero runtime, no Panda CLI/postcss needed.
**Steal:** validates our unplugin adoption (in-flight); two additional ideas:

- **Output-shape toggle**: they support inlining as `atomic` _or_ `grouped`
  class names per call site. For pandwind this maps onto `ClassNameStrategy`
  selection — expose it as a per-call-site escape hatch
  (`/* pandwind:strategy=named-atoms */`) rather than global-only config.
- **Unused-CSS-variable pruning**: same pruning pass applies to our `@theme`
  artifact — prune theme vars whose utilities never appear in scanned sources.
  **Adoption sketch:** pruning lives in `generate-theme.ts` consumers
  (`pandwindCssVite` collect pass already walks every scanned file; feed found
  utility var names into a `gen.theme({ usedVars })` filter). Gate behind an
  option default-off, same documented caveat pandabox has (breaks dynamic
  `token()` access).
  **Why parts do not apply:** their macro covers cva/recipes/JSX factories — we
  have no recipe/factory layer; our equivalent surface (`cx`, sub-keys) is
  already covered by `vite/cx-inline.ts`.

### 1b. `panda-plugins/missing-css-warnings`

**What:** warns when a CSS rule was used at runtime but could not be
statically extracted.
**Steal:** this is the missing half of `pandwind analyze` — today we report
fold coverage of _calls_, not whether emitted classes are guaranteed to have
CSS. Add a warnings lane: every unfolded `cx()`/`css()` result class must be
present in the generated stylesheet/Tailwind candidate set; anything else is
"runtime class without CSS" and gets reported.
**Adoption sketch:** `packages/analyze`: after the fold pass, diff collected
class names against the stylesheet's selector set (already available from
`createStylesheet(...).gen.atomic()` / Tailwind candidates); emit
`missing-css` entries with file/line.

### 1c. `panda-plugins/strict-tokens-runtime|scope`, `restrict-styled-props`

**What:** runtime/type-level enforcement scopes for `strictTokens`, prop
restrictions on the styled factory.
**Why not applicable:** pandwind enforces token strictness at typegen time
(generated literal unions) — there is no runtime escape to police, and we
have no styled-JSX factory. Skip.

### 1d. `codemods/styled2panda.ts`, `template-to-object-syntax.ts`

**What:** converts styled-components template literals to panda object syntax.
**Steal:** directly reusable _approach_ for our planned styled-components
migration mode (plan 008 Codemod 3): parse tagged-template literals, convert
nested CSS to flat object keys (kebab → camel), bail on interpolations.
Their fixture suite is a ready-made test corpus shape for
`packages/codemod`.
**Adoption sketch:** port the conversion logic patterns into
`packages/codemod/src/sources/styled.ts`; add their edge-case fixtures under
`tests/fixtures/`.

### 1e. `prettier-plugin`, `define-theme`, `postcss-plugins`

Note-only: prettier plugin for sorted styles pairs with the class-sorter idea
(plan 008 backlog); postcss-plugins show a second bundler-free integration
path if unplugin ever proves insufficient.

---

## 2. tokenami

**What:** CSS-var-first authoring (`padding` → `--padding`,
`--hover_color`, `--md_padding`) — values go inline, a generated stylesheet
owns selectors via "CSS variable toggles", so specificity never grows with
selector complexity. Grid-multiplier spacing. No bundler required: a CLI
generates one variable-driven rule set; ships `@tokenami/unplugin` too.
Dynamic by default: token values flow through props/inline styles safely.

**Steal:**

1. **Var-inline as a third `ClassNameStrategy`.** Our current modes are
   compile-away (tailwind/named-atoms/hash) — none handle truly dynamic
   values without falling back to runtime css(). A tokenami-style strategy
   emits inline `style={{ "--color": value }}` + a small static toggle-rule
   sheet, making _dynamic_ styling safe and collision-free. This is the
   principled answer to "dynamic styles?" (plan 011 parked section) instead
   of runtime css().
   **Sketch:** new strategy `{ name: "var-inline", sheetBacked: true }` where
   `toClassName` returns a stable class + registers an inline-var map;
   `createStylesheet` renders the toggle rules. Needs a design spike on
   condition encoding (`__hover_` prefixes) before committing.
2. **Grid-multiplier spacing preset option** feeding both `tw()` unions and
   css() tokens from one `grid: "4px"` declaration — keeps numeric spacing
   honest and shrinks generated unions.
3. **Named-selectors concept** (config-declared complex selectors like
   `_parentHover`) — fits our conditions map; could backport as preset
   condition presets so users stop hand-writing `&[data-x=y]` strings.
4. **Editor autocomplete UX** ("start typing `bord`…"): our generated
   `types.d.ts` gives this for free inside `tw({...})`; nothing to build —
   but worth documenting explicitly in the README quickstart since it is a
   headline tokenami feature we already match.

**Why parts do not apply:** tokenami's "no bundler" stance conflicts with our
codegen-first architecture (we deliberately want the compiler); adopting
their inline-var model wholesale would abandon literal-union typing — take
the strategy, keep the types.

---

## 3. stylex

**What:** babel-plugin transforms `stylex.create` calls and returns injected
CSS rules through the **transform metadata API**; strict rules about which
values are allowed (statically analyzable only); `eslint-plugin` maintains
an allowlist of valid styles/values to enforce that discipline in editors;
ships atoms, rollup-plugin, unplugin, postcss-plugin, and a devtools
extension.

**Steal:**

1. **Lint-enforced static extraction discipline.** Their eslint-plugin is
   the reference implementation for "keep calls analyzable" linting — the
   exact oxlint rule flagged in our DX ideas (flag unfoldable `cx()`/`css()`
   args). Steal the rule taxonomy: no-dynamic-values, no-spreads,
   no-conditionals-with-dynamic-branches (ours can partially fold, so the
   rule becomes a _warning tier_, not error).
   **Sketch:** oxlint custom rule or a standalone check inside
   `pandwind analyze --ci` reusing the evaluator's NOT_STATIC reasons.
2. **Metadata API pattern for multi-bundler output.** StyleX decouples
   "transform code" from "collect CSS" via returned metadata rather than
   virtual modules. If unplugin adoption hits virtual-module ordering issues,
   this is the alternative architecture: each transform returns
   `{ code, cssRules }`, bundlers concatenate. Keep as plan-B notes for
   worker-unplugin.
3. **devtools-extension** → long-term debug story (matches the parked
   debug-annotations idea in plan 011); not scheduled.
4. **style-value-parser** — a dedicated validated value parser; our adapter
   does implicit validation via real-Tailwind compilation, which is stronger
   proof but slower. Not applicable today; revisit if parity suites get slow.

**Why parts do not apply:** stylex's atomic-collision rules are compile-time
guarantees replacing what our generated conflict map already does better
(we derive it from real Tailwind, not hand-written categories).

---

## 4. panda-css ecosystem

### 4a. `@pandacss/studio` (confirmed, npm latest 1.12.0)

**What:** local visual explorer/dashboard of the whole design system —
tokens, semantic tokens, recipes, patterns, conditions — generated straight
from the config; deployable as a standalone portal.
**Steal:** the roadmap "panda-cloud analytics" idea should start as a
read-only local studio for pandwind: serve the DTCG groups, generated
`@theme`, utility unions, bridge map, and `analyze` results as a browsable
dashboard. Everything it needs already exists as data (preset tokens,
generated types, analyze output).
**Sketch:** `packages/studio` (or `pandwind studio` script): tiny vite dev
server importing the preset + codegen artifacts read-only. Parked until
analyze stabilizes — but the data plumbing is done, which was historically
the hard part.

### 4b. `@pandacss/mcp` (confirmed, npm latest tracks core)

**What:** MCP server exposing the design system to AI assistants.
**Steal:** cheap and high-leverage for us: our generated metadata
(`tw.ts` variants/conflicts/compose, bridge map, token groups, analyze
stats) is exactly what an agent needs to author correct styles. An
`pandwind-mcp` package exposing: list-utilities-per-key, resolve-token,
check-conflicts(cxInputs) → winner, fold-preview(source snippet).
**Sketch:** stdio MCP server over the existing generated artifacts +
`createCx` for live conflict queries; ~small surface, no engine changes.

### 4c. "doctor" / "debug"

**Findings:** no official `panda-doctor` npm package exists (user note was
aspirational); panda "debug" is the ecosystem utility that annotates rendered
elements with the origin of each style. Both map to items already on our
roadmap: doctor ≈ `pandwind analyze --ci` + PR bot (done/in-flight); debug ≈
the parked dev-annotations idea (see stylex devtools above). Nothing new to
build beyond those.

---

## Priority ranking for follow-up

| #   | Item                                 | Effort                 | Value                                    |
| --- | ------------------------------------ | ---------------------- | ---------------------------------------- |
| 1   | analyze missing-CSS warnings (1b)    | S                      | closes the last correctness blind spot   |
| 2   | oxlint static-extraction rules (3.1) | M                      | makes fold coverage a _contract_         |
| 3   | `pandwind-mcp` (4b)                  | S–M                    | unique capability, near-zero engine risk |
| 4   | var-inline strategy (2.1)            | L (design spike first) | solves dynamic styling properly          |
| 5   | @theme var pruning (1a)              | S                      | smaller shipped CSS, documented caveat   |
| 6   | styled-components fixtures port (1d) | S                      | feeds committed codemod roadmap          |
| 7   | studio dashboard (4a)                | L                      | park until analyze matures               |

---

## Follow-up outcomes

### 1b — analyze missing-CSS warnings (done 2026-08-23)

`packages/analyze` now reports statically-known class tokens that resolve to
NO Tailwind candidate ("runtime class without CSS"): for every fully/partially
folded cx() call, string arguments are tokenized (variant prefixes stripped
bracket-aware) and checked against the generated conflict map (whole-key,
utility+value, opacity modifier, `*` fallback). Arbitrary-value brackets pass
by construction; unknown variant prefixes are flagged; tokens with no map
entry land in the new `missingCss` per-file list + `totalMissingCss` summary
field (JSON schema unchanged otherwise), rendered as
`missing-css: ...` lines by the human report.

Escapes: `AnalyzeOptions.missingCssIgnore` for deliberate foreign classes;
the lane self-disables when no conflict map is passed. tw() literals stay out
of scope (typed at call sites). Live run over apps/example reports zero
warnings. Tests: tests/missing-css.test.ts (9 cases).
