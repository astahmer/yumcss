# Checked adversarial bug review — 2026-10-08

21 independently checked bug groups: 11 P1, 10 P2. This document preserves the original review evidence. See the [fix resolution ledger](adversarial-fixes-2026-10-08.md) for subsequent implementation and validation.

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

- At initial review capture, 433 focused tests passed and one governance inline snapshot failed. Suites: analyze preview/MCP (23), governance (13 pass / 1 fail), runtime/cx (53), compiler/stylesheet/Stack (142), codemod/CLI (202).
- The initial governance snapshot mismatch at `packages/analyze/src/governance/service.test.ts:35` has since been resolved; the focused test passes in the current workspace.
- Ten executable reproduction groups were rerun by the primary reviewer and archived above. Expected-bug assertions passing prove current faulty behavior; they do not indicate repaired behavior. Full outputs include actual emitted source/CSS and independent parser/compiler/runtime checks.
- Solid reactivity was independently checked in a real browser. Playground `/basics` also loaded, and changing Tone to `danger` produced `Delete` with `bg-red-500`. This is a narrow smoke check, not comprehensive UI acceptance. T3 screenshots failed; browser JavaScript inspection remained available.
- No exhaustive route matrix, full repository gates, production deployment, or complete framework/browser matrix was run. Large generated preset catalogs and every ecosystem adapter were not exhaustively reviewed. No bug-free claim follows from this review.
- Historical nested-array traversal, implicit SSR sheet sharing, default sheet identity collisions, tokenless-preset erasure, and native cache alias/type collisions appeared repaired and were excluded. TW temporal-dead-zone folding was also excluded from the checked list because its demonstrated input already throws before transformation.
- At initial review capture, only documentation and diagnostic evidence had been added. The subsequent fixes and their verification are tracked in `adversarial-fixes-2026-10-08.md`.

## Reproduction artifacts

Each `.source.txt` preserves the runnable diagnostic source; corresponding `.output.txt` records its exact command, exit code, and output. Restore it to a temporary file with its original `.mjs`/`.ts` extension, then run the command shown in the output header. These are workstation reproductions: paths refer to `/Users/astahmer/dev/pandwind` and existing `/tmp` fixture setup. For the primary-reviewer scripts using bare imports, expose the workspace packages under a temporary `node_modules` using symlinks; all implementation access is through declared package exports.

The lint harness intentionally loads the exact current package source instead of potentially stale built output. CLI harnesses run from the owning codemod package. The Solid fixture requires bundling with browser conditions and serving its generated JavaScript, as used for the browser proof. Temporary servers were stopped after verification.

## Follow-up issues checked during fixes

These additional issues were independently reproduced while implementing the original 21 fixes. Each now has focused regression coverage; current status and broader validation are recorded in `adversarial-fixes-2026-10-08.md`.

### 22. P1 — adapter cleanup removes a still-used Emotion `css` import

- Reproduction: Emotion → Treat with `export const original = css` beside a converted `css(...)` call.
- Actual: the source import was removed while the exported value still referenced `css`.
- Regression: `packages/codemod/tests/adversarial-migration-regressions.test.ts`, “source import cleanup preserves a live unaliased binding”.

### 23. P2 — dedup does not recognize route-owned target calls

- Reproduction: repeat one target style through a registered adapter or the project's generated `tw.ts` module with `--dedup`.
- Actual: the adapter route skipped dedup, while the flat path did not reliably associate emitted calls with the generated module.
- Regression: the adversarial codemod suite exercises CLI adapter dedup and metadata-backed flat migration dedup.

### 24. P1 — aliased module-change paths can plan two writes to one file

- Reproduction: compose conflicting changes for `src/consumer.ts` and `src/./consumer.ts`.
- Actual: lexical aliases were treated as separate changes even though both resolve to the same file.
- Regression: the adversarial codemod suite checks conflict rejection and identical-content deduplication after normalization.

### 25. P1 — CLI output paths can escape through an in-project symlink

- Reproduction: host conversion targets an output path whose parent symlink points outside the selected project.
- Actual: lexical path validation alone allowed the output path to reach the outside sentinel.
- Regression: the CLI symlink test verifies rejection and an unchanged outside sentinel; project-path tests also cover internal, escaping, and dangling symlinks.

### 26. P2 — Emotion aliases with Unicode identifiers are skipped

- Reproduction: import `css as 样式` from `@emotion/css` and call `样式(...)`.
- Actual: migration left the call untouched without a residual because the alias boundary check used ASCII word semantics.
- Regression: the adversarial codemod suite checks the AST-resolved Unicode alias conversion.

### 27. P1 — one-line flat migration mistakes a `tw()` call for an import

- Reproduction: convert a one-line `css.class(...)` module to `tw` with a generated project module configured.
- Actual: the import check scanned the entire import line and saw the later emitted `tw()` call, leaving the call unbound.
- Regression: metadata-backed flat migration checks the generated import; an additional case verifies reuse of an existing aliased generated import.

### 28. P1 — absolute CLI patterns break when macOS resolves `/var` through `/private/var`

- Reproduction: run the CLI with a temporary project root and an absolute file pattern on macOS.
- Actual: glob output and the real project root used different canonical path spellings, so relative-path slicing produced an empty path and external auto-detection failed.
- Regression: the full codemod swap suite checks absolute-path conversion and external-source auto-detection; project-path tests check canonical path mapping and root replacement.

### 29. P2 — flat dedup regresses source calls and can claim foreign `tw` imports

- Reproduction: dedup repeated `css.class(...)` calls that remain after a conservative skip, then pass a repeated `tw(...)` call imported from an unrelated module.
- Actual: only target calls were considered, so retained source calls were missed; broadening by local name would incorrectly merge foreign calls.
- Regression: codemod swap tests check retained-source dedup, foreign-import preservation, and import placement.

### 30. P1 — import cleanup drops or mangles live Unicode and dollar-sign bindings

- Reproduction: retain a live Emotion import alias named 样式, $css, or css$ beside a converted style call.
- Actual: ASCII word-boundary matching treated valid JavaScript identifiers as unused; css$ could also be rewritten to an invalid Emotion export name.
- Regression: the codemod adversarial suite checks a live Unicode alias and both dollar-sign boundary positions.

### 31. P1 — import-shaped string literals are deleted during source import cleanup

- Reproduction: convert an Emotion style call in a module containing a string literal with import-shaped text.
- Actual: raw text matching mistook the string contents for an import declaration and replaced the string with an empty string.
- Regression: the codemod adversarial suite preserves the string through Emotion to Tailwind; direct named-import cleanup checks cover the other pruning paths.

### 32. P1 — live imports used in template expressions are removed

- Reproduction: keep an imported css binding in an untagged template expression while converting another Emotion style call.
- Actual: the scanner excludes the entire template literal, including executable interpolation, so cleanup removed the import and left an unbound reference.
- Regression: the codemod adversarial suite requires both the Emotion import and the interpolation to remain.

### 33. P1 — physical symlink aliases bypass file-change conflict detection

- Reproduction: plan two different edits to one file using its real path and an in-project symlink alias.
- Actual: lexical planning treated them as separate paths, then the CLI resolved both writes to one destination and let the later content win.
- Regression: the project-path suite canonicalizes both aliases, merges identical edits, and rejects conflicting content.

## Additional issues independently checked during the fix pass

These were reproduced against the isolated fixes workspace, then checked again with targeted regressions.

### 34. P2 — escaped JavaScript identifiers are missed by Emotion call matching

- Reproduction: import and call an Emotion binding through a Unicode escape in its identifier spelling.
- Actual: the adapter parsed the import but skipped the call or removed its still-live binding.
- Regression: `packages/codemod/tests/adversarial-migration-regressions.test.ts` checks conversion and retained binding.

### 35. P1 — residual JSX can lose its component provider import

- Reproduction: keep a JSX component reference in a residual migration while converting a separate style call.
- Actual: import cleanup pruned the provider even though the retained JSX still needed it.
- Regression: the codemod adversarial suite checks the residual source and provider import together.

### 36. P1 — selector comments can move generated rules outside their scope

- Reproduction: place `&` inside a comment in a selector-list branch.
- Actual: comment text affected parent-selector detection, leaving a generated rule unscoped.
- Regression: `packages/yumcss/tests/adversarial-compiler-regressions.test.ts` checks emitted selector scope.

### 37. P1 — nested destructuring and loop writes can leave stale extracted CSS

- Reproduction: mutate a nested style value through a destructuring assignment or a `for…in/of` target after declaration.
- Actual: the extractor still treated the object as immutable and inlined its old value.
- Regression: compiler adversarial cases verify that these calls stay on the runtime path.

### 38. P2 — safe immutable spreads lose extraction

- Reproduction: spread a statically known immutable style object into an extractable carrier.
- Actual: an escape-analysis guard blocked folding even though the spread value was scalar and immutable.
- Regression: compiler adversarial and Vite CSS tests cover safe spreads alongside mutable nested aliases.

### 39. P1 — runtime token-conflict recovery can corrupt pending styles

- Reproduction: compile a call that conflicts with the token manifest after an earlier style has been queued, then retry with corrected tokens.
- Actual: rollback could discard prior pending style state or retain declarations from the failing call.
- Regression: `packages/yumcss/tests/runtime-sheet.test.ts` checks the queued rule and retry result.

### 40. P1 — duplicate runtime module instances disagree about token-manifest registration

- Reproduction: register or reuse token manifests through multiple runtime module instances.
- Actual: equivalent runtime state was treated as missing or conflicting across module copies.
- Regression: runtime-sheet tests cover module-instance registration and token reuse.

### 41. P2 — lint reports shadowed `css.keyframes` as a YumCSS call

- Reproduction: define a local `css` binding that shadows the imported API and call its `keyframes` member.
- Actual: the lint rule emitted a YumCSS diagnostic for the unrelated local function.
- Regression: `packages/lint-plugin/tests/index.test.ts` checks the shadowed call and the imported control case.

### 42. P2 — governance misclassifies exponent-form numeric literals

- Reproduction: use a numeric literal such as `1E3` in a token expression.
- Actual: the scanner classified valid numeric syntax as dynamic usage.
- Regression: governance usage-collector tests cover exponent-form numbers.

### 43. P1 — MCP writes through hard links into files outside the project

- Reproduction: link a project source file to an outside path, then apply a migration that rewrites the source in place.
- Actual: truncating the project path also changed the outside file.
- Regression: `packages/analyze/src/mcp/project-path.test.ts` requires rejection with both links unchanged.

### 44. P2 — lint treats a class-expression self-name as an imported API

- Reproduction: use an imported carrier name as the self-name of an unrelated class expression.
- Actual: the scope resolver attributed the expression to the YumCSS import and reported a false positive.
- Regression: lint tests cover class-expression self-name shadowing and the imported control case.

### 45. P1 — empty runtime styles can claim a conflicting token manifest

- Reproduction: invoke an empty or no-op style call with a different token manifest after a valid style call.
- Actual: the empty call registered a token conflict despite adding no declarations.
- Regression: runtime-sheet tests check no-op calls and token reuse after a real cached style call.

### 46. P1 — denied source removal can leave an MCP migration partially applied

- Reproduction: on macOS, deny removal of the source through an ACL while applying a migration that writes outputs.
- Actual: failure during source cleanup could leave earlier project writes in place.
- Regression: `packages/analyze/src/mcp/project-path.test.ts` verifies source and outputs roll back after the denied removal.

### 47. P1 — a later generated-file failure can leave earlier MCP writes in place

- Reproduction: plan multiple outputs where a later destination cannot be written.
- Actual: the source rewrite and earlier generated output could be committed before the failure.
- Regression: MCP project-path tests preflight all destinations and assert no source or output changes.

### 48. P1 — import cleanup drops explicit module side effects

- Reproduction: remove the last named import from a module that has evaluation side effects.
- Actual: cleanup removed the whole declaration instead of preserving `import "module"`.
- Regression: codemod adversarial tests assert side-effect-only imports survive direct and CLI cleanup.

### 49. P2 — lint resolves `for…of/in` right-hand expressions in the wrong scope

- Reproduction: iterate over an imported YumCSS carrier, then shadow that name in the loop binding.
- Actual: the rule used the loop scope for the right-hand expression and missed the imported call.
- Regression: lint tests cover both `for…of` and `for…in` right-hand expressions.

### 50. P2 — static-block `var` declarations incorrectly shadow an enclosing function

- Reproduction: declare `var tw` inside a class static block, then call the imported `tw` later in the enclosing function.
- Actual: the resolver hoisted the class-local name across the function and suppressed the diagnostic.
- Regression: lint tests cover the static-block case and the imported control call.

### 51. P1 — comments containing `}` can hide dynamic token usage

- Reproduction: put `}` inside a comment before a dynamic style expression that uses a token.
- Actual: the scanner's brace matching ended the call early and allowed a false safe-to-remove recommendation.
- Regression: governance collector and service tests cover `/* } */` and require a review boundary.

### 52. P1 — nested object-property aliases can freeze stale extracted CSS

- Reproduction: store a style object member in another object, mutate the member, then pass the original object to `css.class`.
- Actual: extraction missed the escaped alias and emitted the pre-mutation value.
- Regression: the compiler adversarial suite checks runtime preservation and no extraction.

### 53. P1 — runtime selector lists turn a bare type branch into a pseudo selector

- Reproduction: serialize `button, &:focus` through the semantic runtime sheet.
- Actual: runtime output attached `button` as a pseudo to the generated class, while compiler lowering emitted a descendant selector.
- Regression: runtime-sheet tests compare both selector branches with compiler lowering.

### 54. P1 — codemod CLI writes through hard-linked project files

- Reproduction: make a source, generated destination, or planned config change share an inode with an outside file.
- Actual: direct writes could modify the outside link.
- Regression: codemod path tests require preflight rejection and unchanged linked files.

### 55. P2 — Unicode JSX escapes can crash lazy Oxc AST consumers

- Reproduction: migrate JSX containing a Unicode escape through the full pipeline or import-cleanup helpers.
- Actual: a deferred AST field threw instead of returning unchanged source with a parse residual.
- Regression: source-pass and codemod adversarial tests cover full migration, direct import cleanup, and marker extraction.

### 56. P1 — extension-changing MCP migration loses regular-file metadata

- Reproduction: migrate a `.ts` file with mode `0640` and an extended attribute to a new extension.
- Actual: writing a fresh destination lost the source mode and xattr.
- Regression: MCP project-path tests check mode and, on macOS, xattr preservation.

### 57. P1 — extension-changing MCP migration loses metadata on hard-linked sources

- Reproduction: migrate a hard-linked `.ts` file whose outside link has a nondefault mode and xattr.
- Actual: the new output lost metadata even though the outside link content stayed intact.
- Regression: MCP project-path tests now require rejection before mutation and unchanged source/outside-link metadata.

### 58. P1 — parser failures do not block governance pruning

- Reproduction: add malformed source that contains a token reference after the parse error.
- Actual: the unscanned boundary was not promoted into reachability, so pruning still marked the candidate safe.
- Regression: governance service tests assert review-required status and no prune changeset.

### 59. P1 — nonliteral and later `css()` arguments can hide token use from pruning

- Reproduction: pass a style variable as the first argument or put a token-bearing object in a later style argument.
- Actual: usage collection inspected only the first object argument and could mark the token safe to remove.
- Regression: governance service tests require a dynamic boundary and capture later literal-object usage.

### 60. P2 — immutable scalar member reads are over-conservatively kept at runtime

- Reproduction: read a scalar from an immutable module constant into a local style object, then pass that object to `css.class`.
- Actual: escape analysis dropped the module constant and skipped valid extraction.
- Regression: compiler adversarial tests require extraction for this scalar-read path while the nested mutable-alias case remains runtime-only.

### 61. P1 — Oxlint traverses Oxc parent cycles until it exhausts memory

- Reproduction: run the repository Oxlint configuration on YumCSS source with the plugin rules that walk Oxc nodes.
- Actual: AST traversal followed each node's `parent` back-reference and repeatedly walked the surrounding tree; Oxlint exhausted the Node heap even on a single source file.
- Regression: the shared Oxc walkers now skip `parent` links, visit each object once, and a parent-linked AST fixture asserts bounded traversal. The rebuilt plugin completes on the triggering file and the full lint gate reaches ordinary diagnostics without OOM.

### 62. P1 — `dss.raw()` returns a style object that crashes React DOM

- Reproduction: pass `dss.raw(header)` to a React `style` prop in the Showcase app.
- Actual: React 19 calls `styles.hasOwnProperty` and throws because the returned object has a null prototype; the page renders an empty root.
- Regression: raw styles now return an ordinary object; the design test asserts its prototype and the fresh Showcase browser test checks all computed styles and zero page errors.

### 63. P2 — Showcase passes nested conditions to a React inline `style` prop

- Reproduction: pass `dss.raw(status)` to React after making the outer style object ordinary.
- Actual: `_dark` remains a nested object and React throws `Cannot convert object to primitive value` while applying CSS values.
- Regression: the web target passes the shared base status only; native and TUI retain their condition-aware status paths.

### 64. P2 — Showcase sends OpenTUI a CSS border radius it deliberately rejects

- Reproduction: run Showcase's headless TUI parity test with the shared header or body style.
- Actual: `corners` lowers to `borderRadius`, which the OpenTUI backend rejects; the TUI example crashes before rendering.
- Regression: shared base styles exclude radii, web/native apply explicit radius extensions, and the Showcase test passes both browser and TUI targets.

### 65. P1 — JSX-emitting migrations keep TypeScript `.ts` output paths

- Reproduction: migrate Vue-styled `Card.ts` to Tamagui. The target emits JSX but reports no output extension, so the CLI writes JSX back to `.ts`; import cleanup then fails to parse the generated output and leaves a duplicate `styled` binding.
- Actual: the output contains JSX in a `.ts` file and both `vue-styled-components` and `@tamagui/core` bind `styled`.
- Regression: a route-level migration assertion requires `.tsx`, valid JSX output, no stale source binding, and preservation of the source module's evaluation.

### 66. P2 — generated CSS bindings collide with TypeScript-only `css` declarations

- Reproduction: migrate a styled component in a TypeScript file that declares `type css = string`.
- Actual: binding selection avoided the type name, but cleanup's text-based check missed it and renamed the generated binding back to `css`, creating a type/value name conflict.
- Regression: the codemod adversarial suite requires the declaration to remain intact and generated styles to keep a separate target binding.

### 67. P1 — adapters emit TypeScript-only syntax into JavaScript outputs

- Reproduction: migrate JSS into `styles.js` or a plain Vue `<script setup>` block, or migrate a Vue styled component without `lang="ts"`.
- Actual: JSS emitted `button!.classList` and Vue emitted a `Record<string, any>` annotation. The target parser rejected each file, so conservative import cleanup retained dead source bindings.
- Regression: `external-adapters.test.ts` parses generated `.js`, `.ts`, and `.vue` files with their language adapters, checks JSS binding removal, and checks Vue side-effect import preservation.

### 68. P2 — source scanner leaks an internal AST identity through its public exports

- Reproduction: compare `yumcss/source` runtime exports with the maintained public API contract.
- Actual: the source scanner re-exported `NodeKind` even though that value belongs to the existing `yumcss/tw/literal` subpath, and the exact export test failed. Codemod and Analyze also imported it through the accidental export.
- Regression: the public API type test remains exact, while internal consumers import `NodeKind` from `yumcss/tw/literal`.

## Additional issues independently confirmed after branch unification

Twelve additional defects were reproduced against the unified fixes workspace and then covered by focused regressions.

### 69. P1 — governance misses aliased and namespace CSS calls, allowing used-token pruning

- Reproduction: import `css as makeStyle` or `* as styles` from a CSS facade and use `$colors.brand` in a call.
- Actual: governance collected no usage, classified the used token as safe to remove, and could emit a prune changeset.
- Regression: Analyze usage and service suites require both import forms to count while an alias shadowed by a function parameter remains ignored.

### 70. P1 — qualified token references in exported objects miss their public boundary

- Reproduction: export `{ color: "$colors.brand" }` when another group also defines `brand`.
- Actual: the scanner returned `colors.brand`, but service lookup treated it as a bare token name and recorded no boundary.
- Regression: governance service coverage requires the exact `colors::brand` boundary while the other group remains safe to remove.

### 71. P1 — a brace inside an exported string hides later token references

- Reproduction: export `{ note: "}", color: "$colors.brand" }`.
- Actual: source-text brace balancing stopped at the string's `}` and returned no public-export hit, allowing unsafe removal.
- Regression: public-export scanner and service tests require the later reference to remain review-required; scanning now uses the shared AST service.

### 72. P2 — Analyze counts a shadowed imported `cx` alias as fully folded

- Reproduction: import `cx as classNames`, then call a parameter named `classNames` from a local function.
- Actual: Analyze reported a full fold while `inlineCxCalls` left the call unchanged.
- Regression: the Analyze test compares the report to the real pass and excludes the shadowed call from CX totals.

### 73. P1 — CLI can partially apply migrations when an output path collides with a generated artifact

- Reproduction: migrate Emotion files where one result outputs `Card.styles.treat.ts` and another generates that same path.
- Actual: the CLI wrote one result and removed its source before a later generated-file conflict stopped the run.
- Regression: the CLI e2e test requires preflight rejection with both sources unchanged and no generated destination.

### 74. P2 — CSS extraction can erase a switch-case temporal-dead-zone error

- Reproduction: declare `const style` in one switch case, then read it in another case's `css.class(style)` call.
- Actual: source-order constant evaluation folded the call even though the original inactive case throws `ReferenceError`.
- Regression: Vite CSS test executes both source and transformed code and requires the same TDZ error; switch cases now remain conservatively dynamic.

### 75. P1 — CLI overwrites source edits made while adapter migration is running

- Reproduction: pause an Emotion-to-Treat adapter run after the CLI reads `Card.tsx`, replace the file with a user edit, then resume the adapter.
- Actual: the CLI wrote output derived from the stale snapshot over the newer edit and reported success.
- Regression: the CLI e2e test gates the migration use case, edits the file during the await, and requires the CLI to reject the stale plan while preserving the edit.

### 76. P2 — source scanner treats matching strings anywhere in a module as directives

- Reproduction: place `"use client"` in a comment, ordinary string, or expression after a declaration.
- Actual: the scanner marked the module client-bound even though none of those strings are in the directive prologue.
- Regression: scanner coverage distinguishes exact leading directives from comments, values, and later expression statements.

### 77. P2 — failed source-scanner plugin registration leaves adapters behind

- Reproduction: register a plugin containing one new adapter followed by an adapter ID already in the registry.
- Actual: registration throws at the duplicate, but the earlier adapter stays registered while the plugin is absent.
- Regression: scanner coverage requires adapter and plugin registries to remain unchanged after a failed registration.

### 78. P2 — MCP validation scripts can mutate the source dependency tree

- Reproduction: run a package validation script that writes `node_modules/.cache/mcp-marker` in a copied project.
- Actual: the validation workspace symlinked the original `node_modules`; the script passed and changed the original marker from `original` to `changed`.
- Regression: `packages/analyze/src/mcp/node-validation.test.ts` runs a script that writes both a cache file and a file through an absolute dependency symlink, then requires the originals to remain unchanged.

### 79. P2 — colliding semantic-rule hashes discard distinct runtime CSS

- Reproduction: register `.ciz7p9zt61{color:red}` and `.c45hnhaukb{color:red}` as semantic rules.
- Actual: both rules canonicalized to `semantic-1a35qq`, so the runtime store retained only the second rule.
- Regression: `packages/yumcss/tests/runtime-sheet.test.ts` requires both rules to remain in the snapshot and emitted CSS.

### 80. P2 — empty CSS custom-property values are rejected by runtime validation

- Reproduction: register a global `:root` semantic rule with `{ property: "--empty", value: "" }`.
- Actual: the validator rejected the declaration and dropped the rule; no CSS was emitted.
- Contract: the [W3C CSS Custom Properties Level 1 specification](https://www.w3.org/TR/css-variables-1/#defining-variables) makes `<declaration-value>` optional and explicitly allows an empty custom-property value.
- Regression: `packages/yumcss/tests/runtime-sheet.test.ts` requires `:root{--empty:}` to remain in the sheet, parses it with PostCSS, and confirms empty values on ordinary properties remain rejected.
