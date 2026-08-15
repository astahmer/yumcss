# Plan 003 — Compile-time `cx()` in the vite plugins

## Goal
The vite plugin already statically inlines literal `tw()` calls before Tailwind's
scanner. Extend that idea to literal `cx()` calls: evaluate the merge **at build
time**, so apps whose calls are all-literal can tree-shake the cx runtime away
entirely.

```ts
// input
const cls = cx("px-2", cond && "py-4", css({ color: "$blue-500" }))
// after build (cond === true literal)
const cls = "px-2 py-4 <atom-hash>"
```

## Approach
1. Read `src/vite/inline.ts` (the existing tw inliner) and `src/cx/index.ts`
   (runtime merge semantics) plus the atom registry side of css().
2. New transform pass (same plugin or sibling): detect `cx(...)` calls whose args are
   all statically evaluable (string literals, literal arrays, `false`/`null`/
   `undefined` literals, template literals without expressions, references to consts
   of those — keep the evaluator conservative). Non-static args → leave the call as-is
   (partial handling only if trivially safe: static prefix/suffix folding is allowed
   but optional).
3. The compile-time result MUST be byte-identical to what runtime `cx()` returns for
   the same input — write an equivalence test that runs both and compares.
4. Emitting the css atoms' stylesheet: reuse the `pandwindCssVite` scanner path so
   hashed atoms from folded `css()` args still get their rules (verify with the real
   vite integration harness).
5. Real-vite integration tests (dev transform + build), mirroring
   `tests/vite-integration.test.ts` / `vite-inline.test.ts` patterns.
6. Update SIZE.md note: with all-literal usage the runtime drops out; refresh size
   snapshot only if package-level bytes actually changed.

## Files (territory)
- `src/vite/inline.ts` (+ new file under `src/vite/` if cleaner)
- Do NOT modify `src/cx/index.ts` internals (perf work is another agent's territory);
  import it for evaluation/equivalence testing only.
- tests: `tests/vite-inline.test.ts`, `tests/vite-integration.test.ts`, new
  `tests/vite-cx-inline.test.ts`

## Gates
- Full gate green; equivalence proof test included; integration suite passes against
  a real vite dev server + build.

## jj discipline
Work only inside your workspace dir. Split/describe logical revisions. Never touch
`/Users/astahmer/dev/pandwind`.
