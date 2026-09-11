# Effect website migration corpus

This is a reproducible acceptance corpus for Pandwind’s static-first
migration APIs. The upstream repository is deliberately not copied into JJ:
it is an external, read-only reference. Pandwind records its immutable commit
in [`reference-repos.md`](../../reference-repos.md), and the runner verifies
the reference HEAD before reporting results.

## Lanes

| Lane                | Pandwind API  | Proof                              |
| ------------------- | ------------- | ---------------------------------- |
| Tailwind-compatible | `tw({...})`   | [`tw.md`](./tw.md)                 |
| Static CSS          | `css({...})`  | [`css.md`](./css.md)               |
| Design CSS          | `dss({...})` | [`design-css.md`](./design-css.md) |

Each lane is generated from the same pinned source and disposable copy. The
runner uses the shared source scanner, preserves unsupported source tokens as
residuals, and never drops a style silently. The Tailwind lane adds an
explicit `@source not inline("shadow blur")` guard because generated semantic
object keys would otherwise be mistaken for authored utilities by Tailwind;
this keeps the compiler vocabulary equivalent to the baseline.

Astro component-local selectors are also preserved as residuals when a
rewritten class is referenced by the same file's `<style>` block. This prevents
Astro's scoped-CSS tree shaking from removing a rule that remains semantically
required after the class rewrite.

## Verified result

The final four-way run used freshly regenerated and freshly built copies:

- reference: `366419b44eb2bd353cbe3d3e41fa4e8c735e63ee`
- routes checked over HTTP: 436 per lane
- CSS bytes: baseline and every lane `2,840,140`
- linked CSS files: exact SHA-256 match for every file in every lane
- inline CSS: equal byte length for every generated route in every lane
- visual browser states: desktop and mobile for `/`, `/blog/`, one v3 docs
  page, one v4 docs page, `/effect-days/`, and `/community-hub/`
- SSR: JavaScript-disabled snapshots for every visual route
- browser failures: none introduced
- result: `pass: true`

The verifier deliberately distinguishes product parity from asset filename
parity: Astro/Vite may hash JavaScript assets differently after a source
rewrite, while route behavior, CSS artifacts, SSR state, and rendered pixels
remain the contract being tested.

## One command

After building the baseline and three lanes, run:

```sh
node scripts/verify-effect-docs.mjs \
  /tmp/pandwind-effect-baseline/apps/web/dist/client \
  /tmp/pandwind-effect-tw/apps/web/dist/client \
  /tmp/pandwind-effect-css/apps/web/dist/client \
  /tmp/pandwind-effect-design/apps/web/dist/client \
  /tmp/pandwind-effect-parity.json
```

The committed verifier is the source of truth for the pinned source revision,
exact route-set, per-file linked CSS hashes, per-route inline CSS lengths, SSR,
browser, hydration, and screenshot gates; `/tmp/pandwind-effect-parity.json`
is a regenerable local artifact and is not committed.
