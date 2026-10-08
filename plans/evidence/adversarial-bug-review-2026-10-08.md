# Checked adversarial bug review — 2026-10-08

21 independently checked bug groups: 11 P1, 10 P2. No application fixes were made.

Three subagents reviewed runtime/native APIs, compiler/extraction/lint, and migration adapters/CLI. The primary reviewer reran every accepted reproduction and separately reviewed analysis, filesystem writes, token governance, and asynchronous preview sessions. A checked box means **confirmed**, not fixed.

P1 means broken generated programs, unsafe writes, or significant semantic corruption. P2 means a narrower correctness failure or incorrect analysis. These are review priorities, not claims about production incidents.

Initial source revision: `85b110c6`. Report parent: `f3c5eae4`; intervening changes affect five codemod test files, not the implementations cited below. Node `24.20.0`, pnpm `12.3.4`. Concurrent default-workspace changes were preserved; this report lives in the separate `adversarial-review-2026-10-08` JJ workspace.

## Checked issues

### 1. P1 — blocked migration still removes the existing CSS integration

- [x] Independently reproduced through the actual CLI in an isolated temporary project.
- Source: `packages/codemod/src/swap/project-bootstrap.ts:969`, `:1081`; `packages/codemod/src/cli.ts:821`.
- Trigger: UnoCSS → YumCSS, `--safe --no-install`, with an existing UnoCSS Vite plugin and `virtual:uno.css` import but no resolvable UnoCSS configuration.
- Actual: report says `converted=0`, one configuration residual, and no generated files. Nevertheless, it removes `virtual:uno.css`, replaces the UnoCSS plugin, and imports nonexistent `./yumcss/preset.ts`.
- Expected: preserve source CSS/build wiring when configuration prevents migration. The resulting project cannot resolve the inserted preset import.
- Evidence: [CLI bootstrap input](adversarial-review-2026-10-08/cli-bootstrap.source.txt), [output](adversarial-review-2026-10-08/cli-bootstrap.output.txt).

### 2. P1 — multi-file migration resurrects old files and leaves broken imports

- [x] Independently reproduced through the actual CLI in an isolated temporary project.
- Source: `packages/codemod/src/cli.ts:825`–`:839`.
- Trigger: Emotion → Treat; migrate both `styles.ts` and `consumer.ts`, where the consumer imports `./styles` and contains its own Emotion call.
- Actual: `consumer.treat.ts` still imports deleted `./styles`; later shared-file edits recreate `consumer.ts` with its original Emotion call and a rewritten `./styles.treat` import.
- Expected: compose import rewrites with the migrated consumer, then write only the final renamed files. No resurrected source or dangling imports.
- Evidence: [CLI input](adversarial-review-2026-10-08/cli-write.source.txt), [final files](adversarial-review-2026-10-08/cli-write.output.txt).

### 3. P1 — MCP migration writes outside the selected project through symlinks

- [x] Independently reproduced over the official MCP stdio transport; only temporary fixture files were changed.
- Source: `packages/analyze/src/mcp/tools.ts:532`–`:545`, `:803`, `:931`–`:935`.
- Trigger: project-local `Card.tsx` is a symlink to a sibling file outside the project. Call `apply_migration` for `Card.tsx` with `confirm:true`, Emotion → Tailwind.
- Actual: outside file changes from the original Emotion call to `export const cls="[color:red]"`; result reports `applied:true` and project-relative/conflict-safe write evidence.
- Expected: enforce the project boundary against resolved filesystem paths before reading or writing. Lexical `resolve`/`relative` checks do not contain symlink targets.
- Evidence: [MCP transport reproduction](adversarial-review-2026-10-08/mcp-symlink.source.txt), [outside-file before/after](adversarial-review-2026-10-08/mcp-symlink.output.txt).

### 4. P1 — compiler rewrites calls to shadowed bindings

- [x] Independently reproduced through normal TW/CX plugin import discovery and the full CSS extraction plugin.
- Source: `packages/yumcss/src/vite/inline.ts:367`; `cx-call-rewriter.ts:318`; `css-call-rewriter.ts:425`.
- Input examples: `import {tw} from "./tw"; export const f=(tw)=>tw({p:4});`, and equivalent `cx` / `css.class` parameter cases.
- Actual: function bodies become `"p-4"`, `"hello"`, or a generated CSS class. Calls to the caller-provided parameter disappear.
- Expected: preserve calls whose lexical binding is different from the imported API. The caller's supplied function determines the result.
- Evidence: [full plugin reproductions](adversarial-review-2026-10-08/compiler.source.txt), [transformed source](adversarial-review-2026-10-08/compiler.output.txt).

### 5. P1 — CSS extraction ignores mutation of style constants

- [x] Independently reproduced through the full CSS extraction plugin and compared with runtime classes.
- Source: `packages/yumcss/src/vite/css-literal-scope.ts:239`–`:291`.
- Input: `const styles={color:"red"}; styles.color="blue"; export const x=css.class(styles);`.
- Actual: extracted class is the red initializer's `1nmpgqu`; runtime class for the value at the call is blue's `120twt2`.
- Expected: use a proven value at the call, or leave mutable/escaped objects at runtime. `const` protects the binding, not object contents.
- Evidence: [reproduction](adversarial-review-2026-10-08/compiler.source.txt), [red/blue comparison](adversarial-review-2026-10-08/compiler.output.txt).

### 6. P1 — nested selector lists lose their conjunction

- [x] Independently reproduced through the public stylesheet generator.
- Source: `packages/yumcss/src/css/stylesheet-lowering.ts:108`–`:135`.
- Conditions: `_a:"&:hover, &[data-a]"`, `_b:"&:focus, &[data-b]"`. Input: `{_a:{_b:{color:"red"}}}`.
- Actual: selector list is `.class:hover, .class[data-a], .class:focus, .class[data-b]`. Either outer or inner condition alone applies red.
- Expected: four combinations requiring both conditions, e.g. `.class:hover:focus`, `.class:hover[data-b]`, `.class[data-a]:focus`, `.class[data-a][data-b]`.
- Evidence: [generator input](adversarial-review-2026-10-08/compiler.source.txt), [emitted selectors](adversarial-review-2026-10-08/compiler.output.txt).

### 7. P1 — standalone styled-component migration emits invalid syntax

- [x] Independently reproduced and parsed with installed Oxc.
- Source: `packages/codemod/src/swap/host-component-rewriter.ts:1155`–`:1159`.
- Input: `import styled from "styled-components"; export default styled.div({color:"red"});`, styled-components → Tailwind, `Card.tsx`, React framework context.
- Actual: generated `forwardRef(... => <div ... />;` lacks its closing `)`. Reports one conversion and no residuals. Parser reports `Expected ',' or ')' but found ';'`.
- Expected: syntactically valid component declaration ending `/>);`.
- Evidence: [input and parser check](adversarial-review-2026-10-08/codemod.source.txt), [generated source/error](adversarial-review-2026-10-08/codemod.output.txt).

### 8. P1 — Tailwind emission changes literal underscores into spaces

- [x] Independently reproduced and compiled with the installed official Tailwind implementation.
- Source: `packages/codemod/src/swap/adapters/tailwind.adapter.ts:601`–`:603`.
- Input: Emotion `css({fontFamily:"my_font", "--custom":"my_token"})`, target Tailwind.
- Actual: emits `[font-family:my_font] [--custom:my_token]`; Tailwind generates `font-family: my font` and `--custom: my token`. Adapter validation reports lossless despite changed values.
- Expected: preserve literal underscores using the target's escape rules. Validation must account for the actual target compiler's interpretation.
- Evidence: [adapter and official compiler reproduction](adversarial-review-2026-10-08/codemod.source.txt), [emitted CSS and false lossless result](adversarial-review-2026-10-08/codemod.output.txt).

### 9. P1 — dedup hoists dynamic calls out of scope and collides with bindings

- [x] Independently reproduced, including executing the emitted dynamic declaration.
- Source: `packages/codemod/src/swap/index.ts:892`, `:937`–`:955`.
- Input: two functions each call `css.class({color:color})` using their `color` parameter; run the swap with `dedup:true`.
- Actual: both calls are skipped as nonliteral, then dedup nevertheless inserts module-level `const pwStyle1=css.class({color:color})`. Evaluating the result throws `ReferenceError: color is not defined`.
- Additional checked failure: an existing `const pwStyle1` plus two identical literal calls produces duplicate declarations of that name.
- Expected: only hoist proven static, scope-independent expressions and allocate an unused binding. Skipped calls must remain valid.
- Evidence: [dedup reproductions](adversarial-review-2026-10-08/codemod.source.txt), [generated declarations/runtime error](adversarial-review-2026-10-08/codemod.output.txt).

### 10. P1 — target import insertion collides with authored bindings

- [x] Independently reproduced; Node syntax checker rejects the emitted module.
- Source: `packages/codemod/src/swap/adapters/vanilla-extract.adapter.ts:418`–`:419`.
- Input: Emotion source has `const style={display:"block"}` and `css({color:"red"})`; migrate to Vanilla Extract with `file:"a.css.ts"`.
- Actual: inserts `import {style} from "@vanilla-extract/css"` next to the existing `const style`; generated call also uses `style(...)`. One conversion, no residuals. Node reports `Identifier 'style' has already been declared`.
- Expected: allocate an alias and use it consistently, or preserve source with a typed residual.
- Evidence: [input and Node check](adversarial-review-2026-10-08/codemod.source.txt), [redeclaration diagnostic](adversarial-review-2026-10-08/codemod.output.txt).

### 11. P1 — cx removes an earlier important Tailwind declaration

- [x] Independently reproduced using public `createCx` and explicit conflict metadata.
- Source: `packages/yumcss/src/cx/index.ts:309`–`:433`.
- Input: `createCx({conflicts:{bg:{"*":["background-color"]}}})("bg-red! bg-blue")`.
- Actual: `"bg-blue"`; the important red declaration disappears.
- Expected: retain `"bg-red! bg-blue"`, since a later ordinary declaration cannot supersede an important declaration. Docs explicitly say unsupported important modifiers remain strings (`tailwind/migrating-class-strings.mdx:111`–`:112`).
- Evidence: [runtime reproduction](adversarial-review-2026-10-08/runtime.source.txt), [actual result](adversarial-review-2026-10-08/runtime.output.txt).

### 12. P2 — preview session publishes stale results as the current target

- [x] Independently reproduced with the real session implementation and controlled asynchronous evaluation ports.
- Source: `packages/analyze/src/migration-preview/session.ts:82`–`:108`.
- Trigger: start a Tailwind target evaluation, switch to StyleX, complete StyleX first, then complete the old Tailwind evaluation.
- Actual: last emitted snapshot says `target:stylex`, current revision, but contains the Tailwind evaluation. Snapshot metadata is read from mutable session state after the old await.
- Expected: publish only results belonging to the current request/revision; stale results must not update the current session or host.
- Evidence: [deterministic concurrency reproduction](adversarial-review-2026-10-08/session-race.source.txt), [emission sequence](adversarial-review-2026-10-08/session-race.output.txt).

### 13. P2 — token governance recommends removing dynamically used tokens

- [x] Independently reproduced using public governance and prune-changeset APIs.
- Source: `packages/analyze/src/governance/usage-collector.ts:265`–`:271`; `reachability.ts:44`–`:56`; `prune-changeset.ts:27`–`:45`.
- Input: token `colors.brand:"red"`; `const color=active ? "$brand" : "blue"; css({color:color});`.
- Actual: summary records one dynamic-expression boundary, but `colors::brand` is `safe-to-remove`; generated prune changeset recommends deleting it with the claim of zero reachable usage/no boundaries.
- Root cause: collector records dynamic hits as filenames; reachability tests them against token ids/names/`*`, so the unscoped uncertainty is ignored.
- Expected: review-required status when dynamic usage cannot be resolved. The token can be used by this valid source program.
- Evidence: [input](adversarial-review-2026-10-08/governance.source.txt), [report and unsafe recommendation](adversarial-review-2026-10-08/governance.output.txt).

### 14. P2 — shared runtime sheets replace another namespace's dynamic rules

- [x] Independently reproduced without DOM assumptions, through public runtime APIs.
- Source: `packages/yumcss/src/css/runtime-stylesheet.ts:335`; `runtime-sheet-policies.ts:38`–`:45`.
- Trigger: two `createRuntimeCss(defaultPreset,{sheet,namespace})` instances, namespaces `first` and `second`; call each one's `vars({color:...})`.
- Actual: the second rule replaces `.first-color` with `.second-color`. The earlier carrier still references `first-color` and loses its stylesheet rule.
- Expected: namespace-distinct rules coexist. Stored rule identity currently includes only the ordered property key.
- Evidence: [shared-sheet input](adversarial-review-2026-10-08/runtime.source.txt), [before/after CSS](adversarial-review-2026-10-08/runtime.output.txt).

### 15. P2 — a second tokenful preset erases the first preset's token variables

- [x] Independently reproduced through public preset/runtime APIs with disjoint token names.
- Source: `packages/yumcss/src/css/runtime.ts:155`–`:159`; `runtime-sheet.ts:266`–`:272`.
- Trigger: two tokenful presets share an explicit runtime sheet; first declares `$a:red`, second `$b:blue`; call both instances' `class` methods.
- Actual: root prelude ends with only the blue variable, while the earlier red atom remains and references its now-absent variable.
- Expected: retain disjoint variables, or explicitly reject unsupported sheet composition before invalidating existing styles.
- Evidence: [two-preset input](adversarial-review-2026-10-08/runtime.source.txt), [orphaned variable reference](adversarial-review-2026-10-08/runtime.output.txt).

### 16. P2 — cx does not merge utilities with multiple variants

- [x] Independently reproduced with explicit generated-style conflict metadata.
- Source: `packages/yumcss/src/cx/index.ts:145`–`:154`.
- Input: `"hover:focus:bg-red hover:focus:bg-blue"` with `bg` background-color conflict metadata.
- Actual: both tokens survive. `splitVariants` stops at the first colon and treats `focus:bg-red` as the utility name.
- Expected: last-wins merge yields `"hover:focus:bg-blue"`. Identical variant order avoids any question about variant commutativity.
- Evidence: [input](adversarial-review-2026-10-08/runtime.source.txt), [actual result](adversarial-review-2026-10-08/runtime.output.txt).

### 17. P2 — selector substitution rewrites literal ampersands in attributes

- [x] Independently reproduced through the public stylesheet generator.
- Source: `packages/yumcss/src/css/stylesheet-lowering.ts:118`–`:119`.
- Condition: `& > [data-text="A&B"]`.
- Actual: class substitution changes the attribute value to `A.classB` (including the emitted escaped class spelling).
- Expected: replace only the nesting selector; preserve quoted `A&B` exactly.
- Evidence: [generator input](adversarial-review-2026-10-08/compiler.source.txt), [emitted selector](adversarial-review-2026-10-08/compiler.output.txt).

### 18. P2 — two generated tw imports use only the first module's configuration

- [x] Independently reproduced through normal plugin discovery/resolution.
- Source: `packages/yumcss/src/vite/index.ts:435`–`:457`.
- Trigger: import `tw as a` and `tw as b` from two generated modules. Their `p:4` value-token mappings are respectively `small` and `large`.
- Actual: `a({p:4})` and `b({p:4})` both compile to `"p-small"`.
- Expected: `"p-small"` and `"p-large"`; retain each binding's owning configuration.
- Evidence: [generated module fixtures and transform](adversarial-review-2026-10-08/compiler.source.txt), [incorrect shared mapping](adversarial-review-2026-10-08/compiler.output.txt).

### 19. P2 — lint treats a block-local function as imported YumCSS cx

- [x] Independently reproduced with the current plugin implementation and parsed AST; parameter-shadowing controls produce no findings.
- Source: `packages/lint-plugin/src/index.ts:583`–`:633`.
- Input: `import {cx} from "yumcss"; {const cx=v=>v+"changed"; cx("hello");}`.
- Actual: `no-redundant-cx` claims the call returns its single string unchanged; this local function returns `"hellochanged"`.
- Expected: resolve the actual lexical binding and ignore unrelated local functions. This reproduction shows a false diagnostic, **not** a destructive automatic fix.
- Evidence: [lint harness and controls](adversarial-review-2026-10-08/lint.source.txt), [diagnostics](adversarial-review-2026-10-08/lint.output.txt).

### 20. P2 — Solid Stack freezes reactive props

- [x] Independently confirmed in the T3 collaborative browser using installed Solid browser code and public `yumcss/stack/solid`.
- Source: `packages/yumcss/src/stack/solid.tsx:37`–`:48`.
- Trigger: reactive getters for `gap`, `class`, and `title`; update signals from `4/before/before title` to `8/after/after title`.
- Actual: DOM remains `<div title="before title" class="flex gap-4 before">Stack repro</div>` after updates.
- Expected: `class="flex gap-8 after"`, `title="after title"`. The component copies getter values and calculates class/attributes eagerly, outside reactive accessors.
- Evidence: [browser fixture](adversarial-review-2026-10-08/solid-solid.mjs.txt), [before/after evidence](adversarial-review-2026-10-08/solid-solid-evidence.json.txt).

### 21. P2 — native object backends reject property-first conditions

- [x] Independently reproduced with both React Native and OpenTUI public backend factories.
- Source: `packages/yumcss/src/backends/object-engine.ts:100`–`:103`.
- Trigger: configure `hover:()=>true`; resolve `{_hover:{color:"red"}}` and `{color:{_hover:"red"}}`.
- Actual: condition-first returns `{color:"red"}`; property-first throws unsupported condition `"_color"` in both backends.
- Expected: equivalent results. Both forms are documented in `docs/src/content/docs/css/conditions.mdx:26`–`:34`, and backend input is `StyleObject`.
- Evidence: [native backend reproduction](adversarial-review-2026-10-08/native.source.txt), [results](adversarial-review-2026-10-08/native.output.txt).

## Validation and limits

- 433 existing focused tests passed; one existing governance inline snapshot failed. Suites: analyze preview/MCP (23), governance (13 pass / 1 fail), runtime/cx (53), compiler/stylesheet/Stack (142), codemod/CLI (202).
- Governance failure: `packages/analyze/src/governance/service.test.ts:35` expects source offsets two characters later than actual. Recorded separately; it does not prove any of the checked behavior bugs.
- Ten executable reproduction groups were rerun by the primary reviewer and archived above. Expected-bug assertions passing prove current faulty behavior; they do not indicate repaired behavior. Full outputs include actual emitted source/CSS and independent parser/compiler/runtime checks.
- Solid reactivity was independently checked in a real browser. Playground `/basics` also loaded, and changing Tone to `danger` produced `Delete` with `bg-red-500`. This is a narrow smoke check, not comprehensive UI acceptance. T3 screenshots failed; browser JavaScript inspection remained available.
- No exhaustive route matrix, full repository gates, production deployment, or complete framework/browser matrix was run. Large generated preset catalogs and every ecosystem adapter were not exhaustively reviewed. No bug-free claim follows from this review.
- Historical nested-array traversal, implicit SSR sheet sharing, default sheet identity collisions, tokenless-preset erasure, and native cache alias/type collisions appeared repaired and were excluded. TW temporal-dead-zone folding was also excluded from the checked list because its demonstrated input already throws before transformation.
- Only documentation and captured diagnostic evidence were added. No compiler/runtime/codemod fixes, dependency changes, snapshot updates, or generated product artifacts were made.

## Reproduction artifacts

Each `.source.txt` preserves the runnable diagnostic source; corresponding `.output.txt` records its exact command, exit code, and output. Restore it to a temporary file with its original `.mjs`/`.ts` extension, then run the command shown in the output header. These are workstation reproductions: paths refer to `/Users/astahmer/dev/pandwind` and existing `/tmp` fixture setup. For the primary-reviewer scripts using bare imports, expose the workspace packages under a temporary `node_modules` using symlinks; all implementation access is through declared package exports.

The lint harness intentionally loads the exact current package source instead of potentially stale built output. CLI harnesses run from the owning codemod package. The Solid fixture requires bundling with browser conditions and serving its generated JavaScript, as used for the browser proof. Temporary servers were stopped after verification.
