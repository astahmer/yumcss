# Installed Panda website proof

Date: 2026-09-09

This is a disposable host-project proof for the pinned Panda repository at
commit `8a71bff3dc805e247be70d120cf485c8f14f104b`. The runner copies
`panda/website` into isolated source and target directories, builds the source,
runs the Panda project migration on the target, and then builds and serves both
copies. The pinned reference checkout is never modified.

Run it locally with:

```sh
pnpm run pivot:proof:installed:panda:website
```

Add `-- --keep` when a failed proof needs its disposable source and target
directories retained for inspection. The runner links the checked-out, built
Pandwind package into the isolated target because Pandwind is not published;
the smaller `panda-installed-proof.json` fixture separately proves a local
file dependency through package installation.

## Current result

The current evidence is in
[`panda-website-installed-proof.json`](./panda-website-installed-proof.json).

| Dimension                    | Result                                                                   |
| ---------------------------- | ------------------------------------------------------------------------ |
| Migrated source files        | 159 scanned, 87 changed                                                  |
| Converted Panda calls        | 154 `css()` calls and 86 factory elements                                |
| Typed residuals              | 5 (`dynamic`: 3, `unknown-value`: 2)                                     |
| Remaining Panda imports      | 0                                                                        |
| Source and target typecheck  | passed                                                                   |
| Source and target Next build | passed; 200 prerendered routes                                           |
| SSR HTTP proof               | 200 routes; source and target status/body checks passed                  |
| RSC proof                    | 98 routes returned non-empty `text/x-component` streams                  |
| Browser proof                | 98 routes rendered equivalent visible text; `/` and `/showcase` included |
| CSS size                     | 88,977 bytes source; 82,798 bytes target                                 |

The browser comparison uses visible `innerText` with whitespace removed. This
keeps the check about rendered content while allowing atomic CSS to change
layout-dependent line breaks between navigation labels and prose. Page errors,
unignored console errors, HTTP failures, empty bodies, route-set changes, and
empty RSC responses fail the proof. The report records known Next prefetch
noise separately: Panda's external `pandamastery.com` link and failed resource
prefetch messages never count as application errors.

The five residuals are preserved and reported rather than silently discarded.
They come from dynamic or unknown Panda values that cannot be proven equivalent
from the generated theme metadata. This proof therefore demonstrates that the
converted website still builds and renders, while the residual report remains
the concrete follow-up list for semantic parity.

Exhaustive route-by-route RSC and streaming parity is intentionally recorded as
an additional signal here; promotion of the adapter still depends on the
route-level proof policy in the codemod catalog and the existing fixture proof.
