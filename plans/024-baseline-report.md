# Plan 024 baseline — panda website migration run

**Date:** 2026-08-26 · **Target:** `~/dev/panda/website` (158 `.ts/.tsx` files under
`{src,app,theme}`) · **Command (dry-run):**

```bash
node packages/codemod/src/cli.ts swap --from=panda --to=css.class \
  '/Users/astahmer/dev/panda/website/{src,app,theme}/**/*.{ts,tsx}' \
  --out=pandwind --report
```

## Conversion stats

| Metric                                             | Result                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Files scanned                                      | 158                                                                                                                  |
| Files changed                                      | 86                                                                                                                   |
| `css({...})` call sites converted                  | **146 / 154 (94.8%)**                                                                                                |
| `css({...})` flagged with actionable markers       | 8                                                                                                                    |
| `<panda.*>` elements converted (open + close tags) | **86 / 86 (100%)**                                                                                                   |
| `<panda.*>` flagged                                | 0                                                                                                                    |
| Theme recipes emitted as tier-1 modules            | 12 definitions (6 library + 6 local)                                                                                 |
| Tier-0 folded (single-use local cva)               | 1 (`preStyles`)                                                                                                      |
| Pattern modules emitted                            | **9** (`center`, `circle`, `flex`, `grid`, `hstack`, `square`, `stack`, `vstack`, `wrap`)                            |
| Ark-ui slot recipes                                | 2 (`dialogSlotRecipe`, `drawerSlotRecipe`) — residuals, because their source definitions are dynamic anatomy spreads |

## Token handling

- Host theme ingestion recovered **20 token variables** and **4 textStyles**.
- Known tokens emit authored refs (`fg.muted` → `$fg-muted`).
- `textStyle` values expand into their constituent declarations before emission.
- Unknown dotted token paths use a group-aware CSS-var fallback (for example,
  `spacing.unknown` → `var(--spacing-unknown)`, color-like paths →
  `var(--colors-…)`) and produce an `unknown-value` residual.
- Pass 1 can lift the host config using the existing `tokens` subcommand; the
  CSS-var path is only a safety net for values not present in the lifted theme.

## Residual inventory

The CLI now reports residuals by kind:

| Kind            | Count |
| --------------- | ----: |
| dynamic         |    13 |
| unknown-value   |    18 |
| unrepresentable |    10 |

Every residual is retained in the output and receives an actionable
`// pandwind:migrate-skip (<reason>)` marker where the migration cannot safely
rewrite the construct. Remaining `@pandacss/*` imports in this scan belong to
source theme/config or token-inspector code, not silently skipped style sites.

## Emitted output layout

```
<pandwind>/css.ts               createDesignCss + createCx bootstrap
<pandwind>/internal.ts          runtime shorthand canonicalization + DOM/style split
<pandwind>/token.ts             token() shim with group-aware fallback
<pandwind>/recipes/*.ts         tier-1 variant data + generated resolvers (+ index barrel)
<pandwind>/patterns/*.ts        builtin pattern fns (same signatures as styled-system)
<pandwind>/jsx/index.tsx        Stack/HStack/Box… wrappers over pattern modules
```

Call-site imports rewrite 1:1: `@/styled-system/{css,jsx,patterns,recipes,tokens}`
→ `@/<outDir>/{css,jsx,patterns,recipes,token}`. Alias detection prefers
`package.json#imports`, then Next/Vite/components.json/tsconfig declarations.

Existing generated modules are preserved on later runs by default; pass
`--force` when regeneration is intentional. Dry-run does not create output
folders.

## Validation

- `pnpm --dir packages/codemod typecheck` ✓
- `pnpm --dir packages/codemod test` ✓ **129/129 tests**
- Exact website dry-run with `--report` ✓ (stats above)
- Write-validation on `/tmp/panda-website-migrated` ✓; generated `jsx/index.tsx`
  uses `import("react").ElementType`, splits DOM/style props before spreading,
  and emits all nine used builtin pattern modules including `wrap`.
- `--diff` now emits a unified-diff-shaped output for panda migration files.
- The write path now preflights every generated module and rewritten source with
  oxc before writing, refusing invalid output instead of partially corrupting a
  project.
- Full website tsc was not run: the website copy has no installed dependencies;
  the generated output was checked for syntax-critical wrapper/import issues.

## Known intentional residuals

- `defineParts`/ark-ui anatomy-driven slot recipes cannot be reconstructed from
  static style data alone. The codemod emits a resolver module plus an explicit
  marker for the anatomy-dependent portion.
- Custom patterns with a statically available `transform` are serializable into
  dedicated pattern modules; custom patterns without an importable transform are
  reported as residuals rather than guessed.
